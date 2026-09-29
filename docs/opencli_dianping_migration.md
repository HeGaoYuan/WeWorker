# OpenCLI dianping 迁移记录

来源：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI/tree/24136945847afbfad266c6c46a8cd335377f9112/clis/dianping)，固定 SHA `24136945847afbfad266c6c46a8cd335377f9112`，Apache-2.0，Copyright 2025 jackwener。

公开包：`adapters/dianping.com` v0.1.0；来源 4 命令，本地 4 命令已接入既有 v2 Runner。**接入不等于逐项真实验收完成。** 只在公开 Profile 注册，内部仓库不包含本包。

## 数据与业务指导

PC 商户页面 DOM + 同源城市 SSR。维护知识见 [guidance](../adapters/dianping.com/guidance.md)，与 manifest 确定性生成当前 Skill。已审阅来源源码及 docs/adapters/browser/dianping.md；文档过时时以固定源码为准。参数解析在包内，不修改 WebCLI 全局类型转换。

完整机器可读清单见 [inventory](opencli_batch_inventory.json)，包含源文件、策略、import 依赖、参数类型/默认值/说明、读写及登录入口。迁移后不依赖 OpenCLI 运行时。

## 逐项迁移清单

### whoami

Verify current identity

- 性质：read；只读。
- 来源：clis/dianping/auth.js；来源注册的认证/页面流程。
- 登录：https://account.dianping.com/pclogin。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### login

Open official login; manual interaction

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/dianping/auth.js；来源注册的认证/页面流程。
- 登录：https://account.dianping.com/pclogin。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `timeout`：int，默认 300。

### search

大众点评店铺搜索（按关键词 + 城市）

- 性质：read；只读。
- 来源：clis/dianping/search.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `keyword`：string，必填。搜索关键词，例如 "火锅"
- `city`：string。城市名（北京/上海/汕头/beijing/shantou/...）或 cityId 数字。未在静态表中的城市会通过 dianping.com 在线解析。不传则使用 cookie 默认城市
- `limit`：int，默认 15。返回的店铺数量（最多 15，dianping 单页固定 15 条）

### shop

大众点评店铺详情（按 shop_id）

- 性质：read；只读。
- 来源：clis/dianping/shop.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。
- 别名：["detail"]。

参数（来源定义；当前 CLI 使用 --key=value）：

- `shop_id`：string，必填。店铺 ID（来自 search 的 shop_id 列，或 https://www.dianping.com/shop/<id> URL 段）

## 真实验证证据

实际链路为 CLI → Bridge → 已连接扩展；不含桌面自然语言入口。

- search：未通过：宿主导航域名拦截，不能据此断言验证码。trace：`093bbc7107b2`。

包加载、确认门、参数和部分解析边界采用 fixture 测试，不能当站点验收。登录、账号数据、自然语言和所有写入未验收。详见 [批次验收步骤](opencli_batch_migration.md)。
