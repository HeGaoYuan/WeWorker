# WeWorker 官网

WeWorker 产品介绍、下载页与使用文档，基于 React + Vite 构建。

## 开发

```bash
cd officialWeb
npm install
npm run dev
```

## 构建

```bash
npm run build
```

产物输出到 `dist/`，可部署到静态站点。

## 数据依赖

- 更新日志：`weworker/changelog.json`（与桌面端共用）
- 免责声明：`weworker/disclaimer.json`
- 安装包：放入 `public/downloads/`，命名约定见 `public/downloads/README.md`

发版时需同步更新 `src/lib/downloadConfig.js` 中的 `APP_VERSION` 与安装包文件名。
