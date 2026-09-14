# 任务执行耗时优化设计文档

> 目标：在 WeWorker 客户端对话场景下，最大化整体任务完成速度。
> 现状观测：单次任务中约 **50% 时间花在大模型思考，50% 花在工具执行**。本文综合评估整体 adapter 链路，给出分层提速方案与落地路线图。

> **修订说明（基于代码核实）**：本版已逐条核实原文档引用的代码位置。主要变更：
> - **A2** 改动点重写（`open_browser` 非后端工具，等待信号落点在扩展端/webcli，后端无需改）。
> - **B1** 方向修正（SDK 已自动缓存 system prompt + 工具 schema；真正问题是 `buildPromptString` 把全量历史塞进单条 user message 导致输入 token 线性增长）。
> - **B4** 与 B1 解耦，独立为 P0。
> - **新增 B6**：`buildPromptString` 跨轮重建时丢弃 `tool_use`/`tool_result` 结构（正确性问题）。
> - **新增 P0.5 测量阶段**：B1/A1/A4 的收益判断均依赖基线数据，先量后改。
> - 1.2 耗时定位表中"固定 sleep 5s"与"未见 prompt caching"两条措辞修正。

---

## 1. 背景与现状

### 1.1 执行链路

一次对话的核心调用链：

```
用户消息
  └─ streamChat()                      backend-ts/src/agent.ts
       └─ Claude Agent SDK query()     每轮 spawn 一个 Claude Code 子进程
            └─ agent 循环（串行）：
                 思考(LLM 推理) → 发 tool_use → 执行工具 → 结果回灌 → 再思考 …
```

工具侧（`backend-ts/src/tools.ts`、`backend-ts/src/webcli-runner.ts`）暴露：

- `webcli_call`（no_bash 通道）或 `Bash → webcli call <tool>`（full 通道）：每次都 fork 一个全新 Node 子进程（`webcli-runner.ts:19`），再通过 bridge 与 Chrome 扩展通信驱动网页。
- MCP 工具：`ask_user`、`create_scheduled_task`、`list_files`、`send_file_to_user`、`check_file_encryption`、`decrypt_file` 等。
- 按站点 Skill（Markdown 文档），模型需先"激活 Skill"才能得知工具清单。

### 1.2 耗时定位（基于代码）

**LLM 思考侧（约 50%）**

| 现象 | 代码位置 | 影响 |
|---|---|---|
| 杂务轮次多：激活 Skill 读文档 → `TodoWrite` 建计划 → `open_browser` → 等 5s → `check_login_status` → 真正业务工具，干活前已 4~5 次推理 | `agent.ts:266`（Todo 规则）、`agent.ts:286`（登录检测规则） | 每轮 = 一次 agent loop 迭代 = 一次完整 LLM 推理 |
| 系统提示庞大：所有 adapter 的 auth 规则、黑名单、加密规则、Todo/状态行规则全揉一起 | `agent.ts:123 buildSystemPrompt` | 输入 token 多 → TTFT 慢、单价高 |
| **跨轮历史压成纯文本**：`buildPromptString` 把全部历史拼成单条 user message 塞进 `prompt`，且只保留 `text`/`file_attachment`，丢弃 `tool_use`/`tool_result` 结构 | `agent.ts:453 buildPromptString` | ① 输入 token 随轮次**线性增长**（每轮全量重处理）；② 多轮续接时模型看不到上轮工具结果（详见 B6）。**注：不影响单任务内的多步执行**（由 SDK 内部完整管理） |
| system prompt 与工具 schema 的缓存：SDK（Claude Code CLI）**已自动缓存**，无需手动配置 | `agent.ts:726 query({...})` | 真正问题不在"缓存缺失"，而在跨轮 token 体量增长（详见 B1） |

**执行侧（约 50%）**

| 现象 | 代码位置 | 影响 |
|---|---|---|
| 每次 `webcli call` 都 fork 新 Node 子进程，Windows 冷启动 ~150–500ms | `webcli-runner.ts:19 execFile(nodeBin, [webcliEntry, ...])` | 单任务十几次调用 → 1.5~5s 纯开销（bridge/扩展重连占比待实测） |
| system prompt 强制模型在 `open_browser` 后自主等待 ≥5s（**文字规则，非代码 `setTimeout`**），实际等待时长不可观测 | `agent.ts:213-216` | 每次打开站点白等 ~5s |
| 每个文件用前都要加密检查，每次 spawn `sd_decrypt.exe` | `agent.ts:230`（规则）、`tools.ts:274 check_file_encryption` | 多文件场景重复 spawn |
| `ask_user` 最长阻塞 5 分钟 | `tools.ts:149` | 等待用户时占位 |

---

## 2. 总体方案（分层）

按 **执行侧 / LLM 思考侧 / 编排与确定性回放** 三层组织，共 13 个方案（A 层 4 + B 层 6 + C 层 3）。每个方案给出：目标、改动点、预期收益、风险。

### A. 执行侧——立竿见影，几乎不动 LLM

#### A1. 常驻 webcli worker（消除每次 call 的 Node 冷启动）

- **目标**：把"每次 `webcli call` fork 一个 Node 子进程"改为"一个 work 会话内常驻一个 webcli 子进程"，通过 stdio 连续接收调用；bridge 与扩展的连接也保持整个会话不断开。
- **改动点**：`backend-ts/src/webcli-runner.ts`（改为 worker 池/常驻进程）、`agent.ts` 中会话生命周期管理（创建/销毁 worker）。
- **预期收益**：执行侧省 30%~60%（消除 Node 冷启动 + bridge 重连）。**收益上限待实测**（fork 开销确定，bridge 重连占比未量）。
- **风险**：worker 进程的状态隔离与内存泄漏需可控；异常崩溃要有自动重建；常驻 worker 意味着 webcli↔扩展的 bridge/nativeMessaging 转为**长连接**，需评估扩展端 `nativeMessaging` 生命周期与多 work 并发时的连接复用/隔离策略。
- **优先级**：★★★★★（影响大、改动集中、无 LLM 侧风险）

#### A2. 事件化取代固定 5s 等待

- **目标**：扩展端 adapter 注入并注册完工具后，回送 `tools_ready` 信号，`open_browser` 等到信号再返回，替代模型自主盲等 5s。
- **改动点**（已按代码核实重写；`open_browser` **不是后端工具**，后端 `tools.ts` 的 `webcli_call` 仅 `runWebcliCall()` 透传，full 通道走 Bash）：
  1. **扩展端**（`extension/content`、`extension/background`）：adapter 注入并注册完工具后，发送 `tools_ready` 事件。
  2. **webcli 侧** `open_browser` 实现：阻塞等待 `tools_ready` 信号再返回（超时兜底，如 8s）。
  3. **`agent.ts:213-216` system prompt**：删除「等待至少 5 秒」规则，改为「`open_browser` 返回即表示工具就绪，可直接调用后续工具」。
  4. **后端无需改动**（仅透传 webcli 输出）。
- **预期收益**：每次 `open_browser` 省 ~5s。
- **风险**：需保留超时兜底（避免信号丢失导致永久挂起）；扩展端事件通道需可靠。
- **优先级**：★★★★☆

#### A3. 加密检查结果缓存

- **目标**：按 `path + mtime` 缓存 `check_file_encryption` 结果（work 级），同文件不重复 spawn `sd_decrypt.exe`。
- **改动点**：`backend-ts/src/tools.ts` `check_file_encryption` 加 work 级 `Map` 缓存（key = `path + mtime`）。
- **预期收益**：多文件场景显著减少子进程 spawn。
- **风险**：`decrypt_file` 后文件内容变化、mtime 随之变化 → `path+mtime` key 自动失效，逻辑自洽；无需持久化，work 结束随 `Map` 释放。
- **优先级**：★★★★☆（改动极小、零风险，从 P1 提到 P0）

#### A4. 并行执行独立工具调用

- **目标**：让模型在一个 assistant turn 内发多个 `tool_use`，后端对**无依赖**的调用并发执行。
- **改动点**：先验证 SDK 行为——Claude Code agent loop 默认**串行**执行同一 turn 内多个 `tool_use`；WeWorker 工具经 `createSdkMcpServer` 注册为 MCP 工具，SDK 对 MCP 工具的并发调度行为需实测（构造一个 turn 内发 2 个无依赖 `tool_use` 的 prompt，观察是否并行）。若 SDK 已串行且不可配置，则需在工具执行层自行做并发调度。
- **预期收益**：跨站点/跨页操作直接折叠为 1 轮执行。
- **风险**：需明确依赖判定；对同站有顺序依赖的调用不能并发；若需自行调度，实现成本上升。
- **优先级**：★★★☆☆（**结论取决于实测**：SDK 若已并发则为 0 改动，若串行则成本高）

### B. LLM 思考侧——降轮次、降 TTFT、控 token

#### B1. 控制输入 token 增长（prompt caching 复核）

- **目标**：核实并降低随轮次线性增长的输入 token，而非"启用缓存"。
- **核实结论**：Claude Agent SDK 底层为 Claude Code CLI，**已自动对 system prompt + 工具 schema 做 prompt caching**，`query()` 未暴露手动 `cache_control` 入口，且大概率已是缓存状态。真正的成本问题是 `buildPromptString` 把**全量历史塞进单条 user message**，输入 token 随轮次线性增长——这部分本就不在前缀缓存范围内。
- **改动点**：① 评估改用 SDK `messages` 数组（而非把历史压进 `prompt` 字符串），让 SDK 原生管理多轮上下文与裁剪；② 对超长历史做摘要/滑动窗口。改动集中在 `agent.ts buildPromptString` + `query({ prompt }) → query({ messages })` 迁移。
- **预期收益**：**待实测**——先埋点测当前 input token/轮次曲线与缓存命中率（从 API response 的 `cache_read_input_tokens` 提取），再决定是否值得改。
- **风险**：迁移到 `messages` 数组需复刻当前 `buildPromptString` 的历史拼接语义，回归成本不小。
- **优先级**：★★★☆☆（**先测后定**，收益不确定，从 P0 降级）

#### B2. 消除 Skill 激活轮次（服务端站点路由）

- **目标**：服务端按用户消息命中的站点，直接把该 adapter 的工具清单（精简版）注入上下文，模型不必先"读 Skill"再决策。
- **改动点**：`agent.ts` 增加站点命中路由（基于 `parseAllAdapters` 的 `adapter.match` 匹配用户消息）；adapter 精简工具清单的预生成（`adapter-tool-list.ts` 的 `resolveAdapterToolList` **已具备**该能力，可直接复用）。
- **预期收益**：省 1 整轮推理。
- **风险**：站点命中误判要有兜底（未命中时仍走 Skill）。
- **优先级**：★★★★☆

#### B3. 合并杂务轮次

- **目标**：`open_browser` + `check_login` 让模型在一轮内并发发出（配合 A2 的事件化使二者可真并发）；Todo/计划类仅在复杂任务强制。
- **改动点**：`agent.ts buildSystemPrompt` 调整规则措辞；依赖 A2/A4。
- **预期收益**：省 1~2 轮推理。
- **风险**：模型行为不完全可控，需配合示例与回归。
- **优先级**：★★★☆☆

#### B4. 系统提示瘦身

- **目标**：精简 `buildSystemPrompt` 输出，拆分稳定前缀/变量后缀（`blacklistNotice`、`authSites`、`noBashNotice` 等变量部分当前混在 `base` 字符串中）。
- **改动点**：`agent.ts buildSystemPrompt`。
- **预期收益**：输入 token ↓，TTFT ↓。**收益确定**，可独立先行。
- **风险**：不能丢失关键约束（黑名单、加密、用户选择规则）。
- **优先级**：★★★★☆（**与 B1 解耦，独立为 P0**）

#### B5. 分层模型路由

- **目标**：规划/异常用强模型，机械的"执行已知工具"步用更快更便宜的模型（Haiku 档）。
- **改动点**：SDK 单次 `query` 不能切模型，需配合 C 层把流程拆成"规划一次 + 确定性执行"。
- **预期收益**：单价与延迟同时下降。
- **风险**：架构改动大；需保证规划质量。
- **优先级**：★★☆☆☆（中长期）

#### B6. 修复跨轮历史的工具调用结构丢失（正确性）

- **目标**：`buildPromptString`（`agent.ts:460-465, 469-477`）跨轮重建历史时只保留 `text`/`file_attachment`，**丢弃 `tool_use`/`tool_result` 结构**，导致多轮续接任务里模型看不到上一轮自己调过什么工具、工具返回了什么。
- **改动点**：与 B1 协同——迁移到 SDK `messages` 数组时，一并保留 `tool_use`/`tool_result` block 的结构化传递；或在纯文本回灌中补充工具调用摘要。
- **预期收益**：消除多轮续接时的重复调用与上下文丢失（**正确性收益**，非纯速度）。
- **风险**：改变历史拼接语义需充分回归。
- **优先级**：★★★☆☆（与 B1 合并实施）

### C. 编排与确定性回放——把 LLM 从流程里拿掉

#### C1. 录制 + 参数化回放

- **目标**：录制一次工具调用序列，后续同类任务跳过 LLM 直接回放，仅参数化变化点。think 时间 → ~0。适合日报、定时抓取等重复流程。
- **状态**：已确认方案但暂缓（详见 memory `weworker-replay-backlog`），前期已先做了耗时可视化（`renderer/src/components/chat/ToolTimingBadge.jsx`）。
- **改动点**：录制器、参数化回放执行器、回放与 LLM 的分流入口。
- **预期收益**：重复流程 think 时间归零。
- **风险**：站点 UI 变化导致回放失效；需失败回退到 LLM。
- **优先级**：★★★★☆（针对高频重复任务，待可视化数据沉淀）

#### C2. Skill 编译为复合工具

- **目标**：把稳定 Skill 流（如订会议室：search → book）在 adapter 侧合成一个工具，一次调用服务端完成多步。
- **改动点**：adapter 侧新增复合工具；Skill 文档同步。
- **预期收益**：既省 think 轮次又省 per-call spawn。
- **风险**：复合工具参数设计；通用性 vs 场景化取舍。
- **优先级**：★★★☆☆

#### C3. 常驻 agent 进程

- **目标**：每个 work 复用同一个 Claude Code 子进程（resume），而不是每轮 `streamChat` 重新 spawn。
- **改动点**：`agent.ts` 进程生命周期管理；状态/上下文恢复（SDK 支持 `--resume`，可探索）。
- **预期收益**：省 CLI 冷启动。
- **风险**：状态管理复杂，需保证并发 work 隔离。
- **优先级**：★★☆☆☆（中长期）

---

## 3. 优先级路线图

按 **影响 × 低改动量** 排序的推荐落地顺序（已按代码核实调整）：

| 阶段 | 方案 | 类型 | 预期效果 |
|---|---|---|---|
| **P0.5（测量）** | 埋点补充：input token/轮次、缓存命中率、bridge 重连耗时、单任务 fork 次数 | 观测 | B1/A1/A4 收益判断的前置基线，先量后改 |
| **P0** | A1 常驻 webcli worker | 执行侧 | 执行侧省 30%~60%，改动集中、低风险 |
| **P0** | A3 加密检查缓存 | 执行侧 | 改动极小、零风险，多文件场景确定收益 |
| **P0** | B4 系统提示瘦身 | LLM 侧 | 输入 token ↓、TTFT ↓，收益确定、可独立先行 |
| **P1** | A2 事件化 tools_ready | 执行侧 | 削执行侧固定 ~5s 开销（改动点见 A2） |
| **P1** | B2 站点路由注入 + B3 合并杂务轮 | LLM 侧 | 直接减少推理轮次 |
| **P1（先测后定）** | B1 控 token 增长 + B6 修复历史结构 | LLM 侧 | 依 P0.5 基线决定是否推进 |
| **P2** | C1 参数化回放 | 编排 | 高频重复任务 think 时间归零（待可视化数据沉淀） |
| **P3** | A4 并行工具 / B5 分层模型 / C2 复合工具 / C3 常驻 agent | 编排/执行 | 中长期按场景价值再排（A4 取决于 SDK 实测） |

---

## 4. 验收与观测

- **统一计时埋点**：复用已落地的耗时可视化（`renderer/src/components/chat/ToolTimingBadge.jsx`、`task-executor.ts` 中 `thinkMs/execMs` 统计），为每个方案增加前后对比指标：
  - 单任务总耗时、LLM 思考总耗时、执行总耗时、工具调用次数、平均每次调用开销。
  - prompt caching 命中率（从 API response 的 `cache_read_input_tokens` / `cache_creation_input_tokens` 提取）。
- **埋点覆盖现状（已核实）**：`thinkMs/llmMs/execMs` 已接入 `server.ts`（桌面 chat）、`task-executor.ts`（定时任务）；**通道模式 `wecom-channel.ts:689`、`channel-manager.ts:77` 两处 `streamChat` 调用未接入埋点**，需补齐，否则通道任务耗时无法观测。
- **P0.5 必测指标**（B1/A1/A4 收益判断前置）：
  - 每轮 input token 数与随轮次增长曲线（评估 B1）。
  - 缓存命中率（评估 B1 是否值得做）。
  - 单任务 `webcli call` 次数与平均 fork 开销（评估 A1）。
  - bridge/扩展连接重连耗时占比（评估 A1 收益上限）。
- **回归**：每个方案需在代表性场景（网页搜索/抓取、文件处理、定时任务、ask_user）回归，确保功能与正确性不回退。
- **A/B**：P0 三个方案建议先做基线测量再上线对比。

---

## 5. 待决策

1. 先攻 **执行侧（A1）** 还是 **LLM 侧（B1）**？
   → **建议 A1 先行**（理由更充分）：A1 收益确定、改动集中、无 LLM 侧风险；B1 收益存疑（SDK 已自动缓存），应先测基线。
2. C1 参数化回放是否在本轮推进，还是继续待可视化数据沉淀后再做？
   → **建议继续暂缓**，待 P0.5 测量数据沉淀后评估高频重复任务的占比。
3. 是否引入分层模型路由（B5），需要评估规划质量风险。
   → **建议中长期**，且依赖 C 层把流程拆成"规划一次 + 确定性执行"，单独做 B5 无入口。

---

## 附：关键代码索引

| 关注点 | 文件 |
|---|---|
| agent 主循环 + 系统提示 + 历史拼接 | `weworker/backend-ts/src/agent.ts` |
| 工具定义（MCP server） | `weworker/backend-ts/src/tools.ts` |
| webcli 子进程调用 | `weworker/backend-ts/src/webcli-runner.ts` |
| 定时任务执行（含耗时统计） | `weworker/backend-ts/src/task-executor.ts` |
| HTTP/SSE chat 入口（含耗时统计） | `weworker/backend-ts/src/server.ts` |
| adapter 工具清单预生成 | `weworker/backend-ts/src/adapter-tool-list.ts` |
| 耗时可视化（前端） | `weworker/renderer/src/components/chat/ToolTimingBadge.jsx` |
