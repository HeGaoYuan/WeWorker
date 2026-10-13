# WeWorker Roadmap

## 当前阶段

WeWorker 正在完成开源发布前的仓库清理与验证。当前保留 Electron 桌面端、React Renderer、TypeScript Backend、WebCLI、浏览器扩展、公开网站 Adapter，以及内嵌的网站探索agent源码。

## 已完成

- 移除仅面向内部系统的 Adapter、测试、快捷查询路由、发布脚本、部署说明和演示材料。
- 扩展 Adapter 注册表与构建配置已收敛到仓库中实际保留的公开网站 Adapter。
- 移除源码中的固定指标服务地址和固定访问令牌；指标上报改为显式环境配置并默认关闭。
- 内部域名、私网 IP 和组织名称已从保留的代码与文档中匿名化或移除。
- 首次开源版本已统一为 `1.0.0`，公开仓库身份统一为 `WeWorker/WeWorker`。
- 根更新日志与应用内更新日志已重置为仅记录首次公开版本 `1.0.0`。
- 浏览器扩展的公开名称统一为 `WeWorker Browser Adapter`，公开链接不再指向旧项目地址。
- 根 README 已按当前真实架构、启动命令、安全边界和发布状态重写。
- 20 个目标网站清单已保留并增加“已实现／开发中／规划中”状态；Gmail 和诺诺网发票作为补充集成单独记录。
- 贡献指南已改为基于 `main` 的 GitHub Flow，并补充真实检查命令、Adapter 贡献要求和本地敏感信息自检规则。
- 已新增 Git 工作流文档，明确 PR、受保护分支、受控敏感信息检查、Squash Merge、Tag 和紧急修复流程。
- Issue 与 PR 模板已完善，覆盖 Bug、功能、文档和 Adapter 提议，并区分贡献者自检与维护者受控敏感信息检查。
- 已新增公开 PR CI，覆盖配置一致性、WebCLI、Backend、Renderer、官网、Electron 集成和 Extension 检查；敏感信息扫描和真实账号 E2E 不进入公开自动化。
- 已补齐行为准则、支持指引、第三方声明、`.gitattributes`，并完善新仓库文件边界。
- 发布工作流已改为仅手动触发，并只创建指定版本的草稿 Release，不再强制移动 Tag 或删除既有 Release。
- 构建配置支持通过外部 Profile Overlay 叠加 Adapter、Provider 与扩展权限；安装包只读取生成的 `build/extension-dist/`，构建不再回写公共源配置。
- 官网（`officialWeb/`）已切换为开源单页站点；`src/lib/sites.json` 与 `extension/adapters` 公开 Adapter 对齐。
- Backend 提供可注册的 Profile 查询路由入口；默认公开构建保持空实现，定制能力可由独立入口参与开发和打包。
- Extension 页面运行时跨域访问改由内置 Adapter manifest 的 `runtime_allowed_hosts` 显式声明，公共 Service Worker 不再包含产品域名映射。
- WebCLI 包清单使用公共超集，定制仓库可按需提供命令目录资产而无需修改公共依赖或 package 配置。
- Windows 解密工具改由 `uv` 创建隔离、固定版本的构建环境，不再依赖系统 Python 预装 PyInstaller/pywin32。

## 验证结果

- 敏感信息复扫未发现新的硬编码密钥、Token、内部域名或私网 IP；命中项均为变量名、脱敏测试样例或公开占位地址。
- WebCLI 聚焦测试通过（31 项），Backend 用户场景测试通过（5 项）。
- Backend TypeScript 类型检查通过，Renderer 与官网生产构建通过。
- Extension 公开范围测试通过（19 项），内部功能清理前遗留的运行时测试不作为公开门禁。
- Electron 集成测试通过（22 项），公开配置校验及校验器测试通过。
- Windows 本地全量测试基线：WebCLI 234/243、Backend 283/288 通过；剩余失败为 Windows 文件系统/符号链接差异、已变更的 PowerShell 平台文案和过期测试 mock，需在后续开发中修复或在 Ubuntu CI 复核。
- Git 差异格式检查通过。
- 官网生产构建通过（公开 Adapter 对应 4 个分组、7 个站点）。
- Backend Profile 聚焦测试、Adapter scaffold/用户场景测试、类型检查与公开 bundle 验证通过；公开 bundle 标记为 `public`。
- Extension manifest 跨域授权聚焦测试通过；公开 Profile 成功生成 4 个实际打包 Adapter。
- Windows 解密工具在隔离环境中成功生成 `sd_decrypt.exe`。

## 进行中

- 执行初始化前的最终受控敏感信息复扫和文件清单复核。

## 待办

- 在干净目录复制最终文件并重新初始化 Git 仓库。
- 为公开发布配置新的下载地址、指标服务和发布流程。
- 在目标平台完成 Windows x64、macOS arm64 与 macOS x64 安装包验收。

## 约束

- 仓库不得包含真实密钥、Token、密码、账号、内部域名、私网 IP 或内部系统资料。
- 示例网络地址使用 `example.com`、`example.org`、`localhost` 或 `127.0.0.1`。
- 对外界面只使用“网站探索agent”，不暴露内部组件名称。
