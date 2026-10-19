# Known Issues

已知问题列表。每个问题包含：描述、影响、当前规避方式、计划修复方案。

---

## Bridge 端口冲突：WebCLI CLI 与 WeWorker 桌面端同时使用时 BridgeManager 启动失败

**优先级**: Medium
**发现日期**: 2026-05-31
**相关文件**: `webcli/bridge.js`, `weworker/electron/managers.js`

### 描述

WebCLI 和 WeWorker 都会尝试在端口 3711 启动 WebSocket Bridge。如果一方已启动 bridge，另一方启动时 `BridgeManager` 会因 `EADDRINUSE` 报错退出（`process.exit(1)`）。

### 当前行为

WeWorker 的 `BridgeManager.start()` 始终无条件启动 bridge 子进程。若端口已被 WebCLI CLI 占用：
1. `BridgeManager` 子进程启动失败，状态标记为 `error`，日志输出 `FATAL: Port 3711 is already in use`
2. 但 `BridgeStatus`（WebSocket 客户端）会成功连接到已有的 bridge
3. 工具调用实际通过 `BridgeStatus` 的客户端连接走通，功能不受影响

因此**功能上是正常的**，但每次启动都会产生一条 FATAL 错误日志，`BridgeManager.status` 也不准确。

### 未覆盖的风险场景

1. `webcli service stop` 会杀掉 bridge → WeWorker 无感知，后续操作静默失败
2. WeWorker 退出时 `bridgeManager.stop()` 尝试杀已死掉的子进程 → 无实际影响但逻辑不清晰
3. bridge 意外崩溃时，WeWorker 无自动拉起机制

### 规避方式

- 先启动 WebCLI CLI（`webcli service start -d`），再启动 WeWorker → 功能正常
- 或只使用 WeWorker，不手动启动 WebCLI CLI → WeWorker 自己启动 bridge，无冲突

### 计划修复方案

1. **启动前探测复用**: `BridgeManager.start()` 先探测端口 3711，如果已有 bridge 在运行则直接复用，不再启动新进程
2. **引用计数**: bridge 侧维护客户端连接计数，`refCount=0` 且持续 N 秒无新连接时自动退出，避免孤儿进程
3. **心跳感知**: 客户端侧增加心跳检测，bridge 断连时通知上层并自动拉起
4. **优雅关停**: `webcli service stop` 检查 `refCount`，还有其他客户端连接时拒绝关闭或警告

---

## Adapter manifest.json 设计问题

**优先级**: Low
**发现日期**: 2026-06-01
**相关文件**: `adapters/*/manifest.json`, `extension/README.md`

### 描述

当前 adapter 目录下的 `manifest.json` 存在两个设计问题：

#### a. 文件名与 Chrome Extension 冲突

`manifest.json` 在 Chrome Extension 中有特殊含义（`extension/manifest.json` 是扩展本身的清单文件）。Adapter 目录下也叫 `manifest.json` 容易造成混淆，且部分工具/IDE 可能误识别。

#### b. 字段通用性不足

当前 `manifest.json` 中部分字段是为 WeWorker 客户端定制的，而非通用的 adapter 能力描述：

| 字段 | 问题 |
|------|------|
| `hidden` | 纯粹是 WeWorker 设置页面的展示控制，与 adapter 能力无关 |
| `enabled` | 客户端启停控制，不属于 adapter 定义 |
| `quick_prompts` | WeWorker 欢迎页内容，其他客户端（如 Claude Code）不需要 |
| `test_prompts` | 同上，测试用提示词 |

Adapter 的 manifest 应该只定义 adapter **本身的能力**（匹配什么网站、有什么工具、需要什么依赖），展示/启停策略应该由客户端自己管理。

### 当前行为

- 功能正常，但其他客户端无法理解这些字段
- 修改 UI 策略需要改所有 adapter
- 两个 `manifest.json` 在 IDE 中容易混淆

### 规避方式

- 目前无规避，开发时注意区分两个 manifest 文件

### 计划修复方案

1. **重命名**: 考虑将 adapter 的 `manifest.json` 重命名为 `adapter.json` 或 `webmcp.json`，需同步更新所有读取该文件的代码（service-worker.js、adapter-cli.js、skill-installer.js、adapter-parser.ts、prepare-build.cjs 等）
2. **字段分层**: 将字段分为两层：
   - **Adapter 能力层**（通用）：`match`、`requires_auth`、`auth_check_tool`、`support_files`、`except`、`homepage_url`
   - **客户端展示层**（WeWorker 特定）：`hidden`、`enabled`、`quick_prompts`、`test_prompts`
3. 客户端展示层可移到 WeWorker 自己的配置中，或以 `x-weworker-*` 扩展字段的形式存在

---

## WeWorker 桌面端内置工具与架构问题

**优先级**: Medium
**发现日期**: 2026-06-01
**相关文件**: `weworker/backend-ts/dist/tools.js`, `webcli/bridge.js`, `weworker/electron/managers.js`

### 描述

WeWorker 桌面端在内置工具设计和 Bridge/WebCLI 关系上存在三个待解决问题：

#### a. 内置工具数量合理性

当前 WeWorker 桌面端注册了大量内置 MCP 工具（open_browser、capture_screenshot、call_adapter_tool、list_files、ask_user、定时任务、文件加解密、企微发送等），部分工具可能不是核心场景必需的。需要评估哪些工具真正需要作为内置工具注册，哪些可以通过其他方式提供。

#### b. Bridge 与 WebCLI 的关系

WeWorker 桌面端同时存在两条与 Bridge 通信的路径：
- **BridgeClient**（WebSocket 直连 `ws://localhost:3711`）：`open_browser`、`call_adapter_tool` 等内置 MCP 工具通过此路径
- **Bash + webcli call**：AI Agent 通过 Bash 调用 `webcli call` 命令，也走同一条 Bridge

这两条路径功能重叠，但维护成本翻倍——每次新增工具需要同时实现 MCP tool 和 webcli call 两条链路。需要明确两者的分工和定位。

#### c. WebCLI CLI 与 WeWorker 同时使用时 Bridge 冲突

详见上方「Bridge 端口冲突」已知问题。核心是：WeWorker 启动的 Bridge（bridge.cjs/utilityProcess）和 WebCLI CLI 启动的 Bridge（node index.js）都抢占端口 3711，需要复用机制。

### 当前行为

- 功能可工作，但架构存在冗余
- Bridge 冲突时产生 FATAL 日志（详见上方问题）

### 规避方式

- 只使用 WeWorker 或只使用 WebCLI CLI，不同时使用
- 先启动 WebCLI CLI 再启动 WeWorker

### 计划修复方案

1. **工具精简**: 评估内置工具列表，非核心工具可改为 adapter 工具或按需加载
2. **统一通信路径**: 明确 BridgeClient 和 Bash+webcli 的分工——内置 MCP 工具走 BridgeClient（低延迟、无需外部 CLI），适配器工具走 Bash+webcli（保持与 Claude Code 一致）
3. **Bridge 复用**: BridgeManager 启动前探测已有 Bridge 进程并复用（详见上方修复方案）
