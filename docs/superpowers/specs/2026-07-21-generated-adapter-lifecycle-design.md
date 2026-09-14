# Generated Adapter 生命周期与 Agent 优化交接

## 背景

用户通过扩展完成网站探索、动作录制和工具生成后，Adapter 当前会写入 WebCLI 所解析到的扩展目录：

```text
<extension>/adapters/<siteKey>/
```

仓库开发环境通常对应：

```text
extension/adapters/<siteKey>/
```

npm 或安装包环境通常对应 WebCLI 包内部随包发布的：

```text
@example/webcli/extension/adapters/<siteKey>/
```

该目录属于程序发布内容，不是稳定的用户数据目录。

## 已确认问题

### 1. Agent 优化交接不完整

生成器虽然会返回 `adapterDir` 和文件列表，也会生成 `WEBCLI_KNOWLEDGE.md`、`WEBCLI_KNOWLEDGE.json` 与 Skill 文件，但当前缺少正式的 Agent 优化入口和交接协议。

用户不应手工查找并告诉 Agent 绝对路径。系统应根据 `adapterId` 自动提供：

- Adapter 实际目录；
- 当前工具及源码文件；
- 探索和录制证据；
- 主接口选择结果；
- 知识包和 Skill；
- 推荐测试命令；
- 扩展重新加载和实际验证方式。

### 2. 安装新版本可能覆盖用户生成内容

WebCLI 发布前会删除包内旧的 `extension/` 并从源码重新复制。用户升级 npm 包、桌面安装包或替换扩展目录时，程序目录下本地生成的 Adapter 不会自动合并到新版本，因此可能丢失。

如果扩展被卸载后重新安装，`chrome.storage.local` 中的探索和录制记忆也可能同时丢失。仅覆盖同一扩展版本且保持扩展身份时，存储可能保留，但 Adapter 文件仍不能依赖这一行为。

### 3. 自动生成文件可能覆盖 Agent 优化

当前生成文件主要位于：

```text
webcli-generated/
```

Agent 如果直接修改这些文件，下一次重新探索或重新生成可能覆盖优化结果。需要明确机器生成层和人工/Agent 维护层的文件所有权。

## 目标设计

### 用户级 Adapter 数据目录

将用户生成和用户安装的 Adapter 保存到独立、可迁移的用户数据目录，例如：

```text
~/.webcli/adapters/<adapterId>/
```

或桌面应用的：

```text
<app.userData>/adapters/<adapterId>/
```

运行时按以下优先级合并：

1. 用户维护或 Agent 优化版本；
2. 用户生成版本；
3. 官方安装包内置版本。

升级安装包只替换第 3 层，不修改前两层。

### Agent 优化交接协议

生成成功后提供“交给 Agent 优化”入口，自动传递结构化上下文：

```json
{
  "adapterId": "todo.example.com",
  "adapterDir": "/absolute/user-data/adapters/todo.example.com",
  "focusTool": "todo.example.com.approve_todo",
  "sourceFile": "webcli-generated/tools/approve_todo.generated.js",
  "knowledgeFiles": ["WEBCLI_KNOWLEDGE.md", "WEBCLI_KNOWLEDGE.json"],
  "verificationTarget": "审批指定待办"
}
```

建议新增命令或等价 MCP 工具：

```text
webcli adapter path <id> --json
webcli adapter context <id> --json
webcli adapter promote <id> <tool>
webcli adapter test <id> [tool]
webcli adapter reload <id>
webcli adapter export <id>
webcli adapter import <file>
```

### 文件所有权

建议明确分层：

```text
webcli-generated/   机器生成，可重新生成
tools/              Agent/人工维护，不被生成器覆盖
overrides/          对生成工具的稳定覆盖层
tests/              Adapter 回归测试
```

`promote` 操作将选定的生成工具提升到人工维护层，并更新 manifest，使后续重新生成不覆盖该工具。

### 升级迁移

安装或升级时应：

1. 检测旧版本程序目录中的非官方 Adapter；
2. 首次迁移到用户数据目录；
3. 对同 ID Adapter 执行官方版本、用户版本冲突检测；
4. 保留用户层并提示可用的官方更新；
5. 支持导出、导入和自动备份；
6. 对站点记忆提供同步迁移或重新绑定能力。

## 当前临时建议

在用户数据目录方案完成前：

- 升级前备份 `extension/adapters/` 中用户生成的目录；
- 同时导出或备份扩展的 `siteMemories`；
- 新版本安装后再合并用户 Adapter，并重新加载扩展；
- Agent 优化前通过 `webcli adapter skills-path` 获取当前 Adapter 根目录，避免让用户手工查找绝对路径。
