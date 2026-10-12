# WeWorker

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/WeWorker/WeWorker/actions/workflows/ci.yml/badge.svg)](https://github.com/WeWorker/WeWorker/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/WeWorker/WeWorker)](https://github.com/WeWorker/WeWorker/releases)
[![GitHub stars](https://img.shields.io/github/stars/WeWorker/WeWorker)](https://github.com/WeWorker/WeWorker/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/WeWorker/WeWorker)](https://github.com/WeWorker/WeWorker/issues)

WeWorker 是一个 AI 驱动的桌面端网页自动化工具。它将自然语言任务交给 AI Agent，通过浏览器扩展或内置 Toolkit Adapter 调用网站能力，并在涉及登录、提交、下单、支付等关键步骤时保留用户确认环节。

> WeWorker 仍在持续开发。网站页面变化可能导致 Adapter 暂时失效；执行发送邮件、下单、支付、发布内容等操作前，请核对页面和参数。

## 功能

- **自然语言操作网站**：通过桌面端对话描述任务，由 AI 选择并调用网站工具。
- **两类 Adapter**：Extension Adapter 通过 Chrome 扩展操作网页，Toolkit Adapter 通过内置运行时执行；两者共享 `webcli call` 调用入口。
- **网站探索agent**：探索网站页面和请求，辅助创建、验证和维护网站工具。
- **定时任务**：按计划执行已配置的任务。
- **站点记忆**：在本地保存与网站相关的操作上下文。
- **消息通知**：支持将任务结果发送到已配置的通知渠道。
- **多模型配置**：支持 Anthropic、智谱、DeepSeek 和兼容接口的自定义模型配置。

## 网站支持状态

当前公开 Profile 已覆盖原定 20 个目标网站，并额外提供 12 个补充 Adapter 包。Adapter 分为两类来源：

- `adapters/`：当前公开 Profile 的 v2 Adapter 包，随桌面端构建进入默认包。
- `extension/adapters/`：浏览器扩展内置兼容 Adapter，主要保留早期扩展直注入实现和补充集成。

| 范围 | 数量 | 说明 |
| --- | ---: | --- |
| 原定目标网站 | 20 | QQ 邮箱、163 邮箱、京东、小红书、B 站、知乎、GitHub、Gitee、掘金、贴吧、闲鱼、1688、微信读书、豆瓣、36氪、微博、V2EX、雪球、BOSS 直聘、Twitter/X |
| 补充 Adapter 包 | 12 | 携程、12306、前程无忧、有道云笔记、大众点评、抖音、Hacker News、Wikipedia、今日头条、什么值得买、arXiv、诺诺网发票 |
| 扩展兼容 Adapter | 9 | B 站、GitHub、京东、掘金、QQ 邮箱、163 邮箱、Gmail、诺诺网发票、小红书 |

典型能力包括邮件搜索与附件下载、电商搜索与订单/购物车查询、内容社区搜索与详情/评论读取、代码托管趋势榜、招聘/出行/阅读/资讯类公开查询，以及部分需要用户确认的点赞、收藏、发布、购买、支付等写操作。

完整网站、Adapter ID、能力范围和验证状态见 [Adapter 状态清单](docs/ADAPTERS.md)。“已实现”表示仓库中存在可打包的 Adapter，不代表目标网站在所有账号、地区和时间均保持兼容。

## 快速开始

### 下载桌面应用

从 [GitHub Releases](https://github.com/WeWorker/WeWorker/releases) 下载对应平台的安装包：

- Windows 10/11 x64：`.exe`
- macOS Intel：x64 `.dmg`
- macOS Apple 芯片：arm64 `.dmg`

正式发布地址和签名状态以具体 Release 说明为准。

### 从源码启动

前置环境：

- Node.js 22
- npm
- [uv](https://docs.astral.sh/uv/)
- Chrome 或 Chromium 浏览器

```bash
git clone https://github.com/WeWorker/WeWorker.git
cd WeWorker/weworker
npm run install:all
npm run dev
```

首次安装会同步网站探索agent运行环境，并安装桌面端、Renderer、Backend 和 WebCLI 的依赖。

### 加载浏览器扩展

开发模式下可以手动加载扩展：

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择仓库中的 `extension/` 目录。

安装版桌面应用会携带与当前版本匹配的扩展资源。

## 基本使用

1. 启动 WeWorker。
2. 在设置中配置受支持的 AI 模型和 API Key。
3. 启动或连接浏览器扩展。
4. 打开目标网站并完成登录。
5. 在对话框中描述任务，核对关键操作后再确认执行。

示例：

```text
帮我查看 163 邮箱里是否有未读邮件
帮我在京东搜索机械键盘并整理搜索结果
帮我在小红书搜索杭州周末徒步路线
```

### WebCLI

```bash
# 查看可用 Adapter
webcli list

# 调用 Adapter 工具
webcli call <adapter-id>.<tool-id> --key=value
```

WebCLI 的安装、Bridge 和命令说明见 [webcli/README.md](webcli/README.md)。

## 项目结构

```text
WeWorker/
├── components/            桌面端使用的内部组件源码
├── extension/             Chrome 扩展与 Extension Adapter
├── webcli/                统一 Adapter CLI 与 Bridge
├── weworker/              Electron 桌面端、React Renderer 和 TypeScript Backend
├── officialWeb/           产品官网与下载页
├── metrics-server/        可选的自托管匿名指标服务
└── docs/                  设计与开发文档
```

核心调用关系：

```text
用户任务 → AI Agent → WebCLI → Extension/Toolkit Adapter → 网站
```

## 数据与安全

- API Key 由用户配置，不应写入仓库、Issue、日志或截图。
- WeWorker 会把任务内容发送给用户选择的模型服务商，请遵守对应服务商的隐私政策。
- 网站操作使用浏览器中已登录的账号，执行结果等同于用户本人操作。
- Bridge 和本地服务不应暴露到公共网络。
- 指标上传默认关闭，只有显式配置后才会启用。
- 应定期检查扩展权限和已启用的 Adapter，只使用可信代码。
- 安全漏洞请按照 [SECURITY.md](SECURITY.md) 私下报告，不要创建公开 Issue。

## 开发与构建

主要开发入口位于 `weworker/`：

```bash
cd weworker
npm run install:all
npm run dev
```

生产构建必须在目标操作系统上执行：

```bash
# Windows x64
cd weworker
npm run build:win

# macOS 当前原生架构
cd weworker
npm run build:mac
```

详细说明见：

- [桌面端开发与构建](weworker/README.md)
- [本地构建指南](LOCAL_BUILD_AI_GUIDE.md)
- [浏览器扩展与 Adapter 开发](extension/README.md)
- [WebCLI](webcli/README.md)
- [官网开发](officialWeb/README.md)

## 贡献

欢迎提交 Bug、文档、测试、新功能和新网站 Adapter。请先阅读 [贡献指南](CONTRIBUTING.md)、[社区行为准则](CODE_OF_CONDUCT.md)、[支持说明](SUPPORT.md) 和 [Git 工作流](docs/GIT_WORKFLOW.md)。新增或完成 Adapter 时，需要在同一个 PR 中更新 [Adapter 状态清单](docs/ADAPTERS.md)。

## 版本

当前首次公开版本为 `1.0.0`。公开版本变化见 [CHANGELOG.md](CHANGELOG.md)。

```bash
git tag v1.0.0
git push origin v1.0.0
```

正式发布由维护者完成；推送版本 Tag 后会自动构建 Draft Release，维护者验证安装包后再发布。创建 Tag 前必须通过项目规定的审核、测试、构建和发布验证，完整流程见 [发布指南](docs/RELEASE.md)。

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。第三方依赖说明见 [第三方软件声明](THIRD_PARTY_NOTICES.md)。第三方网站、商标和服务归各自权利人所有；使用 Adapter 时仍需遵守目标网站的协议和规则。
