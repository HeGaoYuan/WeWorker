# Adapter 适配器

Adapter 是 WeWorker 操作特定网站的“技能包”。每个 Adapter 会向 WeWorker 暴露一组结构化工具，让 AI 能够在用户确认边界内操作对应的网站。

## 当前内置支持

首次公开版本已内置一批常用网站 Adapter：

- 邮件：QQ 邮箱、163 邮箱
- 电商：京东、闲鱼、1688
- 代码托管：GitHub、Gitee
- 内容与社区：小红书、B 站、知乎、掘金、贴吧、V2EX、豆瓣、36氪
- 社交媒体：微博、Twitter/X
- 阅读与信息：微信读书、雪球
- 招聘：BOSS 直聘

还支持携程、12306、前程无忧、有道云笔记、大众点评、抖音、Hacker News、Wikipedia、今日头条、什么值得买、arXiv、诺诺网发票、Gmail 等网站。

不同 Adapter 的能力边界不同：公开读取类能力通常可以直接返回结构化结果；点赞、收藏、发布、删除、购买、支付、投递等会产生外部影响的操作必须经过用户确认。完整状态以仓库中的 `docs/ADAPTERS.md` 为准。

## 编写自定义 Adapter

### 基本结构

```js
window.__webmcpRegister({
  name: 'My Site Adapter',
  tools: [
    {
      name: 'mysite.com.do_something',
      description: '执行某个操作的描述，AI 会根据这段描述决定何时调用此工具',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '查询内容',
          },
        },
        required: ['query'],
      },
      handler: async ({ query }) => {
        // 在这里操作 DOM
        const el = document.querySelector('.result')
        return { data: el?.textContent }
      },
    },
  ],
})
```

### 工具命名规范

工具名格式：`{domain}.{action_name}`

- `domain` 是网站的主域名，如 `jd.com`、`mail.163.com`
- `action_name` 用下划线分隔的动词短语，如 `get_orders`、`search_emails`

### Handler 注意事项

Adapter 运行在 Chrome 扩展的 isolated world 中：

- ✅ 可以访问和操作 DOM（`document.querySelector` 等）
- ✅ 可以使用 `fetch` 发起网络请求
- ❌ 无法访问页面的 JavaScript 变量（如页面全局变量）
- ❌ 无法使用 `import`/`require`

## 特殊参数：file_path（文件上传）

需要文件上传功能时，工具参数中定义 `file_path`（本地文件的绝对路径）。handler 先通过 DOM 操作找到页面上的 `<input type="file">` 元素，然后返回一个 `__cdp_action` 对象：

```js
handler: async ({ file_path }) => {
  // 1. 先完成所有 DOM 操作（点击按钮、打开弹窗等）
  const uploadBtn = document.querySelector('.upload-btn')
  if (!uploadBtn) return { error: '未找到上传按钮' }
  uploadBtn.click()
  await sleep(500)

  // 2. 找到 file input 元素
  const fileInput = document.querySelector('input[type="file"]')
  if (!fileInput) return { error: '未找到文件上传控件' }

  // 3. 返回 CDP action
  return {
    __cdp_action: 'set_file_input',
    selector: 'input[type="file"]',
    files: [file_path],
  }
}
```

### 扩展如何处理 CDP action

Chrome 扩展的后台脚本（service-worker）是扩展的核心逻辑，负责接收 AI 的工具调用请求、路由到对应的 tab、以及处理特殊 action。

当 service-worker 收到 handler 返回的 `__cdp_action: 'set_file_input'` 时，会通过 Chrome 的 `chrome.debugger` API 在浏览器内核层面完成文件设置：

1. 临时 attach 到目标 tab
2. 找到 file input 节点
3. 直接设置文件，绕过所有 JS 安全限制
4. 立即 detach

> 注意：CDP 操作时浏览器顶部会短暂出现"正在调试此浏览器"提示条，attach 后立即 detach 可以最小化影响。

## registry.json

`registry.json` 是所有 adapter 的注册表，扩展通过它判断当前页面是否有可用的 adapter。

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识，同时是 JS 文件名（不含 `.js`） |
| `name` | `string` | 英文显示名称 |
| `description` | `string` | 英文功能描述 |
| `match` | `string[]` | 域名匹配列表，只填 hostname，支持子域名匹配 |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `homepage_url` | `string` | AI 打开网站时使用的完整 URL，需要特殊端口或路径时必填 |
| `requires_auth` | `boolean` | 是否需要登录，设为 `true` 时 AI 会先检测登录状态 |
| `except` | `string[]` | 排除的子域名 |
| `i18n` | `object` | 国际化，支持 `zh`，包含 `name` 和 `description` |
| `quick_prompts` | `string[]` | 旧版快速尝试任务字段，保留兼容 |
| `scenarios` | `object[]` | 用户可见场景；欢迎页和场景总览优先使用其中的 `prompts` 作为可执行示例 |


**关于 `requires_auth`**：设为 `true` 后，系统会在 AI 的提示词中注明"打开该网站后需先检测登录状态"。为了让 AI 能真正执行检测，你还需要在 adapter JS 中实现一个名为 `{domain}.check_login_status` 的工具：

```js
{
  name: 'mysite.com.check_login_status',
  description: '检测是否已登录。打开网站后应首先调用此工具，未登录时提醒用户先登录。',
  parameters: { type: 'object', properties: {}, required: [] },
  handler: async () => {
    // 通过 DOM 判断登录状态，例如检查用户头像或登录按钮是否存在
    const isLoggedIn = !!document.querySelector('.user-avatar')
    return { logged_in: isLoggedIn }
  },
}
```
### 示例

```json
{
  "id": "jd.com",
  "name": "JD.com",
  "description": "JD.com: navigate, cart, orders, buy, pay",
  "match": ["jd.com", "pc-settlement-lite-pro.pf.jd.com"],
  "i18n": { "zh": { "name": "京东", "description": "京东：导航、购物车、订单、购买、支付" } },
  "scenarios": [
    {
      "id": "cart",
      "title": "查看购物车",
      "summary": "打开京东购物车并查看当前商品",
      "prompts": [
        {
          "text": "帮我看看购物车里有什么",
          "reply": "我会打开京东购物车，先确认页面和登录状态。"
        }
      ]
    }
  ]
}
```

## 添加自定义 Adapter

如果你想为某个网站编写 Adapter 并在 WeWorker 中使用，需要完成以下三步。

### 第一步：编写 JS 文件

推荐将自定义 Adapter 放在用户级目录，避免应用升级时覆盖安装目录中的文件：

- **macOS / Linux**：`~/.weworker/adapters/mysite.com/`
- **Windows**：`%USERPROFILE%\.weworker\adapters\mysite.com\`

目录内至少包含 `manifest.json` 与 `index.js`。文件内容参考上方“基本结构”示例。

### 第二步：注册到 registry.json

用户级 Adapter 由 WebCLI Bridge 和浏览器扩展按目录发现，不需要修改安装包内置的 `extension/adapters/index.json`。如果维护的是仓库内置 Adapter，则需要在对应 PR 中同步更新 Adapter manifest、构建 Profile 和文档清单。

### 第三步：重新加载扩展

1. 打开 Chrome，进入 `chrome://extensions/`
2. 找到 WeWorker Browser Adapter，点击刷新图标
3. 打开目标网站，扩展图标变绿说明 Adapter 已加载成功

> 注意：如果你为了临时调试修改安装目录下的扩展文件，应用更新后这些文件可能被覆盖。长期自定义 Adapter 应放在用户级目录。
