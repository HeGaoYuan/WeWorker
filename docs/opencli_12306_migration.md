# OpenCLI 12306 迁移记录

来源：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI/tree/24136945847afbfad266c6c46a8cd335377f9112/clis/12306)，固定 SHA `24136945847afbfad266c6c46a8cd335377f9112`，Apache-2.0，Copyright 2025 jackwener。

公开包：`adapters/12306.cn` v0.1.0；来源 9 命令，本地 9 命令已接入既有 v2 Runner。**接入不等于逐项真实验收完成。** 只在公开 Profile 注册，内部仓库不包含本包。

## 数据与业务指导

官方 station_name.js / leftTicket / 账号 API；后台站名表，其余页面会话请求。维护知识见 [guidance](../adapters/12306.cn/guidance.md)，与 manifest 确定性生成当前 Skill。已审阅来源源码及 docs/adapters/browser/12306.md；文档过时时以固定源码为准。参数解析在包内，不修改 WebCLI 全局类型转换。

完整机器可读清单见 [inventory](opencli_batch_inventory.json)，包含源文件、策略、import 依赖、参数类型/默认值/说明、读写及登录入口。迁移后不依赖 OpenCLI 运行时。

## 逐项迁移清单

### whoami

Verify current identity

- 性质：read；只读。
- 来源：clis/12306/auth.js；来源注册的认证/页面流程。
- 登录：https://kyfw.12306.cn/otn/resources/login.html。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### login

Open official login; manual interaction

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/12306/auth.js；来源注册的认证/页面流程。
- 登录：https://kyfw.12306.cn/otn/resources/login.html。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `timeout`：int，默认 300。

### me

Show the logged-in 12306 account summary. Sensitive fields (real name, email, mobile, birth date) are masked by default; pass --include-sensitive to opt in.

- 性质：read；只读。
- 来源：clis/12306/me.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `include-sensitive`：boolean，默认 false。Reveal unmasked real name / email / mobile / birth date. The 12306 ID-number mask is server-side and never decoded.

### orders

List in-progress 12306 orders (not yet ridden, refunded, or completed) for the logged-in user

- 性质：read；只读。
- 来源：clis/12306/orders.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `include-sensitive`：boolean，默认 false。Reveal unmasked passenger names in order rows. Masked by default.

### passengers

List the logged-in user's saved 12306 passengers. Sensitive fields are masked by default; pass --include-sensitive to opt in.

- 性质：read；只读。
- 来源：clis/12306/passengers.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20。`Max passengers to return (1-${MAX_PAGE_SIZE})`
- `include-sensitive`：boolean，默认 false。Reveal unmasked real names and birth dates. The 12306 ID-number / mobile masks are server-side and never decoded.

### price

Look up 12306 ticket prices by seat class for one train on a given date and segment (anonymous, no login required)

- 性质：read；只读。
- 来源：clis/12306/price.js；Strategy.PUBLIC。
- 登录：公开读取；验证页仍需人工处理。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `train-no`：string，必填。Internal train_no from `12306 trains` (e.g. 24000000G10L)
- `from`：string，必填。Origin station (Chinese name, telecode, or pinyin) - must be a stop of this train
- `to`：string，必填。Destination station - must be a stop of this train
- `date`：string，必填。Departure date in YYYY-MM-DD
- `seat-types`：string，默认 "OM9PA1A3A4FWZ"。Seat-type letters to query (default covers the common classes). Examples: OM9 (二等/一等/商务), A1A3A4 (硬座/硬卧/软卧).

### stations

Search 12306 (China Railway) stations by Chinese name, telecode, or pinyin keyword

- 性质：read；只读。
- 来源：clis/12306/stations.js；Strategy.PUBLIC。
- 登录：公开读取；验证页仍需人工处理。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `keyword`：string，必填。Chinese substring (上海), telecode (AOH), or pinyin (shanghai)
- `limit`：int，默认 20。`Maximum results (1-${MAX_LIMIT})`

### train

List every station a 12306 train calls at, with arrival / departure / stopover time (anonymous, no login required)

- 性质：read；只读。
- 来源：clis/12306/train.js；Strategy.PUBLIC。
- 登录：公开读取；验证页仍需人工处理。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `train-no`：string，必填。Internal train_no from `12306 trains` (e.g. 24000000G10L), not the public code (G1)
- `from`：string，必填。Origin station for the segment: Chinese name, telecode, or pinyin
- `to`：string，必填。Destination station for the segment
- `date`：string，必填。Departure date in YYYY-MM-DD

### trains

List trains between two 12306 stations on a given date (anonymous, no login required)

- 性质：read；只读。
- 来源：clis/12306/trains.js；Strategy.PUBLIC。
- 登录：公开读取；验证页仍需人工处理。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `from`：string，必填。Origin station: Chinese name (北京), telecode (BJP), or pinyin (beijing)
- `to`：string，必填。Destination station: same forms as <from>
- `date`：string，必填。Departure date in YYYY-MM-DD
- `limit`：int，默认 50。`Maximum rows (1-${MAX_LIMIT})`

## 真实验证证据

实际链路为 CLI → Bridge → 已连接扩展；不含桌面自然语言入口。

- stations：通过，上海 limit=5，返回真实站点。trace：`7b7fd4865b48`。
- trains：通过，北京南→上海虹桥，2026-09-29，3车次。trace：`e7567f019c29`。
- train：通过，G531 内部 ID，13经停。trace：`30852ff6de66`。
- price：通过，同路线日期，分席别 CNY 报价。trace：`11e89322cde6`。

包加载、确认门、参数和部分解析边界采用 fixture 测试，不能当站点验收。登录、账号数据、自然语言和所有写入未验收。详见 [批次验收步骤](opencli_batch_migration.md)。
