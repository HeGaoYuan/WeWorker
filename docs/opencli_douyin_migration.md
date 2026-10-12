# OpenCLI douyin 迁移记录

来源：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI/tree/24136945847afbfad266c6c46a8cd335377f9112/clis/douyin)，固定 SHA `24136945847afbfad266c6c46a8cd335377f9112`，Apache-2.0，Copyright 2025 jackwener。

公开包：`adapters/douyin.com` v0.1.0；来源 16 命令，本地 14 命令已接入既有 v2 Runner。**接入不等于逐项真实验收完成。** 只在公开 Profile 注册，内部仓库不包含本包。

## 数据与业务指导

创作者与公开视频 API；delete 为目标卡片 UI。维护知识见 [guidance](../adapters/douyin.com/guidance.md)，与 manifest 确定性生成当前 Skill。已审阅来源源码及 docs/adapters/browser/douyin.md；文档过时时以固定源码为准。参数解析在包内，不修改 WebCLI 全局类型转换。

完整机器可读清单见 [inventory](opencli_batch_inventory.json)，包含源文件、策略、import 依赖、参数类型/默认值/说明、读写及登录入口。迁移后不依赖 OpenCLI 运行时。

## 逐项迁移清单

### activities

官方活动列表

- 性质：read；只读。
- 来源：clis/douyin/activities.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### whoami

Verify current identity

- 性质：read；只读。
- 来源：clis/douyin/auth.js；来源注册的认证/页面流程。
- 登录：https://creator.douyin.com/。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### login

Open official login; manual interaction

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/douyin/auth.js；来源注册的认证/页面流程。
- 登录：https://creator.douyin.com/。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `timeout`：int，默认 300。

### collections

合集列表

- 性质：read；只读。
- 来源：clis/douyin/collections.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20。

### delete

删除作品（优先使用创作者后台作品管理；找不到时回退到旧删除接口）

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/douyin/delete.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `aweme_id`：string，必填。作品 ID / item_id

### draft

上传视频并保存为草稿

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/douyin/draft.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：待实现：官方上传页 set_file_input、封面、表单及保存证据；上传跨页面会销毁页面调用，尚缺经验证的分阶段续执行方案，写操作不能重放。。

参数（来源定义；当前 CLI 使用 --key=value）：

- `video`：string，必填。视频文件路径
- `title`：string，必填。视频标题（≤30字）
- `caption`：string，默认 ""。正文内容（≤1000字，支持 #话题）
- `cover`：string，默认 ""。封面图片路径
- `visibility`：string，默认 "public"，枚举 ["public","friends","private"]。

### drafts

获取草稿列表

- 性质：read；只读。
- 来源：clis/douyin/drafts.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20。

### hashtag

话题搜索 / AI推荐 / 热点词

- 性质：read；只读。
- 来源：clis/douyin/hashtag.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `action`：string，必填，枚举 ["search","suggest","hot"]。search=关键词搜索 (--keyword 必填), suggest=AI推荐 (--cover 必填), hot=热点词 (--keyword 可选)
- `keyword`：string，默认 ""。搜索关键词. search 必填; hot 可选; suggest 不使用 (传 --cover)
- `cover`：string，默认 ""。封面 URI (cover_uri). suggest 必填; 其它 action 不使用
- `limit`：int，默认 10。

### location

地理位置 POI 搜索

- 性质：read；只读。
- 来源：clis/douyin/location.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `query`：string，必填。地名关键词
- `limit`：int，默认 20。

### profile

获取账号信息

- 性质：read；只读。
- 来源：clis/douyin/profile.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

无业务参数。

### publish

定时发布视频到抖音（必须设置 2h ~ 14天后的发布时间）

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/douyin/publish.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：待实现：视频/封面二进制、TOS 分块上传与签名、转码、安全检查、合集/活动/地点、2小时至14天定时与发布回执。来源可等待5分钟，当前宿主单次预算105秒；不能仅增超时或用 draft/update 替代。。

参数（来源定义；当前 CLI 使用 --key=value）：

- `video`：string，必填。视频文件路径
- `title`：string，必填。视频标题（≤30字）
- `schedule`：string，必填。定时发布时间（ISO8601 或 Unix 秒，2h ~ 14天后）
- `caption`：string，默认 ""。正文内容（≤1000字，支持 #话题）
- `cover`：string，默认 ""。封面图片路径（不提供时使用视频截帧）
- `visibility`：string，默认 "public"，枚举 ["public","friends","private"]。
- `allow_download`：bool，默认 false。允许下载
- `collection`：string，默认 ""。合集 ID
- `activity`：string，默认 ""。活动 ID
- `poi_id`：string，默认 ""。地理位置 ID
- `poi_name`：string，默认 ""。地理位置名称
- `hotspot`：string，默认 ""。关联热点词
- `no_safety_check`：bool，默认 false。跳过内容安全检测
- `sync_toutiao`：bool，默认 false。同步发布到头条

### search

关键词搜索抖音视频

- 性质：read；只读。
- 来源：clis/douyin/search.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `query`：string，必填。搜索关键词
- `limit`：int，默认 10。`结果数量 (1-${MAX_SEARCH_LIMIT})`

### stats

获取单个作品的创作者中心深层指标

- 性质：read；只读。
- 来源：clis/douyin/stats.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `aweme_id`：string，必填。抖音作品 ID（aweme_id，可从作品 URL 末尾获取）

### update

更新视频信息

- 性质：write；保留宿主确认；本轮不执行真实写操作。
- 来源：clis/douyin/update.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `aweme_id`：string，必填。抖音作品 ID（aweme_id，可从作品 URL 末尾获取）
- `reschedule`：string，默认 ""。新的发布时间（ISO8601 或 Unix 秒）
- `caption`：string，默认 ""。新的正文内容

### user-videos

获取指定用户的视频列表（含下载地址和热门评论）

- 性质：read；只读。
- 来源：clis/douyin/user-videos.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `sec_uid`：string，必填。用户 sec_uid（个人主页 URL 末尾部分，也可直接传整条主页 URL）
- `limit`：int，默认 20。获取数量（最大 20）
- `with_comments`：bool，默认 true。包含热门评论（默认: true）
- `comment_limit`：int，默认 10。每个视频获取多少条评论（最大 10）

### videos

获取作品列表

- 性质：read；只读。
- 来源：clis/douyin/videos.js；Strategy.COOKIE。
- 登录：复用站点浏览器会话；实际要求取决于接口/页面和账号权限。
- 状态：已接入；测试覆盖和真实证据见下文，其余真实路径待验收。

参数（来源定义；当前 CLI 使用 --key=value）：

- `limit`：int，默认 20（来源常量 DEFAULT_LIMIT）。最多返回多少个作品（跨页自动收集）
- `status`：string，默认 "all"，枚举 ["all","published","reviewing","scheduled"]。

## 真实验证证据

实际链路为 CLI → Bridge → 已连接扩展；不含桌面自然语言入口。

- search：未通过：站点要求人工验证。trace：`be0338527972`。

包加载、确认门、参数和部分解析边界采用 fixture 测试，不能当站点验收。登录、账号数据、自然语言和所有写入未验收。详见 [批次验收步骤](opencli_batch_migration.md)。
