# 发布指南

本文说明 WeWorker 公开版本的发布流程。正式版本只从 `main` 上已经合并并验证的提交创建。

## 发布触发方式

仓库使用 `.github/workflows/release-latest.yml` 构建安装包。流程支持两种触发方式：

1. 推送版本 Tag：推荐方式。
2. 在 GitHub Actions 页面手动运行 `Release Latest`，并输入已有版本 Tag。

普通代码 push 不触发发布构建；代码检查在 Pull Request 阶段完成。

## 版本 Tag 规则

正式版本 Tag 使用：

```bash
v<major>.<minor>.<patch>
```

例如：

```bash
v1.0.0
v1.0.1
v1.1.0
```

构建测试或候选版本可使用预发布 Tag：

```bash
v<major>.<minor>.<patch>-rc.<number>
```

例如：

```bash
v1.0.0-rc.1
```

预发布 Tag 会复用同一个基础版本号；例如 `v1.0.0-rc.1` 要求 `weworker/package.json` 的版本仍为 `1.0.0`。Release workflow 会把带 `-rc`、`-beta` 或 `-alpha` 的版本标记为 prerelease，并仍创建 Draft Release 供维护者确认。

Tag 必须满足：

- 指向 `main` 上已经合并的提交。
- 与 `weworker/package.json` 的 `version` 一致。
- 与 `CHANGELOG.md`、`weworker/changelog.json` 中的当前版本记录一致。
- 创建后不移动、不覆盖。已发布版本需要修复时，创建新版本 Tag。

## 标准发布步骤

1. 确认目标改动已经通过 PR 合入 `main`。
2. 确认 `weworker/package.json`、`weworker/renderer/package.json`、`CHANGELOG.md` 和 `weworker/changelog.json` 的版本记录一致。
3. 在本地同步最新 `main`：

   ```bash
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   ```

4. 创建并推送版本 Tag：

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   如果只是验证编译产物，可创建 RC Tag：

   ```bash
   git tag v1.0.0-rc.1
   git push origin v1.0.0-rc.1
   ```

5. GitHub Actions 自动构建：

   - Windows x64：NSIS `.exe`、`.blockmap`、`latest.yml`
   - macOS arm64：`.dmg`、`.zip`、`.blockmap`
   - macOS x64：`.dmg`、`.zip`、`.blockmap`

6. 构建成功后，workflow 会创建 Draft Release，并上传所有安装包。
7. 维护者下载并验证安装包；确认无误后，在 GitHub Release 页面手动发布。

## 安装包验证

发布前至少验证：

- 安装包能正常安装和启动。
- 应用显示版本号与 Tag 一致。
- 浏览器扩展资源存在并能连接桌面端。
- 内置 Adapter 清单能正常加载。
- 网站探索agent入口能启动或正确显示状态。
- Windows / macOS 的签名状态与 Release 说明一致。

## 失败处理

- 如果构建失败，不要移动已有正式 Tag；先修复代码，通过 PR 合入后创建新的版本 Tag。
- 如果 Draft Release 创建失败但安装包构建成功，可以重新运行同一个 Tag 的 `Release Latest` workflow。
- 如果 Release 已经公开发布，不要覆盖同名 Tag 或替换同名安装包；使用补丁版本重新发布。

