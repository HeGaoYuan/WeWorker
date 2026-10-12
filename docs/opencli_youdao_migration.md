# OpenCLI youdao 迁移记录

来源：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI/tree/24136945847afbfad266c6c46a8cd335377f9112/clis/youdao)，固定 SHA `24136945847afbfad266c6c46a8cd335377f9112`，Apache-2.0，Copyright 2025 jackwener。

公开包：`adapters/note.youdao.com` v0.1.0；来源 1 命令，本地 1 命令已接入既有 v2 Runner。**接入不等于逐项真实验收完成。** 只在公开 Profile 注册，内部仓库不包含本包。

## 数据与业务指导

公开分享页 React store：全文、摘要及元数据。维护知识见 [guidance](../adapters/note.youdao.com/guidance.md)，与 manifest 确定性生成当前 Skill。已审阅来源源码及 docs/adapters/browser/youdao.md；文档过时时以固定源码为准。参数解析在包内，不修改 WebCLI 全局类型转换。

完整机器可读清单见 [inventory](opencli_batch_inventory.json)，包含源文件、策略、import 依赖、参数类型/默认值/说明、读写及登录入口。迁移后不依赖 OpenCLI 运行时。

## 逐项迁移清单

### note

Read a public shared Youdao Note

- 性质：read；只读。
- 来源：clis/youdao/note.js；Strategy.PUBLIC。
- 登录：公开读取；验证页仍需人工处理。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `url`：string，必填。Full share URL of the Youdao Note

## 真实验证证据

实际链路为 CLI → Bridge → 已连接扩展；不含桌面自然语言入口。

2026-09-28：用户授权公开短链经过 CLI → Bridge → 扩展真实读取成功，trace `9cb6c694b27d`。核对返回独立的全文 content 与 summary、关键词、时间和大小。用户链接/正文不进入仓库。此前短链导航循环及 isolated world 无 React 状态已修正：逐跳校验官方域名/笔记 ID，转换已确认的 PC 路由，只忽略数字 _time，使用既有 main_world_eval 提取。

包加载、确认门、参数和部分解析边界采用 fixture 测试，不能当站点验收。登录、账号数据、自然语言和所有写入未验收。详见 [批次验收步骤](opencli_batch_migration.md)。
