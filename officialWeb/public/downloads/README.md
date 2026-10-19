# 下载安装包目录（可选）

默认情况下，官网下载按钮指向 [GitHub Releases](https://github.com/WeWorker/WeWorker/releases)。若你需要在自建静态站点上直接托管安装包，将构建产物放入本目录，**文件名须与 `src/lib/downloadConfig.js` 里 `DOWNLOADS[].filename` 完全一致**。

## 约定命名（随 `APP_VERSION` 变更）

| 平台 | 文件名 |
|------|--------|
| Windows x64 | `WeWorker-{版本}-win-x64.exe` |
| macOS Intel (x64) | `WeWorker-{版本}-mac-x64.dmg` |
| macOS Apple 芯片 (arm64) | `WeWorker-{版本}-mac-arm64.dmg` |

线上访问路径为：`/downloads/<文件名>`（Vite 将 `public/downloads` 原样输出到站点根目录）。

大体积安装包已在 `officialWeb/.gitignore` 中忽略，请勿提交到 Git。
