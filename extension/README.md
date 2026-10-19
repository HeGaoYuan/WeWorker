# WeWorker 浏览器扩展

Chrome 扩展（Manifest V3），将网站操作封装为工具供 AI Agent 调用。当用户打开网页时，扩展自动注入对应的适配器，注册工具到 Bridge，使 CLI 和桌面端可以通过 AI 驱动网页操作。

## 目录结构

```
extension/
├── manifest.json          扩展配置（声明入口脚本和权限）
├── background/
│   └── service-worker.js  Service Worker：后台进程
├── content/
│   └── injector.js        Content Script：页面注入脚本
├── adapters/              构建产物目录（构建时生成，源码中不存在）
│   ├── index.json         扩展启动初始化用 Adapter ID 清单（恒为空）
│   └── registry.json      旧版兼容清单（恒为空）
├── popup/                 扩展弹窗 UI
├── sidepanel/             侧边栏 UI
└── icons/                 扩展图标
```

当前内置 Adapter 包源码位于仓库根目录 `adapters/<domain>/`，并由 `weworker/build-profile.json` 控制是否进入默认构建。构建时 Adapter 以 host-managed 包形式经 Bridge 下发，不随扩展内置；扩展内的 `adapters/index.json` 与 `adapters/registry.json` 由 `weworker/scripts/prepare-build.cjs` 构建时生成（恒为空清单），不要手工维护。

## Chrome 扩展的运行模型

Chrome 扩展没有 main 函数，而是由 Chrome 浏览器根据 `manifest.json` 的声明，在不同时机启动不同脚本。这是 Chrome 扩展开发的标准做法。本扩展只用了两种脚本：

### Service Worker — 后台进程

在 `manifest.json` 中声明：

```json
{
  "background": {
    "service_worker": "background/service-worker.js"
  }
}
```

Chrome 在扩展安装后自动启动 Service Worker，并按以下规则管理它的生命周期：
- **事件驱动**：当有事件发生时（tab 打开/关闭/更新、收到消息、定时器触发等），Chrome 唤醒 Service Worker 执行对应的事件监听回调
- **空闲挂起**：没有事件时 Chrome 会挂起 Service Worker，释放内存；下次事件到来时再唤醒重新执行——但内存中的变量会丢失
- **不是常驻进程**：不能像 Node.js 一样写 while 循环，只能通过事件监听器响应 Chrome 的调用

本扩展中 Service Worker 监听的关键事件：

| Chrome 事件 | 触发时机 | 本扩展的处理 |
|-------------|----------|-------------|
| `chrome.tabs.onUpdated` | 用户打开或刷新网页 | 检测 URL，注入对应的适配器脚本 |
| `chrome.runtime.onMessage` | 收到其他脚本发来的消息 | 处理工具注册上报、工具调用请求 |
| WebSocket `onmessage` | 收到 Bridge 转发的消息 | 路由工具调用到对应 tab |
| `chrome.alarms.onAlarm` | 定时器触发（每 24 秒） | 检查 WebSocket 连接，断线重连 |

### Content Script — 页面注入脚本

在 `manifest.json` 中声明：

```json
{
  "content_scripts": [{
    "matches": ["*://ticket.example.com/*", "*://*.ticket.example.com/*"],
    "js": ["content/injector.js"]
  }]
}
```

Chrome 在用户打开白名单内的 adapter 站点时，自动将 Content Script 注入到页面中：
- **自动注入**：当页面 URL 匹配 `matches` 规则时，Chrome 在页面加载时自动执行声明的 JS 文件
- **可以操作 DOM**：Content Script 运行在页面环境内，可以读写页面的 DOM 元素
- **与页面 JS 隔离**：Content Script 在 isolated world 中运行，不能访问页面自身的 JS 变量和函数，页面 JS 也看不到 Content Script 定义的内容
- **每个 tab 独立**：每个打开的 tab 都有自己的一份 Content Script 实例，互不影响

Content Script 与 Service Worker 之间通过 Chrome 消息 API 通信：
- Content Script → Service Worker：`chrome.runtime.sendMessage()`
- Service Worker → Content Script：`chrome.tabs.sendMessage(tabId, ...)`

## 核心工作流程

### 适配器注册：页面打开时自动完成

```
用户打开 https://ticket.example.com
       │
       ▼
① Chrome 自动将 injector.js 注入该页面（manifest 声明 adapter 域名白名单）
   └─ injector.js 在页面上暴露 window.__webmcpRegister 函数
       │
       ▼
② Chrome 触发 Service Worker 的 onUpdated 事件
   └─ Service Worker 检测到 tab 加载完成
   └─ 根据 URL 匹配到适配器 ticket.example.com
   └─ 通过 chrome.scripting.executeScript 将适配器 JS 注入该 tab
       │
       ▼
③ 适配器代码在页面中执行
   └─ 调用 window.__webmcpRegister({ tools: [...] })
       │
       ▼
④ Injector 收到注册调用
   └─ 把每个工具的 handler 函数存在本地 Map 中（留在页面内，因为只有页面能操作 DOM）
   └─ 把工具的元数据通过 chrome.runtime.sendMessage 发送给 Service Worker
       │
       ▼
⑤ Service Worker 收到 register_tools 消息
   └─ 记录：域名 "ticket.example.com" 有 N 个工具，关联到 tab #42
   └─ 扩展图标显示绿色 Badge，数字表示工具数量
```

### 工具调用：AI 操控网页的完整链路

```
CLI/桌面端发起：webcli call ticket.example.com.search_tickets --args '{"keyword":"示例"}'
       │
       ▼
① Bridge 通过 WebSocket 转发给 Service Worker
       │
       ▼
② Service Worker 查注册表，找到域名 "ticket.example.com" 对应的 tab
   └─ 激活该 tab（让用户看到操作过程）
   └─ 通过 chrome.tabs.sendMessage 向该 tab 发送调用消息
       │
       ▼
③ Injector 收到 call_tool 消息
   └─ 从本地 Map 查找 handler 函数
   └─ 执行 handler(args) → 操作 DOM（点击、填写表单、读取内容...）
   └─ 返回结果
       │
       ▼
④ 结果沿原路返回：Injector → Service Worker → Bridge → CLI/桌面端
```

### Service Worker 挂起恢复

Chrome 会在空闲时挂起 Service Worker，内存中的注册表会丢失。恢复方式：
- Service Worker 唤醒后，向所有 tab 发送 `resync_tools` 消息
- 各 tab 的 Injector 收到后，重新把工具元数据上报一遍
- 注册表恢复完整

同时通过 `chrome.alarms` 每 24 秒触发一次 keepAlive 检查，如果 WebSocket 断开则立即重连。

## 适配器格式

当前内置 Adapter 使用根目录 v2 包结构：

```
adapters/<domain>/
├── manifest.json
└── extension/
    ├── commands/
    └── internal/
```

历史单文件适配器通过 `window.__webmcpRegister()` 注册；迁移到 v2 包后，每个命令由 `manifest.json` 的 `commands[].module` 指向对应模块。

```javascript
window.__webmcpRegister({
  name: "example-ticket-adapter",
  match: ["ticket.example.com"],
  tools: [
    {
      name: "ticket.example.com.search_tickets",
      description: "搜索示例记录",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string" }
        }
      },
      handler: async (args) => {
        // DOM 操作逻辑
        return { items: [...] };
      }
    }
  ]
});
```

关键规则：
- 工具名格式：`<domain>.<action>`，如 `jd.com.search_products`
- handler 运行在 isolated world，只能操作 DOM，不能访问页面 JS 变量
- 声明 `internal: true` 的工具只注册 handler 不暴露给 AI
- 声明 `tabDomain` 可强制路由到其他域名的 tab（如支付工具需找结算页）

### 适配器元数据 (`manifest.json`)

```json
{
  "id": "ticket.example.com",
  "name": "Example Tickets",
  "description": "示例站点：搜索和查看记录",
  "match": ["ticket.example.com"],
  "requires_auth": true,
  "auth_check_tool": "ticket.example.com.check_login_status",
  "quick_prompts": ["搜索示例记录"]
}
```

`match` 字段支持子域名匹配：`match: ["jd.com"]` 同时匹配 `www.jd.com`、`order.jd.com` 等。

## 添加自定义适配器

1. 创建 `adapters/mysite.com/manifest.json`，使用 `schema_version: 2` 声明命令、运行时、参数和安全边界。
2. 在 `adapters/mysite.com/extension/commands/` 与 `extension/internal/` 中实现命令逻辑。
3. 在 `weworker/build-profile.json` 中添加域名 `"mysite.com"`，决定是否进入默认桌面端构建。
4. 运行配置/构建检查后，在 `chrome://extensions/` 重新加载构建后的扩展运行目录，并刷新目标网站页面。

可参考现有公开适配器（如 `jd.com`、`mail.163.com`、`xiaohongshu.com`）的实现。
