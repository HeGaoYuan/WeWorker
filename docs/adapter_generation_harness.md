# Adapter Generation Harness

## 目标

将插件内的 Adapter 生成从单轮提示词调用升级为可恢复、可验证、可审计的生成循环：

```text
Generation lifecycle loop
  └─ Generation harness loop
       └─ Model tool loop
```

当前第一阶段覆盖 API 类 Adapter：模型负责读取探索上下文和制定生成计划，Harness 负责草稿隔离、预算、静态验证、修正、确认发布和冲突保护。

## 运行目录

每次智能生成保存在独立目录：

```text
~/.webcli/generation-runs/<run-id>/
├── run.json
├── trace.jsonl
├── drafts/
│   ├── revision-0/<site-key>/
│   └── revision-1/<site-key>/
└── backup/<site-key>/
```

`run.json` 保存会话外状态，Bridge 或 Side Panel 重连后可以通过 `runId` 恢复进度。敏感字段在持久化和 WebSocket 输出前会被脱敏。

## 状态机

```text
created
→ context_ready
→ planning
→ drafting
→ static_validating
↔ revising
→ runtime_validating
→ awaiting_approval
→ publishing
→ completed
```

异常终态包括：`failed`、`cancelled`、`needs_user_input` 和 `budget_exceeded`。

模型不能直接改变状态或发布文件。状态流转、预算检查和发布操作由 Harness 控制。

## Tool Loop

当前 Tool Loop 使用模型无关的 JSON Action 协议：

```json
{"type":"tool_call","name":"inspect_generation_context","arguments":{"section":"overview"}}
```

或：

```json
{"type":"final","content":"计划已保存","data":{}}
```

规划阶段仅开放：

- `inspect_generation_context`
- `save_generation_plan`

修正阶段仅开放：

- `inspect_validation_errors`
- `list_draft_files`
- `read_draft_file`
- `write_draft_file`
- `validate_adapter_draft`

修正工具只能读写隔离草稿内已存在的 `.js`、`.json`、`.md` 和 `.txt` 文件，不能访问正式 Adapter 或执行 Shell。

## 发布保护

生成草稿前，Harness 会将现有 Adapter 复制到隔离目录并记录目录指纹。发布时会重新计算正式 Adapter 指纹：

- 指纹一致：通过 staging 目录原子替换，并保存 backup；
- 指纹不一致：以 `ADAPTER_CHANGED_DURING_GENERATION` 失败，避免覆盖生成期间发生的人工修改。

发布成功后 Bridge 广播 Adapter 更新事件，扩展刷新匹配页面中的工具。

## Bridge 协议

- `start_generation_run`
- `get_generation_run`
- `cancel_generation_run`
- `publish_generation_run`
- `generation_run_event`

Side Panel 同时保留“快速生成”入口，用于直接调用原 Scaffold 流程。

## 当前验证范围

已实现：

- JavaScript 语法检查
- manifest JSON、站点 ID 和 match 检查
- support files 路径与存在性检查
- Adapter 注册入口检查
- 工具命名空间和重复名称检查
- 最多两轮受限自动修正
- Preview Adapter 临时注入和正式 Adapter 恢复
- 预期工具注册检查
- 查询工具风险分类和安全测试参数解析
- 高置信度只读工具真实调用
- 列表/对象基础返回契约、登录页、敏感字段和超时检查
- 运行验证失败回传 revision Tool Loop

后续阶段将继续增加 CDP 请求级副作用探测、更精细的业务输出契约，以及 Adapter 失效后的自动 Repair Run。
