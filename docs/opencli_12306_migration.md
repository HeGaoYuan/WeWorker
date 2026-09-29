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

## 订单会话诊断（2026-09-29，0.1.1）

本轮请求先出现网络失败；进一步打开官方个人中心后，网站自动跳到 /otn/resources/login.html，确认当前会话已失效。这不能解释上一轮已登录时缺订单数组的根因。orders 改为先建立个人中心页面上下文，并显式识别登录页返回 AUTH_REQUIRED，避免反复导航或把登录失效当作无订单。真实错误 trace `fa17be8b0ef1`。等待用户重新登录后继续检查订单响应，当前不宣称订单查询完成。

## 重新登录后订单空状态复验（2026-09-29）

发现旧登录标签页仍被命令选中，而另一标签页已成功登录；仅凭 login 路径拒绝调用会误报失效。现先调用官方 initMy12306Api 核验当前会话，不返回账号字段，再导航到 train_order.html。显式未登录响应仍返回 AUTH_REQUIRED，缺少可验证身份时保持未知，不自动反复导航。

成功订单响应的实际结构为 HTTP 200、status=true、httpstatus=200、messages=[]、validateMessages={}，省略 data。官方订单页同时显示“您没有未完成的订单哦～”。核查官方页面所引用的 [main_v30108.js](https://kyfw.12306.cn/otn/personalJS/dist/train_order/main_v30108.js)，无 data 成功分支显示空状态，而 AJAX 错误分支也使用同一空模板，因此不能只看页面文案。适配器要求有效服务器会话、完整成功信封、无 data/null，以及可见的 #not_complete 空状态且无订单表同时成立。普通缺字段、data={}、错误消息、隐藏或矛盾 DOM 均不当作空订单。

正式打包 CLI → Bridge → 扩展返回准确的 EMPTY_RESULT 说明，trace `3225174f6409`。这是无未完成订单的真实路径通过，不代表有订单时字段提取通过；未创建、取消或支付订单。沿用项目 EmptyResultError 返回形式，CLI 显示 error/非零退出码不代表本次查询发生网络故障。

业务范围修正：来源描述把 noComplete 与“尚未出行”混同，但官方页面将“未完成订单”和“未出行订单”分为不同标签/接口。保留来源 queryMyOrderNoComplete 能力，修正 manifest 与 guidance，避免无未完成订单被解释为没有已支付车票。来源原文仍保留在来源清单中供审计。

两站及宿主导航聚焦116项通过；账号信息、会话数据和真实订单内容未写入源码、fixture或文档。有订单数据提取、排队中订单形态与完整客户端自然语言验收仍未覆盖。
