# 客户端发起自动探索改造方案

> 状态：Draft
> 日期：2026-08-04
> 适用范围：WeWorker 客户端、WebCLI Bridge、Chrome 扩展自动探索与 Adapter 生成链路

## 1. 背景

当前自动探索的用户入口位于 Chrome 扩展 Popup/Side Panel 中，探索执行、Site Memory 保存、Adapter 生成以及生成进度展示也主要由扩展发起。

目标产品形态是：用户在 WeWorker 客户端选择目标网站并发起探索，客户端展示完整的探索、生成、验证和发布流程；Chrome 扩展继续存在，负责必须在浏览器现场完成的操作。

本次改造不是移除插件探索能力，而是调整产品入口和职责边界：

- WeWorker 客户端成为普通用户的主要操作入口。
- Chrome 扩展成为浏览器侧执行器，同时保留现有入口作为兼容和开发调试能力。
- WebCLI Bridge 继续作为客户端、生成服务和扩展之间的通信枢纽。
- 现有 Adapter、Skill、Site Memory 和生成任务格式保持兼容。

## 2. 改造目标

1. 用户可以在 WeWorker 客户端发起、查看、取消和恢复自动探索任务。
2. 插件继续负责 Tab、CDP、页面刷新、Fetch/XHR 捕获、登录态和浏览器工具执行。
3. 客户端展示从探索到发布的完整状态，不要求用户打开扩展页面。
4. 复用现有 Generation Harness 完成生成、静态验证、运行验证和发布。
5. 新旧入口在灰度期间并行可用，客户端入口可以通过功能开关关闭。
6. 改造不得影响聊天、现有 Adapter 调用、插件探索、Skill 热加载和手动录制等已有功能。

## 3. 非目标

本次改造不包含以下内容：

- 不把浏览器网络捕获、DOM/CDP 操作迁移到 Electron 或 Backend。
- 不移除插件 Popup/Side Panel 的现有探索入口。
- 不修改现有 Adapter、Skill 或 Site Memory 的文件格式。
- 不重新实现一套 Adapter 生成和验证引擎。
- 不自动执行写入、删除、审批、预订等有副作用的工具。
- 不在首期迁移插件 `chrome.storage.local` 中已经保存的 Site Memory。

## 4. 设计原则

### 4.1 增量接入

客户端入口作为新入口加入，旧插件入口保持不变。Bridge 新协议只做增量扩展，不改变已有消息的字段和语义。

### 4.2 单一业务实现

插件的 Popup/Side Panel 和客户端 Bridge 请求必须调用同一组探索服务函数，避免出现两套探索行为和两套修复逻辑。

### 4.3 浏览器现场留在插件

以下能力必须保留在 Chrome 扩展：

- 发现、选择和连接目标 Tab。
- 使用 CDP 刷新页面及监听网络。
- 捕获 Fetch/XHR 请求和响应。
- 读取当前登录态、Cookie 和页面上下文。
- 手动录制搜索、筛选、分页、详情等业务操作。
- 注入 Preview Adapter、调用浏览器工具并恢复正式 Adapter。
- 捕获工具执行过程中实际发出的请求。

### 4.4 可恢复、可观测、可回退

所有跨进程任务必须带 `taskId` 或 `runId`。客户端关闭、Bridge 短暂断连后，可以重新查询任务状态。客户端入口由功能开关控制，关闭后用户仍可使用插件入口。

## 5. 目标架构

```text
WeWorker Renderer
  ├─ 选择目标网站或 Chrome Tab
  ├─ 发起/取消/恢复探索
  └─ 展示探索、生成、验证和发布结果
          │ HTTP + SSE
          ▼
WeWorker Backend
  ├─ Exploration Coordinator
  ├─ 客户端任务视图
  ├─ 错误归一化
  └─ Bridge RPC Client
          │ WebSocket
          ▼
WebCLI Bridge
  ├─ 请求路由与关联
  ├─ Generation Harness
  └─ 生成任务持久化
          │ WebSocket
          ▼
Chrome 扩展
  ├─ Tab/CDP/页面刷新
  ├─ Fetch/XHR 被动捕获
  ├─ Site Memory
  ├─ Preview Adapter 注入
  ├─ 查询工具运行验证
  └─ Adapter 刷新
```

插件旧入口继续走同一业务内核：

```text
Popup / Side Panel
        │ chrome.runtime.onMessage
        ▼
Extension Explore Service
```

客户端新入口的调用链为：

```text
WeWorker → Backend → Bridge → Extension Explore Service
```

## 6. 职责划分

| WeWorker 客户端与 Backend | Chrome 扩展 |
|---|---|
| 展示插件和 Bridge 就绪状态 | 上报版本与能力列表 |
| 展示和选择可探索页面 | 查询可探索 Tab 及页面信息 |
| 创建客户端探索任务 | 执行被动探索 |
| 展示阶段、进度和异常 | 刷新页面并捕获 Fetch/XHR |
| 发起保存、生成、取消和发布 | 保存 Site Memory |
| 展示工具及验证报告 | 注入 Preview Adapter 并执行安全查询工具 |
| 对比探索基线和工具实际请求 | 返回真实请求、响应和页面上下文 |
| 安装和热加载 Skill | 刷新目标 Tab 中的 Adapter 注册 |

## 7. 现有能力复用

### 7.1 扩展探索工作流

现有探索实现位于 `extension/background/service-worker.js`，正式自动探索已经采用被动捕获策略：刷新页面并捕获初始化阶段的 Fetch/XHR，不主动向搜索框输入内容，也不自动点击分页或详情。

客户端接入后必须复用该实现，不能在 Backend 中重新模拟探索。

### 7.2 Generation Harness

现有 Generation Harness 已提供：

- 隔离草稿目录和任务状态持久化。
- JavaScript、manifest、support files 和工具注册等静态验证。
- 最多两轮受限自动修正。
- Preview Adapter 临时注入和正式 Adapter 恢复。
- 高置信度只读工具真实调用。
- 基础输出契约、登录页、敏感字段和超时检查。
- 发布前目录指纹冲突保护。
- 发布成功后的 Adapter 更新广播。

客户端应直接复用现有消息：

```text
start_generation_run
get_generation_run
cancel_generation_run
publish_generation_run
generation_run_event
```

客户端只负责发起和展示，不创建第二套生成器。

### 7.3 Adapter 和 Skill 热加载

生成发布后继续复用现有 `adapter_scaffold_generated` 广播、Adapter 缓存刷新和 Skill 安装链路，保证用户无需重启 WeWorker 即可在新对话中使用新网站 Skill。

## 8. 分阶段实施方案

### 阶段 0：冻结当前行为基线

实施前建立并保存基线测试结果，覆盖：

- Popup 和 Side Panel 的被动探索。
- Site Memory 保存和读取。
- 快速 Scaffold 生成。
- 智能生成、取消、恢复、验证和发布。
- Preview Adapter 注入及正式 Adapter 恢复。
- 生成后目标 Tab 的 Adapter 刷新。
- Adapter/Skill 热加载。
- 插件手动操作录制。
- 客户端聊天和现有 Adapter 工具调用。

使用 `todo.example.com` 作为固定回归样例。探索基线为：

```text
GET /api/todo/list?pageSize=30&pageIndex=1
```

生成工具的实际请求不得额外包含 `search`。

### 阶段 1：增加协议能力声明

扩展握手在保持旧字段不变的前提下增加能力列表，例如：

```json
{
  "type": "extension_hello",
  "version": "x.y.z",
  "capabilities": [
    "passive_exploration_v1",
    "generation_harness_v1",
    "runtime_validation_v1"
  ]
}
```

客户端必须按能力而不是仅按版本号判断是否展示探索入口。

新客户端连接旧插件时，其他功能保持正常，仅禁用客户端探索并提示升级插件。

### 阶段 2：抽取插件探索服务

从消息处理器中抽取可复用的应用服务函数，例如：

```js
startExploration(options)
getExplorationState(taskId)
cancelExploration(taskId)
saveExplorationMemory(taskId)
startGeneration(siteKey, options)
getGeneration(runId)
cancelGeneration(runId)
publishGeneration(runId)
```

两类入口共享这些函数：

- `chrome.runtime.onMessage` 服务现有插件 UI。
- Bridge 消息服务客户端入口。

抽取完成后先运行全部插件回归，确认插件 UI 行为没有变化，再接入客户端。

### 阶段 3：增加客户端探索 Bridge 协议

建议新增以下消息，不复用带 `popup_` 前缀的内部消息：

```text
exploration_list_tabs
exploration_start
exploration_get
exploration_cancel
exploration_save_memory
exploration_event
```

每个请求至少包含：

```json
{
  "id": "request-id",
  "taskId": "exploration-task-id",
  "tabId": 123,
  "siteKey": "todo.example.com"
}
```

约束：

- `id` 用于单次 RPC 请求和响应关联。
- `taskId` 用于探索任务幂等、恢复和事件归属。
- 插件拒绝同时控制同一个 Tab 的多个探索任务。
- 客户端必须显式传递或确认目标 Tab，不能隐式探索任意活动页面。
- 协议响应不得包含 Cookie、票据、Authorization 等敏感信息。

### 阶段 4：Backend 增加请求型 Bridge Client

当前 `bridge-status.ts` 的职责是只读监控，不应直接扩展成同时承担全部 RPC 的大类。建议新增独立 `BridgeRpcClient`，负责：

- 请求/响应关联。
- 超时和取消。
- Bridge 重连。
- 插件断连感知。
- 探索和生成事件订阅。
- 未完成请求清理。

Backend 增加：

```text
GET    /exploration/capabilities
GET    /exploration/tabs
POST   /exploration/runs
GET    /exploration/runs/:taskId
POST   /exploration/runs/:taskId/cancel
POST   /exploration/runs/:taskId/save
POST   /exploration/runs/:taskId/generate
GET    /generation-runs/:runId
POST   /generation-runs/:runId/cancel
POST   /generation-runs/:runId/publish
```

探索和生成进度通过现有 SSE `/events` 推送，客户端仅在断线恢复时主动查询，避免长期轮询。

所有接口继续通过现有本地 HTTP Token 鉴权。

### 阶段 5：客户端增加探索页面

建议把入口放在客户端网站/工具能力区域，流程如下：

1. 检查 Backend、Bridge 和插件状态。
2. 获取并展示可探索的 Chrome Tab。
3. 用户确认目标 Tab。
4. 创建探索任务并启动被动捕获。
5. 展示捕获的接口、method、path、query 和 body 摘要。
6. 保存 Site Memory。
7. 启动生成和自动验证。
8. 展示验证结果与待手动验证项目。
9. 用户确认后发布并安装 Skill。

客户端状态建议统一为：

```text
idle
preparing
exploring
explore_completed
generating
static_validating
runtime_validating
awaiting_approval
publishing
completed
failed
cancelled
needs_user_input
```

客户端关闭不应自动取消任务；重新打开后使用 `taskId` 或 `runId` 恢复。

### 阶段 6：完善请求级自动验证

在现有运行验证上增加工具实际请求与探索基线的对比：

- HTTP method 是否一致。
- pathname 是否一致。
- query key/value 是否多出、缺失或改变。
- request body 的字段和值是否一致。
- 是否出现 HTTP 错误或业务错误。
- JSON 是否可解析。
- 响应结构是否符合探索证据。

验证状态至少包括：

```text
通过
请求参数不一致
响应异常
待手动验证
```

只允许自动执行满足以下条件的工具：

- 明确属于只读查询。
- 风险分类置信度达到设定阈值。
- 测试参数可从探索证据安全构造。
- 不包含敏感字段或高风险业务动作。

写入、删除、审批、预订等工具只做 Schema 和注册验证，并标记为“待手动验证”。

### 阶段 7：灰度和入口收敛

建议分三个版本上线：

1. 客户端入口仅通过开发功能开关开启，插件入口完全保留。
2. 小范围用户默认显示客户端入口，插件入口继续可用。
3. 客户端成为主入口，插件探索 UI 标记为“开发调试”。

至少稳定两个版本后，再评估是否精简插件 UI。插件后台执行能力不得删除。

## 9. 状态与错误处理

### 9.1 任务恢复

- 探索任务使用客户端生成的 `taskId`。
- 生成任务继续使用 Harness 的 `runId`。
- 客户端重启后从 Backend 查询任务状态。
- Bridge 重连后重新订阅事件并查询最终状态。
- 重复提交相同 `taskId` 不得启动第二个探索任务。

### 9.2 标准错误

建议统一以下错误码：

```text
BRIDGE_DISCONNECTED
EXTENSION_DISCONNECTED
EXTENSION_CAPABILITY_MISSING
TARGET_TAB_NOT_FOUND
TARGET_TAB_CLOSED
TARGET_TAB_CHANGED
PAGE_LOGIN_REQUIRED
EXPLORATION_ALREADY_RUNNING
EXPLORATION_TIMEOUT
GENERATION_FAILED
RUNTIME_VALIDATION_FAILED
ADAPTER_CHANGED_DURING_GENERATION
```

客户端必须展示可执行的处理建议，不能只显示“操作失败”。

## 10. 兼容性矩阵

| 客户端 | 插件 | 预期行为 |
|---|---|---|
| 旧客户端 | 新插件 | 所有旧功能正常 |
| 新客户端 | 旧插件 | 聊天和工具正常；客户端探索禁用并提示升级插件 |
| 新客户端 | 新插件 | 客户端完成探索、生成、验证和发布 |
| 客户端关闭 | 新插件 | 插件原有入口继续正常使用 |
| Bridge 重启 | 探索进行中 | 明确暂停、失败或恢复，不能静默卡住 |
| 目标 Tab 关闭 | 探索进行中 | 明确提示重新选择页面 |

## 11. 测试方案

### 11.1 单元测试

- Bridge RPC 请求/响应关联和超时。
- `taskId` 幂等和同 Tab 并发保护。
- 能力协商及旧插件降级。
- 探索状态转换。
- 敏感字段脱敏。
- 请求基线对比逻辑。
- 只读/写操作风险分类门禁。

### 11.2 集成测试

- Client → Backend → Bridge → Extension 完整调用链。
- 插件 UI 与客户端入口调用同一探索服务。
- Bridge 或插件断线后的错误与恢复。
- 客户端关闭后重新打开并恢复任务。
- 生成发布后 Adapter 刷新和 Skill 热加载。

### 11.3 回归测试

- Popup 和 Side Panel 原入口。
- 手动操作录制。
- 快速生成和智能生成。
- 生成任务取消、恢复和发布。
- 现有 Adapter 的注册和调用。
- 客户端聊天、附件、设置和站点能力页面。
- 旧 Site Memory 的读取和生成。
- 客户端不重启即可使用新 Skill。

### 11.4 `todo.example.com` 固定用例

探索基线：

```text
GET /api/todo/list?pageSize=30&pageIndex=1
```

必须断言：

- 工具实际请求包含 `pageSize=30`。
- 工具实际请求包含 `pageIndex=1`。
- 工具实际请求不包含 `search`。
- 响应可解析且结构符合探索样本。
- 验证结果在客户端可见。

## 12. 上线门禁

以下条件全部满足后，客户端入口才能默认开启：

- 兼容性矩阵全部通过。
- 插件原有探索和生成测试无新增失败。
- 客户端聊天和工具调用测试无新增失败。
- 新旧入口对同一页面产生等价的探索证据。
- 生成后新 Adapter 无需重启客户端即可使用。
- 查询工具自动验证只执行被判定为安全的只读调用。
- 所有失败均有明确状态、错误码和用户提示。
- 功能开关可以即时关闭客户端入口。

## 13. 回退方案

- 使用 `client_exploration_enabled` 控制客户端入口。
- 关闭开关后，插件 Popup/Side Panel 仍可完成原流程。
- 新 Bridge 消息为增量协议，旧消息不删除、不改名。
- 首期不迁移或删除插件 Site Memory。
- 不修改 Adapter、Skill 和 Generation Run 的持久化格式。
- 客户端探索异常不得阻断正常聊天和现有工具调用。
- 发布前保留 Adapter 目录指纹检查和 backup，避免覆盖人工修改。

## 14. 建议提交拆分

为便于审查和回退，建议按以下顺序独立提交：

1. 基线测试和协议能力声明。
2. 插件 Explore Service 抽取，不改变行为。
3. Bridge 探索协议和 Backend RPC Client。
4. Backend REST/SSE 接口。
5. 客户端探索页面和功能开关。
6. 请求级自动验证与 `todo.example.com` 回归。
7. 文档、遥测和灰度配置。

每个提交都必须能够独立运行现有测试；不得以“后续提交会修复”为理由合入中间不可用状态。

## 15. 实施前置事项

- 确认最终开发分支后再开始业务代码改造。
- 保存基线测试结果和已知失败列表，避免把既有失败误判为本次回归。
- 明确客户端探索入口的产品位置和功能开关默认值。
- 明确最低插件能力，而不是只依赖插件版本号。
- 安全问题独立跟踪：Site Memory、manifest、事件和日志中不得保存或返回登录票据、Cookie、Authorization 等敏感数据。
