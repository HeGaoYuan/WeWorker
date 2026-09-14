# WeWorker chat-bench

对话自动化测试 + 埋点采集 harness。**零侵入**：不改后端/前端，通过 HTTP+SSE 驱动真实的 `/works/:id/chat` 链路（含 ITSM 短路、webcli、MCP、Claude Agent SDK），采集每用例的 timing / token / cache / 每步明细，输出 **JSONL 逐事件明细 + Markdown 汇总报告**。

解决什么：手动在 UI 一条条点、埋点散落在 SSE 与 `works.db` 中、无法批量回归对比各场景耗时与 token 表现。

## 前置

1. 已在 WeWorker 应用内配置好 provider（`~/.weworker/settings.json` 有 api_key）。
2. `backend-ts` 目录已 `npm install`（self 模式会用其 `tsx` 与 Agent SDK）。
3. Node 18+（用内置 `fetch`）。

## 快速开始

```bash
cd weworker

# 1) 单个问答用例（self 模式：自动起独立 dev 后端，跑完自动清理）
node scripts/chat-bench/bench.mjs \
  --cases scripts/chat-bench/examples/qa.json \
  --no-test-prompts --out ./bench-out

# 2) 跑某站点内置测试词（来自 GET /health-check/test-prompts）
node scripts/chat-bench/bench.mjs --prompts --sites itsm.example.com

# 3) 驱动正在运行的客户端（remote）
node scripts/chat-bench/bench.mjs \
  --target remote --base http://127.0.0.1:8765 --token <X-WeWorker-Auth> \
  --cases scripts/chat-bench/examples/qa.json --no-test-prompts
```

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--target self\|remote` | `self` | self 自动起独立 dev 后端；remote 指向已运行客户端 |
| `--base <url>` | `http://127.0.0.1:8765` | 后端地址 |
| `--token <auth>` | 空 | `X-WeWorker-Auth`，remote 必填；self 留空（后端放行） |
| `--cases <file>` | 无 | 自定义用例（`.json` 数组 或 `.csv`） |
| `--sites <a,b>` | 无 | 仅跑这些 site 的 test-prompts |
| `--prompts` | 否 | 仅跑 test-prompts，忽略自定义 |
| `--no-test-prompts` | 否 | 不拉 test-prompts，仅自定义用例 |
| `--concurrency <n>` | `1` | 并发 work 数 |
| `--timeout <ms>` | `180000` | 单用例 SSE 超时 |
| `--out <dir>` | `./bench-out` | 输出目录 |
| `--cleanup / --no-cleanup` | self 开 / remote 关 | 是否删除本次创建的 work |
| `--skip-preflight` | 否 | 跳过 provider 预检 |

## 自定义用例

JSON 数组：

```json
[
  { "id": "qa-1", "prompt": "你好" },
  { "id": "itsm-todo", "prompt": "查看我的待办工单", "siteId": "itsm.example.com",
    "expectTools": ["itsm.example.com.my_todo"], "expectMaxMs": 15000 }
]
```

CSV（首行表头，`expectTools` 用 `;` 分隔）：

```csv
id,prompt,siteId,category,expectTools,expectMaxMs
qa-1,你好,,,,
itsm-todo,查看我的待办工单,itsm.example.com,itsm,itsm.example.com.my_todo,15000
```

字段：`id`(可选) / `prompt`(必填) / `siteId` / `category` / `expectTools`(数组或`;`分隔) / `expectMaxMs`。声明了 `expectTools`/`expectMaxMs` 才会在报告「断言」列显示 ✓/✗。

## 输出

```
bench-out/<运行时间戳>/
  summary.md        # 汇总：总览 + 用例对比表（按 totalMs 降序）+ 异常 + 按 site 汇总
  cases.json        # 全量机读结果（含 steps / timing / usage / healthCheck）
  cases/<id>.jsonl  # 每用例逐 SSE 事件（含 think/exec/usage，带相对 ms 偏移）
```

## 两种靶子

- **self（默认）**：用 `npx tsx` 起一份 `backend-ts` dev 后端，不设 token（`http-security.ts` 放行）。复用 `~/.weworker` 配置；`--cleanup` 默认开（删本次 work）。
- **remote**：指向已启动的客户端，请求带 `X-WeWorker-Auth`。token 获取：在客户端渲染进程 devtools 执行 `await window.electronAPI.getHttpAuthToken()`。`--cleanup` 默认关（避免误删真实 work）。

## 采集的埋点（均来自后端既有产出）

| 数据 | SSE 事件 | 后端来源 |
|---|---|---|
| turn 级 timing（totalMs/llmMs/execMs/steps） | `turn_end` | `server.ts` /chat finally |
| step 级 think/exec + 工具名/参数/结果 | `tool_call_start` / `tool_call_result` | `server.ts` /chat 循环 |
| token + cache_hit + cost + duration | `usage` | `agent.ts` result 分支 |

不依赖 `%APPDATA%\WeWorker\logs\main.log`（每次启动覆盖、且与 bridge 日志混合，不可靠）。

## 约束

- 网站/DOM 操作类 prompt 依赖浏览器扩展 bridge；独立后端无扩展时这类会失败（如实记为 error，不影响其他用例）。纯问答、文件、API 类（如 `itsm.example.com.my_todo`）可正常测。
- 并发：不同 workId 天然隔离；提高 `--concurrency` 可加速，但注意 provider 限流。

## 与现有功能的关系

- 复用 `GET /health-check/test-prompts`（按站点测试词）作为基准输入源，`POST /health-check/analyze` 做 tool 成败分析。
- 是耗时可视化（Phase A）与录制回放（Phase B，暂缓）之间的测试/基准层；未来录制脚本可直接作为 `--cases` 输入衔接。
