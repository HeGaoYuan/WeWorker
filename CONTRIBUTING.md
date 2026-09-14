# 贡献指南

感谢你参与 WeWorker。我们欢迎 Bug 修复、新功能、网站 Adapter、测试和文档改进。

提交代码前，请先阅读本指南和 [Git 工作流](docs/GIT_WORKFLOW.md)。涉及安全问题时，请按照 [SECURITY.md](SECURITY.md) 私下报告，不要创建公开 Issue。

## 参与方式

- 报告可复现的 Bug。
- 提出有明确使用场景的功能建议。
- 修正文档、测试和无障碍问题。
- 修复已有 Issue。
- 开发或维护公开网站 Adapter。

创建 Issue 时请选择最匹配的模板：Bug 报告、功能建议、文档问题或 Adapter 提议。模板会引导你提供可复现且经过脱敏的信息。

较大的功能、架构调整、依赖替换或浏览器权限变化，建议先创建 Issue 讨论范围，避免完成后才发现方向不一致。

## 行为要求

参与项目即表示你同意：

- 使用友善、包容和专业的语言。
- 尊重不同观点、经验和背景。
- 接受建设性反馈，并围绕事实讨论技术方案。
- 不公开他人的账号、日志、网页数据或其他隐私信息。
- 不将安全漏洞的利用细节发布到公开 Issue 或 Pull Request。

项目后续会补充独立的社区行为准则；在此之前以上要求适用于所有项目空间。

## 开发环境

### 前置依赖

- Git
- Node.js 22
- npm
- [uv](https://docs.astral.sh/uv/)
- Chrome 或 Chromium 浏览器
- 构建安装包时所需的目标操作系统工具链

完整桌面安装包必须在目标操作系统上构建：Windows 安装包在 Windows 构建，macOS 安装包在 macOS 构建。

### Fork 和克隆

1. 在 GitHub 上 Fork `WeWorker/WeWorker`。
2. 克隆自己的 Fork。
3. 将官方仓库添加为 `upstream`。

```bash
git clone https://github.com/<your-account>/WeWorker.git
cd WeWorker
git remote add upstream https://github.com/WeWorker/WeWorker.git
git fetch upstream
```

不要把上游全部分支和 Tag 强制推送到个人 Fork。贡献通常只需要同步 `main`。

### 安装依赖并启动桌面端

主要开发入口位于 `weworker/`：

```bash
cd weworker
npm run install:all
npm run dev
```

该命令会同步网站探索agent运行环境，并安装桌面端、Renderer、Backend 和 WebCLI 的依赖。

浏览器扩展可以在 Chrome 的 `chrome://extensions/` 中通过“加载已解压的扩展程序”加载仓库的 `extension/` 目录。

## Git 工作流

项目采用基于 `main` 的 GitHub Flow。完整规则见 [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)。

### 创建分支

每次开发前先同步 `main`，再创建短期分支：

```bash
git fetch upstream
git switch main
git pull --ff-only upstream main
git switch -c feat/short-description
```

推荐命名：

| 类型 | 示例 | 用途 |
| --- | --- | --- |
| `feat/` | `feat/github-adapter` | 新功能或新 Adapter |
| `fix/` | `fix/mail-login-check` | Bug 修复 |
| `docs/` | `docs/build-guide` | 文档修改 |
| `refactor/` | `refactor/bridge-routing` | 不改变外部行为的重构 |
| `test/` | `test/adapter-registry` | 测试改进 |
| `chore/` | `chore/dependency-update` | 工具、依赖或维护工作 |

分支应聚焦一个主题，并尽快通过 PR 合并和删除。不要从旧功能分支继续派生多个无关分支。

## 项目边界

- `weworker/`：Electron 主进程、React Renderer、TypeScript Backend 和构建脚本。
- `webcli/`：统一 Adapter CLI 和 Bridge。
- `extension/`：Chrome 扩展与 Extension Adapter。
- `components/`：桌面端使用的内部组件源码。
- `officialWeb/`：产品官网和下载页。

除 Issue 明确要求外，不跨模块修改协议和运行逻辑。网站探索能力的公开名称统一使用“网站探索agent”。

## 代码约定

- 保持现有 ESM/CommonJS 风格，不为一次性逻辑新增框架。
- JavaScript、TypeScript、JSON 和 YAML 使用 2 个空格缩进。
- Python 使用 4 个空格缩进，并通过 `uv` 管理环境。
- 不提交格式化整个仓库的无关变更。
- 不删除或覆盖不属于当前任务的用户修改。
- 新增依赖必须说明原因、许可证、体积和替代方案。
- Renderer、主进程、生命周期和构建逻辑的修改需要相应测试。
- 不在日志中记录模型 Key、Token、用户数据路径或网页私密内容。

## 提交信息

提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
<type>(<scope>): <subject>
```

常用类型：

| 类型 | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档 |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试 |
| `build` | 构建系统 |
| `ci` | CI 配置 |
| `chore` | 其他维护工作 |

示例：

```text
feat(extension): add example site adapter
fix(backend): preserve user scenario overrides
docs: clarify local build requirements
```

标题使用祈使语气，说明“做什么”，避免只写 `update`、`fix bug` 等无法检索的内容。

## 提交前检查

根据修改范围执行下列检查。命令均从仓库根目录开始说明。

### WebCLI

```bash
cd webcli
npm ci
npm test
```

### Backend

```bash
cd weworker/backend-ts
npm ci
npx tsc --noEmit
npm test
```

### Renderer

```bash
cd weworker/renderer
npm ci
npm run build
```

### Electron 集成

```bash
cd weworker
npm ci
npm run test:webwright-integration
```

### 浏览器扩展

扩展测试使用 Node.js 原生测试运行器。可从仓库根目录执行：

```powershell
$files = (Get-ChildItem extension/test -Filter '*.test.mjs').FullName
node --test $files
```

```bash
node --test extension/test/*.test.mjs
```

扩展测试在部分 Windows 环境可能完成断言后仍未退出；PR 中应如实记录该情况，不要把手动中断描述为完整通过。

### 官网

```bash
cd officialWeb
npm ci
npm run build
```

### 完整桌面构建

```bash
cd weworker
npm run build:win   # Windows x64
npm run build:mac   # macOS 当前原生架构
```

普通 PR 不要求贡献者在所有平台生成安装包。修改 Electron 生命周期、打包资源、自动更新或平台相关代码时，应在 PR 中说明已经验证的平台和未验证的平台。

## 敏感信息自检

敏感信息扫描不在公开 GitHub Actions 中执行。提交 PR 前，贡献者必须在本地检查；合并前，维护者会在受控环境完成最终检查。

不得提交：

- API Key、Access Token、密码、Cookie、私钥和认证 Header。
- 真实账号、手机号、私人邮箱、用户 ID 和会话 ID。
- 内部域名、私网 IP、内部系统名称和内部接口资料。
- 用户目录绝对路径、浏览器 Profile、数据库或本地配置。
- 含真实邮件、订单、工单、聊天、网页数据的日志、截图、录屏或测试样本。
- `.env`、临时会话文件、抓包结果或未脱敏的生成资产。

如果发现凭据曾经进入提交，即使之后删除，也应立即通知维护者并撤销或轮换凭据。不要在公开 PR 中粘贴扫描命中内容。

## Adapter 贡献要求

新增或更新 Adapter 时应：

1. 在 `extension/adapters/<adapter-id>/` 提供 manifest、实现和必要说明。
2. 更新 `extension/adapters/index.json`。
3. 说明是否需要加入 `weworker/build-profile.json`。
4. 添加聚焦测试，Fixture 必须使用脱敏的示例数据。
5. 更新 [Adapter 状态清单](docs/ADAPTERS.md)。
6. 对登录、发送、发布、下单、支付等操作提供安全边界和确认机制。
7. 不绕过目标网站的访问控制，也不提交真实登录态。

## Pull Request 要求

PR 应包含：

- 清晰的背景、目标和改动范围。
- 关联的 Issue；小型文档修复可例外。
- 已执行的测试命令和结果。
- 未执行或无法执行的检查及原因。
- UI 变化的脱敏截图或录屏。
- 对依赖、权限、网络、IPC、持久数据和兼容性的影响。
- 用户可见变化对应的文档或更新日志。

保持 PR 足够小，使审阅者可以理解和验证。不要把无关重构、格式化和功能修改混在一个 PR 中。

所有 PR 必须通过仓库规定的公开检查、完成维护者审核和合并前受控敏感信息检查。敏感检查的输出不应发布在 PR、Actions 日志或 Artifact 中。

当前公开 CI 的必需检查为：`Public config`、`WebCLI tests`、`Backend checks`、`Renderer build`、`Website build`、`Electron integration tests` 和 `Extension tests`。新仓库初始化后，应使用这些名称配置分支保护；工作流改名时必须同步更新保护规则和本文档。

## 合并方式

- 重要分支禁止直接推送，只接受 PR。
- 默认使用 Squash Merge，使一个 PR 对应一个清晰提交。
- 合并前必须解决审阅意见并通过必需检查。
- 有实质性新提交后，维护者可以要求重新审批。
- PR 合并后删除短期功能分支。

仓库分支保护的详细建议见 [Git 工作流](docs/GIT_WORKFLOW.md)。

## 获取帮助

1. 搜索现有 [Issues](https://github.com/WeWorker/WeWorker/issues)。
2. 阅读根 [README](README.md) 和相关模块文档。
3. 如果没有相同问题，使用 [Issue 模板](https://github.com/WeWorker/WeWorker/issues/new/choose) 提交 Bug、功能建议、文档问题或 Adapter 提议。

安全漏洞请使用 [GitHub Security Advisories](https://github.com/WeWorker/WeWorker/security/advisories/new) 或 [SECURITY.md](SECURITY.md) 中的私密渠道。
