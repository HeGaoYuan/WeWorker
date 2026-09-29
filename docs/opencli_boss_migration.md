# OpenCLI boss 迁移记录

来源：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI/tree/24136945847afbfad266c6c46a8cd335377f9112/clis/boss)，固定 SHA `24136945847afbfad266c6c46a8cd335377f9112`，Apache-2.0，Copyright 2025 jackwener。

公开包：`adapters/zhipin.com` v0.1.0；来源 16 命令，本地 16 命令已接入既有 v2 Runner。**接入不等于逐项真实验收完成。** 只在公开 Profile 注册，内部仓库不包含本包。

## 数据与业务指导

页面 XHR API；search 受限网络捕获；send/batchgreet 为 UI。维护知识见 [guidance](../adapters/zhipin.com/guidance.md)，与 manifest 确定性生成当前 Skill。已审阅来源源码及 docs/adapters/browser/boss.md；文档过时时以固定源码为准。参数解析在包内，不修改 WebCLI 全局类型转换。

完整机器可读清单见 [inventory](opencli_batch_inventory.json)，包含源文件、策略、import 依赖、参数类型/默认值/说明、读写及登录入口。迁移后不依赖 OpenCLI 运行时。

## 逐项迁移清单

### whoami

Verify current identity

- 性质：read；只读。
- 来源：clis/boss/auth.js；来源注册的认证/页面流程。
- 登录：https://login.zhipin.com/。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### login

Open official login; manual interaction

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/boss/auth.js；来源注册的认证/页面流程。
- 登录：https://login.zhipin.com/。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `timeout`：int，默认 300。

### batchgreet

BOSS直聘批量向推荐候选人发送招呼

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/boss/batchgreet.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `job-id`：string，默认 ""。Filter by encrypted job ID (greet all jobs if empty)
- `limit`：int，默认 5。Max candidates to greet
- `text`：string，默认 ""。Custom greeting message (uses default if empty)

### chatlist

BOSS直聘查看聊天列表（招聘端/求职端）

- 性质：read；只读。
- 来源：clis/boss/chatlist.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `page`：int，默认 1。Page number
- `limit`：int，默认 20。Number of results
- `job-id`：string，默认 "0"。Filter by job ID (0=all, boss side only)
- `side`：string，默认 "auto"，枚举 ["auto","boss","geek"]。Identity side: auto (default), boss (recruiter), or geek (job-seeker)

### chatmsg

BOSS直聘查看聊天消息历史（招聘端/求职端）

- 性质：read；只读。
- 来源：clis/boss/chatmsg.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `uid`：string，必填。Encrypted UID (from chatlist)
- `page`：int，默认 1。Page number
- `side`：string，默认 "auto"，枚举 ["auto","boss","geek"]。Identity side: auto (default), boss (recruiter), or geek (job-seeker)

### detail

BOSS直聘查看职位详情

- 性质：read；只读。
- 来源：clis/boss/detail.js；Strategy.UI。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `security-id`：string，必填。Security ID from search results (security_id field)

### exchange

BOSS直聘交换联系方式（请求手机/微信）

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/boss/exchange.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `uid`：string，必填。Encrypted UID of the candidate
- `type`：string，默认 "phone"，枚举 ["phone","wechat"]。Exchange type: phone or wechat

### greet

BOSS直聘向新候选人发送招呼（开始聊天）

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/boss/greet.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `uid`：string，必填。Encrypted UID of the candidate (from recommend)
- `security-id`：string，必填。Security ID of the candidate
- `job-id`：string，必填。Encrypted job ID
- `text`：string，默认 ""。Custom greeting message (uses default template if empty)

### invite

BOSS直聘发送面试邀请

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/boss/invite.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `uid`：string，必填。Encrypted UID of the candidate
- `time`：string，必填。Interview time (e.g. 2025-04-01 14:00)
- `address`：string，默认 ""。Interview address (uses saved address if empty)
- `contact`：string，默认 ""。Contact person name (uses saved contact if empty)

### joblist

BOSS直聘查看我发布的职位列表

- 性质：read；只读。
- 来源：clis/boss/joblist.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### mark

BOSS直聘给候选人添加标签

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/boss/mark.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `uid`：string，必填。Encrypted UID of the candidate
- `label`：string，必填。Label name (新招呼/沟通中/已约面/已获取简历/已交换电话/已交换微信/不合适/收藏) or label ID
- `remove`：boolean，默认 false。Remove the label instead of adding

### recommend

BOSS直聘查看推荐候选人（新招呼列表）

- 性质：read；只读。
- 来源：clis/boss/recommend.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20。Number of results to return

### resume

BOSS直聘查看候选人简历（招聘端）

- 性质：read；只读。
- 来源：clis/boss/resume.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `uid`：string，必填。Encrypted UID of the candidate (from chatlist)

### search

BOSS直聘搜索职位（不带关键词时返回为你推荐职位）

- 性质：read；只读。
- 来源：clis/boss/search.js；Strategy.INTERCEPT。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `query`：string。Search keyword (optional, empty = recommended jobs)
- `city`：string，默认 "北京"。City name or code (e.g. 杭州, 上海, 101010100)
- `experience`：string，默认 ""。Experience: 在校生(实习)/应届生(校招)/经验不限/1年以内/1-3年/3-5年/5-10年/10年以上
- `degree`：string，默认 ""。Degree: 大专/本科/硕士/博士
- `salary`：string，默认 ""。Salary: 3K以下/3-5K/5-10K/10-15K/15-20K/20-30K/30-50K/50K以上
- `industry`：string，默认 ""。Industry code or name (e.g. 100020, 互联网)
- `jobType`：string，默认 ""。Job type: 全职/兼职/实习（不传=不限，混合校招与实习）
- `page`：int，默认 1。Page number
- `limit`：int，默认 15。Number of results

### send

BOSS直聘发送聊天消息

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/boss/send.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `uid`：string，必填。Encrypted UID of the candidate (from chatlist)
- `text`：string，必填。Message text to send

### stats

BOSS直聘职位数据统计

- 性质：read；只读。
- 来源：clis/boss/stats.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `job-id`：string，默认 ""。Encrypted job ID (show all if empty)

## 真实验证证据

实际链路为 CLI → Bridge → 已连接扩展；不含桌面自然语言入口。

- search：未通过：捕获空/不完整 JSON；已加查询匹配与明确错误，待复验。trace：`007374067221`。

包加载、确认门、参数和部分解析边界采用 fixture 测试，不能当站点验收。登录、账号数据、自然语言和所有写入未验收。详见 [批次验收步骤](opencli_batch_migration.md)。
