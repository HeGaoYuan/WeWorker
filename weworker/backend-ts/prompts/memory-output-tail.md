## 本轮记忆输出硬约束

完成上面的用户任务并写完最终可见回复后，必须在回复最后追加且仅追加一个隐藏记忆块：{{memory_block_open}}{JSON}{{memory_block_close}}。

即使本轮没有任何值得长期保存的信息，也必须返回 `{"should_remember":false,"action":"ignore","reason":"..."}`；不得省略隐藏块，不得把隐藏块放入 Markdown 代码围栏，也不要向用户解释该块。

只有当你能说明“下次相同或相近目标会因此改变哪一个具体回答或执行行为”时，才返回 `should_remember:true`；成功或失败本身不自动构成记忆价值。任务步骤、网站操作、成功、失败、恢复和工具能力限制统一使用 `memory_type=task_execution`；失败候选必须按系统提示词提供 `facts.task_assessment.failure_kind`。返回 `should_remember:true` 时，按系统提示词补齐全部记忆字段；`should_remember` 必须是布尔值。
