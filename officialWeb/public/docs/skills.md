# Skill 安装与使用

WeWorker 生态里有两类常见「安装物」：**桌面客户端**负责运行环境与对话界面；**Skill** 是给 AI Agent 阅读的说明文档，教 Agent 如何用 `webcli call` 操作某个网站。二者配合使用，但下载方式与用途不同。

## 桌面客户端 vs Skill

| | WeWorker 桌面客户端 | Adapter Skill |
|---|---------------------|---------------|
| **是什么** | macOS / Windows 应用（含 WebCLI、Bridge、扩展资源） | 每个网站适配器对应的 `SKILL.md` 及附属知识文件 |
| **解决什么问题** | 对话、定时任务、消息通道、托管 Bridge | 让 Agent 知道工具名、参数、登录与调用顺序 |
| **是否必需** | 使用 WeWorker 完整能力时必需 | 可选；不装 Skill 也可对话，但 Agent 对站点工具了解更少 |
| **典型获取方式** | [下载页](/download) 或 GitHub Releases | 见下文三种方式 |

> 仅把 Skill 拷进 Claude Code / Cursor 而**不**启动 WeWorker 与 Chrome 扩展，Agent 仍无法真正操控浏览器。Skill 是「说明书」，执行仍依赖桌面端与扩展。

## 获取 Skill 的三种方式

### 方式一：桌面端自动同步（推荐）

安装并打开 **WeWorker** 后，应用会根据已安装的 Adapter 在用户配置目录生成或更新 Skill（与「工具包 / Skills」开关一致）。无需手动从 GitHub 逐个复制。

适合：日常使用 WeWorker 对话、已在应用内启用对应站点 Adapter 的用户。

### 方式二：WebCLI 命令安装

桌面端已内置 **WebCLI**。在终端执行：

```bash
# 安装全部已注册适配器的 Skill（含基础 webcli Skill）
webcli install --skills

# 只安装某个站点，例如京东、QQ 邮箱
webcli install --skills jd.com
webcli install --skills mail.qq.com

# 安装到自定义目录（Claude Code / 其他 Agent 的工作区）
webcli install --skills --target ~/.claude/skills
```

默认目标为 `~/.claude/skills/`，目录结构示例：

```text
~/.claude/skills/
├── webcli/                 # 基础：webcli 命令语法
│   └── SKILL.md
├── webcli-jd.com/          # 站点 Skill（名称随适配器 id 变化）
│   └── SKILL.md
└── ...
```

查看某个适配器 Skill 原文（不写入磁盘）：

```bash
webcli adapter skill mail.qq.com
webcli adapter skill jd.com --generated   # 查看自动生成草稿 SKILL.generated.md
```

查看 Skill 与 Adapter 文件所在目录：

```bash
webcli adapter skills-path
```

### 方式三：从主仓库 Adapter 目录阅读

社区 Adapter 源码与站点调用说明在 [WeWorker 主仓库 adapters 目录](https://github.com/WeWorker/WeWorker/tree/main/adapters)（路径形如 `adapters/<站点 id>/guidance.md`）。你可以：

1. 在仓库中直接阅读 `manifest.json`、`guidance.md` 和命令实现；
2. 参考 `guidance.md` 理解工具说明、参数和调用顺序；
3. 在本地改 Adapter 后，用 `webcli install --skills <id>` 重新安装，避免手工合并遗漏。

## 在 WeWorker 里怎么用 Skill

1. 完成 [快速开始](/docs/quick-start)：安装客户端、加载 Chrome 扩展、配置模型。
2. 在 Chrome 打开目标网站并完成登录（需要登录的站点）。
3. 在 WeWorker 对话中用自然语言描述任务；Agent 会按已启用的 Skill 与 Adapter 调用 `webcli call`。
4. 需要精确排查时，对照 [适配网站](/docs/supported-sites) 或 Skill 中的命令块，在终端本地执行同一条 `webcli call`。

应用内可在「工具包」中查看、启用或禁用各站点 Skill 范围（公共 Skill 与站点 Skill）。禁用后不会删除 Adapter，只是不再把该 Skill 注入当前 Agent 上下文。

## 在 Claude Code / Cursor 等外部 Agent 中使用

1. 安装 **WeWorker 桌面端**并保持运行（Bridge 由桌面端托管）。
2. 加载 **WebMCP Adapter** 扩展（路径见 [快速开始](/docs/quick-start)）。
3. 执行 `webcli install --skills --target <你的 Agent skills 目录>`，或手动复制仓库中的 `SKILL.md`。
4. 在 Agent 会话中启用对应 Skill，再发起任务；写操作前建议先用 Skill 里提到的只读命令或 `dryRun` 参数试跑。

WeWorker 内置 Agent 使用的 Skill 目录与 Claude Code 默认路径可能不同；以外部 Agent 为主时，请用 `--target` 指到该工具要求的 skills 根目录。

## 编写 Adapter 时的 Skill

自定义 Adapter 见 [Adapter 开发](/docs/adapters)。为站点维护高质量的 `SKILL.md` 能显著减少 Agent 误调用。生成式 Adapter 在 scaffold 时若已有手工 `SKILL.md`，新草稿会写入 `SKILL.generated.md`，避免覆盖成熟文档。

重新生成 Skill 内容：

```bash
webcli adapter skill mysite.com --regenerate
webcli adapter skill mysite.com --regenerate --overwrite   # 覆盖写入 SKILL.md（慎用）
```

## 常见问题

<details>
<summary>装了 Skill 但 Agent 仍说找不到工具</summary>

- 确认 WeWorker 已启动且扩展已连接（`webcli service status`）。
- 确认 Adapter 已安装：`webcli adapter list`。
- 确认站点已在浏览器登录。

</details>

<details>
<summary>桌面端更新后 Skill 内容变了</summary>

应用会按 Adapter 变更同步 Skill。若你在外部目录用手工复制过 Skill，更新后可用 `webcli install --skills <id>` 覆盖安装，或对比 `SKILL.generated.md` 合并改动。

</details>

<details>
<summary>和 webcli 命令行文档的关系</summary>

终端调用细节、参数格式与排障见 [webcli 操作说明](/docs/wecli)。本页聚焦 Skill 的获取与 Agent 侧使用。

</details>
