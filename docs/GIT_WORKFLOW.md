# Git 工作流

WeWorker 使用以 `main` 为中心的 GitHub Flow。所有面向重要分支的代码变更都通过 Pull Request 合并。

## 工作流概览

```text
Issue/需求
  → 从最新 main 创建短期分支
  → 本地开发、测试和敏感信息自检
  → 提交 Pull Request
  → 公开 CI 检查
  → 代码审阅
  → 维护者在受控环境执行敏感信息检查
  → Squash Merge
  → 删除短期分支
```

## 分支模型

### `main`

- 唯一默认分支。
- 始终保持可测试、可构建状态。
- 禁止直接推送，只通过 PR 合并。
- 正式版本从 `main` 上经过验证的提交创建 Tag。

### 短期开发分支

从最新 `main` 创建，并在 PR 合并后删除：

- `feat/<description>`
- `fix/<description>`
- `docs/<description>`
- `refactor/<description>`
- `test/<description>`
- `chore/<description>`

### 维护分支

只有确实需要同时维护多个大版本时才创建，例如 `release/1.x`。维护分支与 `main` 使用相同的保护规则。不要为尚不存在的发布需求提前创建长期 `dev` 或 `release` 分支。

## 开始开发

```bash
git fetch upstream
git switch main
git pull --ff-only upstream main
git switch -c fix/short-description
```

如果开发期间 `main` 有更新，优先在个人分支整理提交后 rebase：

```bash
git fetch upstream
git rebase upstream/main
```

不要对其他贡献者共享使用的分支执行强制推送。个人 PR 分支需要更新 rebase 结果时，使用 `--force-with-lease`，不要使用无保护的 `--force`。

## Pull Request 流程

1. 确认一个 PR 只解决一个清晰问题。
2. 执行与修改范围对应的测试、类型检查和构建。
3. 在本地完成敏感信息自检。
4. 推送个人分支并创建 PR。
5. 填写 PR 模板，说明已验证和未验证内容。
6. 等待公开 CI 和维护者审阅。
7. 根据反馈修改；重要变更需要重新验证。
8. 维护者在受控环境执行合并前敏感信息检查。
9. 所有必需条件满足后使用 Squash Merge。
10. 删除已合并的短期分支。

## 公开自动检查

公开 CI 只执行适合在 GitHub Actions 日志中运行的检查，例如：

- 配置和语法检查。
- Backend 类型检查与自动化测试。
- WebCLI、Extension 和集成测试。
- Renderer 与官网生产构建。
- Adapter 注册表和构建配置一致性检查。
- 文档链接和锁文件一致性检查。

公开 CI 不读取真实账号、登录态、生产配置或开发者用户目录，也不执行需要真实网站账号的端到端测试。

## 敏感信息门禁

敏感信息扫描不进入公开 GitHub Actions，避免命中内容出现在 Actions 日志、PR 注释或 Artifact 中。

### PR 创建前

贡献者在本地检查本次差异，确认没有：

- 凭据、Token、Cookie、密码或私钥。
- 内部域名、私网 IP 和内部系统资料。
- 真实账号、用户 ID、会话 ID 和个人数据。
- 本机路径、浏览器 Profile、数据库和环境配置。
- 未脱敏日志、测试 Fixture、截图、录屏和生成文件。

### 合并前

维护者在受控环境执行增量扫描；必要时执行完整仓库扫描和二进制人工检查。公开 PR 中只记录“已完成检查”的结论，不发布扫描命令输出、命中片段或报告文件。

发现真实凭据时：

1. 暂停合并。
2. 撤销或轮换凭据。
3. 从 PR 提交中清除相关内容。
4. 在受控环境重新检查。
5. 不在公开讨论中复制凭据值。

## Review 要求

审阅者重点确认：

- 改动与 Issue 和 PR 描述一致。
- 行为、失败路径和兼容性清晰。
- 新功能有聚焦测试。
- 权限、网络访问、IPC 和持久数据变化合理。
- Adapter 不绕过登录和用户确认边界。
- 文档和 Adapter 状态同步更新。
- 没有无关格式化、生成物或二进制文件。
- 未验证事项被明确说明。

作者不能审批自己的 PR。通常至少需要一位维护者批准；高风险的安全、发布、自动更新、浏览器权限和持久数据变更建议两位维护者确认。

## 推荐的分支保护

对 `main` 和重要维护分支启用：

- Require a pull request before merging。
- 至少 1 个 approving review。
- Dismiss stale approvals when new commits are pushed。
- Require conversation resolution before merging。
- Require status checks to pass before merging。
- Require branches to be up to date before merging，或使用 Merge Queue。
- Block force pushes。
- Block branch deletion。
- 限制能够创建正式 Release Tag 的角色。

建议维护者也遵守分支保护，避免使用管理员权限绕过正常检查。紧急情况的绕过必须有明确原因和后续补充 PR。

当前 `.github/workflows/ci.yml` 提供以下必需状态检查：

- `Public config`
- `WebCLI tests`
- `Backend checks`
- `Renderer build`
- `Website build`
- `Electron integration tests`
- `Extension tests`

配置分支保护时使用这些实际名称。工作流中的 Job 名称发生变化后，必须同步更新 Ruleset 和贡献文档，避免保护规则等待已经不存在的检查。

## 合并策略

默认使用 Squash Merge：

- PR 标题作为最终提交标题，并遵循 Conventional Commits。
- PR 描述保留背景、验证结果和关联 Issue。
- 最终提交不包含调试提交、合并噪声或临时修复记录。

除维护长期分支等明确场景外，不使用普通 Merge Commit。是否允许 Rebase Merge 由维护者在仓库设置中统一决定，避免同一仓库混用多种不可预测的历史风格。

## 紧急修复

紧急修复仍然通过 PR：

1. 从受影响的受保护分支创建 `fix/` 分支。
2. 只包含必要修复和回归测试。
3. 执行可用的必需检查和受控敏感信息检查。
4. 由维护者快速审阅后合并。
5. 无法在发布前完成的检查必须记录，并在发布后立即补做。

“紧急”不代表可以提交凭据、关闭安全边界或跳过用户确认机制。

## Tag 与发布

- 正式版本使用 `v<major>.<minor>.<patch>`，例如 `v1.0.0`。
- Tag 必须指向受保护分支上已审核的提交。
- Tag 中的版本必须与产品版本和更新日志一致。
- 正式 Tag 由维护者创建，贡献者不要在功能 PR 中创建发布 Tag。
- 删除或移动已经公开发布的版本 Tag 属于例外操作，必须由维护者明确批准。

完整构建、签名、安装验证、Release 和官网部署规则见 [发布指南](RELEASE.md)。

## 仓库初始化后的设置清单

新公开仓库创建后，维护者需要在 GitHub 完成：

1. 将默认分支设置为 `main`。
2. 启用上述分支保护或 Ruleset。
3. 只启用项目确定的合并方式，推荐 Squash Merge。
4. 启用自动删除已合并分支。
5. 配置必需状态检查。
6. 限制正式 Tag 和 Release 权限。
7. 启用 Private vulnerability reporting。
8. 验证 Issue、PR 和 Security Advisory 链接。
