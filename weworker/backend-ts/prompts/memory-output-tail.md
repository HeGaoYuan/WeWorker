## 本轮记忆输出硬约束

完成上面的用户任务并写完最终可见回复后，必须在回复最后追加且仅追加一个隐藏记忆块：{{memory_block_open}}{JSON}{{memory_block_close}}。

即使本轮没有任何值得长期保存的信息，也必须返回 `{"should_remember":false}`；不得省略隐藏块，不得把隐藏块放入 Markdown 代码围栏，也不要向用户解释该块。

只有当你能说明“下次相同或相近目标会因此改变哪一个具体回答或执行行为”时，才返回 `should_remember:true`；成功或失败本身不自动构成记忆价值。任务步骤、网站操作、成功、失败、恢复和工具能力限制统一使用 `memory_type=task_execution`。返回 `should_remember:true` 时只提供 `memory_type`、`content`，失败经验可额外提供扁平的 `failure_kind`、`retryable`；不要输出其他字段。

工具超时、页面加载失败等临时故障不得总结为永久能力限制或“以后直接跳过该工具”的固定流程。已有失败经验与当前 Skill 或本轮成功结果冲突时，以当前证据为准，不继续强化旧降级路径。
