# 微博

feed/hot/search/user/user-posts/post/comments/favorites/me 为浏览器读取（时间线、热搜、搜索、用户页、单条微博与评论），访问 weibo.com；publish/delete 为写操作需确认：publish 发布纯文本微博（本运行时无文件系统，不支持图片上传），delete 删除指定微博，均通过页面 UI 自动化完成且不自动重放。whoami 校验登录并读取身份；login 仅打开登录页（写操作需确认，打开后人工完成登录再用 whoami 验证，不轮询登录状态）。登录墙、风控验证或页面结构变化时报错而非空结果；缺字段保留 null/空串，不补造 0 或空列表。
