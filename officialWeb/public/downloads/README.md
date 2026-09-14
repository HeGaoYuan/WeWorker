# 下载安装包目录

构建或拷贝好的安装包放在本目录下，**文件名须与 `src/lib/downloadConfig.js` 里 `DOWNLOADS[].filename` 完全一致**（含版本号），官网下载按钮才会指向正确文件。

## 约定命名（随 `APP_VERSION` 变更）

| 平台 | 文件名 |
|------|--------|
| Windows x64 | `WeWorker-{版本}-windows-x64.exe` |
| macOS Intel (x64) | `WeWorker-{版本}-mac-x64.dmg` |
| macOS Apple 芯片 (arm64) | `WeWorker-{版本}-mac-arm64.dmg` |

示例（版本 `0.1.0`）：

- `WeWorker-0.1.0-windows-x64.exe`
- `WeWorker-0.1.0-mac-x64.dmg`
- `WeWorker-0.1.0-mac-arm64.dmg`

若 electron-builder 产物名不同，可复制/重命名为上表文件名，或同时改 `downloadConfig.js` 中的 `filename` 与 `href` 里的路径段。

线上访问路径为：`/downloads/<文件名>`（由 Vite 将 `public/downloads` 原样输出到站点根目录）。
