# weworker 项目规范

## 项目边界

- `weworker/` 是 Electron 桌面端，包含主进程、React Renderer、TypeScript Backend 和构建脚本。
- `webcli/` 与 `extension/` 维持现有独立边界；除任务明确要求外，不改其协议和运行逻辑。
- `components/webwright/` 是 weworker 主仓库直接管理的内部源码目录，不再作为独立仓库或 Git submodule 迭代。
- webwright 是 weworker 的内部组件，给 weworker 提供网站探索 agent 的能力，对外暴露名称是「网站探索agent」
- webwright和 weworker 的集成遵循 `docs/webwright_integration_design.md`；组件完整设计见 `components/webwright/docs/webwright_embedded_integration_design.md`。
- webwright 是 weworker 的内部组件，不对外暴露 webwright 这个名字。
- WebCLI 统一对外提供 Adapter 概念与 `webcli call` 命令入口；Extension Adapter 继续通过 Bridge／Chrome 扩展执行，Toolkit Adapter 通过同一安装包内的 embedded Toolkit Runtime 执行，两类 Adapter 不共享底层 Runner。

## 开发约定

- 修改前同时检查本文件与 `ROADMAP.md`。
- Node.js 代码使用现有 ESM／CommonJS 风格，不为一次性逻辑新增框架或依赖。
- webwright Python 环境由 `uv` 管理，不使用系统 `pip` 修改环境。
- 开发态从 `components/webwright/` 源码启动 webwright；正式构建只打包该目录提供的 embedded `onedir`。
- `8766` 被占用时不得终止、接管或复用未知进程。
- weworker 只能清理由本次 `webwrightManager` 启动的进程。
- Renderer 不得向主进程传入 webwright URL；只允许调用固定的 `openwebwright()` IPC 能力。
- macOS 关闭最后一个窗口不等于退出应用；webwright 继续运行到应用真正退出。
- Toolkit Skill 只使用 `webcli call <adapter-id>.<tool-id>`，不得生成或打包 `webcli-py`／`webcli-py.cmd`；WebCLI 不按业务 Schema 转换参数类型。

## 验证要求

- 脚本和 Electron 主进程逻辑必须有聚焦自动化测试。
- Renderer 改动至少通过对应单测、`npm run build` 和语法检查。
- 生命周期改动至少验证启动、端口冲突、健康检查、正常停止、异常退出重启和应用退出清理。
- 完成开发或文档工作后同步更新 `ROADMAP.md`；未验证事项不得写入“已完成”。

## 红线

- webwright 持久数据固定写入 `~/.weworker/webwright/`；不得读取、迁移或清理旧 `~/.webwright`。
- webwright 除持久数据根外，只允许按 Electron 注入的 `weworker_USER_FILES_DIR` 读写 `<user_directory>/.claude/skills/`；embedded 模式可通过独立临时 token 调用固定 loopback 内部接口读取当前模型配置快照，但不得读取设置文件、数据库或修改其他 weworker 数据。

- 不在日志记录模型 Key、token、密钥或用户数据路径。
- 修改 CI/CD、发布、数据库 schema、`.env`、密钥、删除文件和 Git 回滚前必须获得主人单独确认。
- UI 设计中，严禁出现「webwright」文案，而是用「网站探索agent」。
