# OpenCLI zhihu 迁移记录

来源：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI/tree/24136945847afbfad266c6c46a8cd335377f9112/clis/zhihu)，固定 SHA `24136945847afbfad266c6c46a8cd335377f9112`，Apache-2.0，Copyright 2025 jackwener。

公开包：`adapters/zhihu.com` v0.1.1；来源 22 命令，本地 22 命令已接入既有 v2 Runner。**接入不等于逐项真实验收完成。** 只在公开 Profile 注册，内部仓库不包含本包。

## 数据与业务指导

知乎 v4 API、页面登录态；写入使用来源 API。维护知识见 [guidance](../adapters/zhihu.com/guidance.md)，与 manifest 确定性生成当前 Skill。已审阅来源源码及 docs/adapters/browser/zhihu.md；文档过时时以固定源码为准。参数解析在包内，不修改 WebCLI 全局类型转换。

完整机器可读清单见 [inventory](opencli_batch_inventory.json)，包含源文件、策略、import 依赖、参数类型/默认值/说明、读写及登录入口。迁移后不依赖 OpenCLI 运行时。

## 逐项迁移清单

### answer-comments

知乎回答评论列表（保留回复层级）

- 性质：read；只读。
- 来源：clis/zhihu/answer-comments.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `id`：string，必填。Answer ID, full Zhihu answer URL, or typed target (answer:<qid>:<aid>)
- `limit`：int，默认 20。Number of top-level comments (max 1000)
- `replies-limit`：int，默认 3。Number of replies to include per top-level comment (max 100)
- `order`：string，默认 "score"，枚举 ["score","latest"]。Root comment order

### answer-detail

知乎单个回答完整内容（按 answer ID 获取）

- 性质：read；只读。
- 来源：clis/zhihu/answer-detail.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `id`：string，必填。Answer ID, full Zhihu answer URL, or typed target (answer:<qid>:<aid>)
- `max-content`：int，默认 0。Optional cap on stripped content length in characters (0 = no truncation, return the full answer)

### answer

Answer a Zhihu question

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/zhihu/answer.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `target`：string，必填。Zhihu question URL or typed target
- `text`：string。Answer text
- `file`：string。Answer text file path
- `execute`：boolean。Actually perform the write action

### whoami

Verify current identity

- 性质：read；只读。
- 来源：clis/zhihu/auth.js；来源注册的认证/页面流程。
- 登录：https://www.zhihu.com/signin。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### login

Open official login; manual interaction

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/zhihu/auth.js；来源注册的认证/页面流程。
- 登录：https://www.zhihu.com/signin。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `timeout`：int，默认 300。

### collection

知乎收藏夹内容列表（需要登录）

- 性质：read；只读。
- 来源：clis/zhihu/collection.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `id`：string，必填。收藏夹 ID (数字，可从收藏夹 URL 中获取)
- `offset`：int，默认 0。起始偏移量（用于分页）
- `limit`：int，默认 20。每页数量（最大 20）

### collections

知乎收藏夹列表（需要登录）

- 性质：read；只读。
- 来源：clis/zhihu/collections.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20。每页数量（最大 20）

### comment

Create a top-level comment on a Zhihu answer or article

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/zhihu/comment.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `target`：string，必填。Zhihu target URL or typed target
- `text`：string。Comment text
- `file`：string。Comment text file path
- `execute`：boolean。Actually perform the write action

### download

导出知乎专栏文章或回答为 Markdown 格式

- 性质：read；只读。
- 来源：clis/zhihu/download.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已实现本地文件导出，支持原参数；真实证据及图片Bridge重启要求见批次记录。

参数（来源定义；当前 CLI 使用 --key=value）：

- `url`：string，必填。Column article URL, answer ID, typed target, or answer URL
- `output`：string，默认 "./zhihu-articles"。Output directory
- `download-images`：boolean，默认 false。Download images locally

### favorite

Favorite a Zhihu answer or article into a specific collection

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/zhihu/favorite.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `target`：string，必填。Zhihu target URL or typed target
- `collection`：string。Collection name
- `collection-id`：string。Stable collection id
- `execute`：boolean。Actually perform the write action

### follow

Follow a Zhihu user or question

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/zhihu/follow.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `target`：string，必填。Zhihu target URL or typed target
- `execute`：boolean。Actually perform the write action

### followers

知乎某用户的粉丝列表

- 性质：read；只读。
- 来源：clis/zhihu/followers.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `user`：string，必填。User url_token or people URL
- `limit`：int，默认 20。Number of followers to return (max 1000)

### following

知乎某用户关注的人列表

- 性质：read；只读。
- 来源：clis/zhihu/following.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `user`：string，必填。User url_token or people URL
- `limit`：int，默认 20。Number of followees to return (max 1000)

### hot

知乎热榜

- 性质：read；只读。
- 来源：clis/zhihu/hot.js；来源注册的认证/页面流程。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20。Number of items to return

### like

Like a Zhihu answer or article

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/zhihu/like.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `target`：string，必填。Zhihu target URL or typed target
- `execute`：boolean。Actually perform the write action

### pins

知乎某用户的想法（短内容）列表

- 性质：read；只读。
- 来源：clis/zhihu/pins.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `user`：string，必填。User url_token or people URL
- `limit`：int，默认 20。Number of pins to return (max 1000)

### question

知乎问题详情和回答

- 性质：read；只读。
- 来源：clis/zhihu/question.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `id`：string，必填。Question ID (numeric)
- `limit`：int，默认 5。Number of answers (max 1000; use normal-sized requests)
- `sort`：string，默认 "default"，枚举 ["default","created"]。Answer order: default or created

### recommend

知乎首页推荐

- 性质：read；只读。
- 来源：clis/zhihu/recommend.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20。Number of items to return (max 1000; use normal-sized requests)

### search

知乎搜索

- 性质：read；只读。
- 来源：clis/zhihu/search.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `query`：string，必填。Search query
- `limit`：int，默认 10。Number of results (max 1000; use normal-sized requests)
- `type`：string，默认 "all"，枚举 "TYPES"。Result type: all, answer, article, or question

### user-answers

知乎某用户的回答列表

- 性质：read；只读。
- 来源：clis/zhihu/user-answers.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `user`：string，必填。User url_token or people URL
- `limit`：int，默认 20。Number of answers to return (max 1000)

### user-articles

知乎某用户的文章/专栏列表

- 性质：read；只读。
- 来源：clis/zhihu/user-articles.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `user`：string，必填。User url_token or people URL
- `limit`：int，默认 20。Number of articles to return (max 1000)

### user

知乎用户主页资料（粉丝/关注/回答/文章/获赞数）

- 性质：read；只读。
- 来源：clis/zhihu/user.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `user`：string，必填。User url_token or people URL, e.g. wen-jie-16-47

## 真实验证证据

实际链路为 CLI → Bridge → 已连接扩展；不含桌面自然语言入口。

- hot：未通过：明确跳转登录页，待人工登录。trace：`cdc5efa83832`。

包加载、确认门、参数和部分解析边界采用 fixture 测试，不能当站点验收。登录、账号数据、自然语言和所有写入未验收。详见 [批次验收步骤](opencli_batch_migration.md)。

登录后新增验证见 [第二轮记录](opencli_batch_migration.md#登录后第二轮证据2026-09-28)。源码版本0.1.1新增download，不再仅返回链接。

重启后文件下载样本通过，见 [批次记录](opencli_batch_migration.md)：回答Markdown与7张图片，trace `610c948c0109`；专栏仍未真实验收。
