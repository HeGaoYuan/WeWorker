# OpenCLI 51job 迁移记录

来源：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI/tree/24136945847afbfad266c6c46a8cd335377f9112/clis/51job)，固定 SHA `24136945847afbfad266c6c46a8cd335377f9112`，Apache-2.0，Copyright 2025 jackwener。

公开包：`adapters/51job.com` v0.1.0；来源 4 命令，本地 4 命令已接入既有 v2 Runner。**接入不等于逐项真实验收完成。** 只在公开 Profile 注册，内部仓库不包含本包。

## 数据与业务指导

we.51job.com 页面 API + jobs.51job.com SSR。维护知识见 [guidance](../adapters/51job.com/guidance.md)，与 manifest 确定性生成当前 Skill。已审阅来源源码及 docs/adapters/browser/51job.md；文档过时时以固定源码为准。参数解析在包内，不修改 WebCLI 全局类型转换。

完整机器可读清单见 [inventory](opencli_batch_inventory.json)，包含源文件、策略、import 依赖、参数类型/默认值/说明、读写及登录入口。迁移后不依赖 OpenCLI 运行时。

## 逐项迁移清单

### company

51job 公司简介 + 在招职位（按 encCoId）

- 性质：read；只读。
- 来源：clis/51job/company.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `encCoId`：string，必填。加密公司 ID（search 返回的 encCoId）
- `limit`：int，默认 20。返回职位数（1-50）

### detail

51job 职位详情（按 jobId）

- 性质：read；只读。
- 来源：clis/51job/detail.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `jobId`：string，必填。职位 ID（search 返回的 jobId）

### hot

51job 推荐职位（按城市/行业/排序浏览）

- 性质：read；只读。
- 来源：clis/51job/hot.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `area`：string，默认 "全国"。城市名或 6 位城市码（默认 "全国"）
- `sort`：string，默认 "综合"。排序：综合 / 最新 / 薪资 / 距离
- `page`：int，默认 1。页码（1-based）
- `limit`：int，默认 20。返回条数（1-50）

### search

51job 前程无忧关键词职位搜索

- 性质：read；只读。
- 来源：clis/51job/search.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `keyword`：string，必填。搜索关键词（岗位名 / 技能 / 公司）
- `area`：string，默认 "全国"。城市名或 6 位城市码（如 "杭州" / "080200" / "全国"）
- `salary`：string，默认 ""。薪资区间（如 "10-15k" / "1-1.5万" / "20-30k"）
- `experience`：string，默认 ""。工作年限（如 "应届" / "1-3年" / "3-5年" / "5-7年"）
- `degree`：string，默认 ""。学历要求（如 "本科" / "大专" / "硕士"）
- `companyType`：string，默认 ""。公司性质（如 "外资" / "国企" / "民营"）
- `companySize`：string，默认 ""。公司规模（如 "50-150" / "1000-5000"）
- `sort`：string，默认 "综合"。排序：综合 / 最新 / 薪资 / 距离
- `page`：int，默认 1。页码（1-based）
- `limit`：int，默认 20。返回条数（1-50）

## 真实验证证据

实际链路为 CLI → Bridge → 已连接扩展；不含桌面自然语言入口。

- search：未通过：宿主导航域名拦截，实际跳转域名未取得证据。trace：`9b3ff63788c1`。

包加载、确认门、参数和部分解析边界采用 fixture 测试，不能当站点验收。登录、账号数据、自然语言和所有写入未验收。详见 [批次验收步骤](opencli_batch_migration.md)。
