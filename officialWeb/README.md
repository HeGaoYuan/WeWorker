# WeWorker 官网

开源产品官网与文档站（Vite + React）。下载页默认跳转 [GitHub Releases](https://github.com/WeWorker/WeWorker/releases)；也可选择将安装包放入 `public/downloads/` 做静态托管（见该目录 README）。

## 本地预览

```bash
cd officialWeb
npm install
npm run dev
```

生产构建：`npm run build`，产物在 `dist/`。

## 发版同步

与桌面端版本保持一致：

- `package.json` 的 `version`
- `src/lib/downloadConfig.js` 的 `APP_VERSION` 与 `DOWNLOADS[].filename`

公开仓库 CI 会通过 `scripts/check-public-config.mjs` 校验上述版本与 `weworker/package.json` 一致。

## 结构

- 落地页：`src/pages/Landing.jsx`
- Adapter 调用统计：`/stats`（`src/pages/Stats.jsx`；本地 dev 需配置 `METRICS_TARGET` / `METRICS_TOKEN`，由 Vite 代理 `/api/stats`）
- 文档：`public/docs/` + `src/pages/Docs.jsx`
- 站点清单：`src/lib/sites.json`（与仓库根 `adapters/` 对齐）
- 外链与仓库地址：`src/lib/siteConfig.js`
- 设计系统备忘：`design-system/weworker-open/`
