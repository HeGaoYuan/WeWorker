
## 仓库边界

本目录是 weworker 主仓库直接管理的内部组件，不再作为独立仓库迭代或发布。

## 当前只维护harness工程，skill只留作备份，默认不迭代

The Python harness under [`src/webwright/`](src/webwright/) and the plugin/skills path under [`skills/webwright/`](skills/webwright/) use the same Webwright workflow contract and concepts (`plan.md`, `final_runs/run_<id>/`, screenshots, action logs, and self-verification), but they are two independent implementations. The skill does not call the Python harness, and the Python harness does not load the skill at runtime.

## 当前只关注local_browser + local_cdp 模式，其他模式不关注。

## 开发工具
这个子目录里的项目使用uv管理python，请使用uv run python 代替 python。
