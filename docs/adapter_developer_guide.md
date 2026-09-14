# WebMCP Adapter 开发者指南

## 1. 什么是 WebMCP Adapter？

WebMCP Adapter 是一套允许 AI 大模型（通过 Model Context Protocol）与特定网站进行深度原生交互的机制。通过编写 Adapter，你可以让 AI 安全、稳定地操作网页 DOM，实现自动填表、数据抓取、点击导航等“拟人化”的复杂网页流程。

由于很多现代网站包含复杂的结构（如 React/Vue 虚拟 DOM、动态异步加载或严格的表单验证拦截），AI 直接通过通用浏览器宏操作很难精确命中目标。Adapter 运行在浏览器扩展的 **Isolated World（受隔离的内容脚本层）** 中，作为一个安全的“中间件”桥接了 AI 的意图和实际网页响应。

## 2. 核心架构与原理

WebMCP Adapter 生态主要由两部分协同工作：

*   **配置中心 (`registry.json`)**：这是总线注册表。扩展程序通过读取此文件来获知当前支持哪些网站，并在用户浏览器访问到对应 `match` 匹配规则的 URL 时，实时注入相应的 js 脚本。同时，这里也会向 AI 展示该 Adapter 具备什么能力（通过 `description` 等）。
*   **适配器脚本 (`{domain}.js`)**：具体的执行载体。它没有 ES6 的 `export/import`，因为它是一段被全量注入到当前页面的脚本。它利用页面原生的 `window.__webmcpRegister` 全局方法，向通信桥注册自己支持的 **Tools (工具箱)**。

## 3. 快速上手：创建一个最小 Adapter

假设我们要为 `example.com` 的待办事项应用开发一个 Adapter。

### Step 1: 注册路由 (`registry.json`)

在你代码库的 `extension/adapters/registry.json` 中的 `adapters` 数组追加一项：

```json
{
  "id": "example.com",
  "name": "Example Todo",
  "description": "Example.com 的待办事项管理：读取列表、添加任务",
  "author": "your_name",
  "match": [
    "example.com"
  ],
  "requires_auth": true,
  "version": "2026-04-20T00:00:00Z"
}
```

### Step 2: 编写适配逻辑 (`example.com.js`)

在同目录下创建 `example.com.js`，包含 DOM 交互逻辑和 Tool 注册：

```javascript
/**
 * Example Todo Adapter
 * 运行于 Isolated Content Script
 */

// --- 1. 业务辅助/DOM 操作函数 ---

// 模拟等待元素出现的辅助函数
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout`)); }, timeout);
  });
}

// 模拟触发 React/Vue 需要的文本输入事件
function setInputValue(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function addTodo(taskTitle) {
  try {
    const input = await waitForElement('#new-todo-input', 3000);
    setInputValue(input, taskTitle);

    // 模拟回车提交
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));

    return { status: 'success', taskTitle };
  } catch (e) {
    return { error: '未找到输入框，请确认当前停留在主页' };
  }
}

// --- 2. MCP Tools 注册中心 ---

window.__webmcpRegister({
  name: "example-todo-adapter",
  match: ["example.com"],
  tools: [
    {
      name: "example.com.add_todo",
      description: "向待办列表中添加一条新任务",
      parameters: {
        type: "object",
        properties: {
           taskTitle: { type: "string", description: "任务标题" }
        },
        required: ["taskTitle"],
      },
      handler: async ({ taskTitle }) => addTodo(taskTitle),
    }
  ]
});
```

---

## 4. API 参考规范

### `window.__webmcpRegister` 设置项
向大模型抛出的工具大闸，只接受一个对象参数。

*   `name` (String): Adapter Namespace ID。
*   `match` (Array): URL 命中规则，与 registry 严格保持一致。
*   `tools` (Array): WebMCP Tool 定义数组。
    *   `name`: 工具唯一调用名（建议格式：`域名.动词`）。
    *   `description`: **核心属性**，告诉 AI 在什么场景下该调用它。
    *   `parameters`: 遵循 JSON Schema 规范的参数声明。
    *   `handler`: 纯异步（`async`）方法，接收上层解包好的 JSON 对象作为入参，返回值为 JSON 对象，将会反馈给大模型观察侧。

---
