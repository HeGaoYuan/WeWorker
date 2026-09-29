# Backend 二进制响应

既有 `backend_fetch` helper 的 options 支持 `responseEncoding: "base64"`，返回 `body`（base64）、`bodyEncoding: "base64"` 与 `size`（原始字节数）。未指定时保持原文本行为。调用方写文件时须将编码一并传给 `backend_file_write`，不能把图片等二进制当 UTF-8 文本保存。

二进制模式的 `maxResponseBytes` 默认 8 MiB，可选 1–50 MiB 的整数。Node fetch 逐块计数，响应头声明超限或实际流超限时终止；超限不再切换 curl 重试。curl 回退同时设置 max-filesize 并校验落盘字节数。两条传输路径均保持原始字节。该能力不提供无限文件流或多分钟持久任务。

这不改变 Adapter 域名许可、文件写入规则或确认策略。下载方应限定合法数据域、使用 manual 重定向并验证内容类型；不得给一个站点放开全局网络域名。站点提取、文件命名、用途和错误解释仍放在对应公开包中。

通用实现与 binary-response.test.js 同步内外仓库。测试覆盖 fetch/curl 字节一致性、大小边界、分块无长度响应、重定向以及兼容 helper 返回。
