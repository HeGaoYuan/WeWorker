# Twitter/X

profile/timeline/tweets/thread/search/trending/notifications/followers/following/lists/list-tweets/likes/bookmarks/bookmark-folders/article/download 为读取（访问 x.com）；download 返回媒体 URL 清单不落盘（本运行时无文件系统），bookmarks/likes 的 --all 为纯内存分页不支持断点文件。
post/quote/reply/reply-dm 为写操作需确认：仅支持纯文本（无本地图片附件），通过页面 UI 自动化完成；like/unlike/retweet/unretweet/bookmark/unbookmark/follow/unfollow/block/unblock/accept/hide-reply/device-follow 为关系与互动写操作需确认；mute-word 与 list-add/list-remove/list-create/list-delete（含批量）为列表与设置写操作需确认，list-delete 需额外 confirm 参数。所有写操作不自动重放；提交结果未确认时报告超时并提示先核查是否已生效，避免重复发帖。
whoami 校验登录并读取身份；login 仅打开登录页（写操作需确认，打开后人工完成登录再用 whoami 验证，不轮询登录状态）。followers/notifications 通过网络捕获读取 GraphQL 响应，捕获超时报错；未登录、账号受限或页面结构变化时报错而非空结果；缺字段保留 null/空串，不补造 0 或空列表。
