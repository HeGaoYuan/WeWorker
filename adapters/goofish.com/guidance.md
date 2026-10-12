# 闲鱼

search/item/inbox/messages/chat 为浏览器读取（搜索、商品详情、消息收件箱与会话），访问 goofish.com；publish/reply/chat 为写操作需确认：publish 发布纯文本闲置商品（本运行时无文件系统，不支持图片上传，price 为正数、condition 为全新/几乎全新/轻微使用/明显使用/老旧之一），reply 回复会话消息，chat 发送聊天消息，均通过页面 UI 自动化完成且不自动重放。whoami 校验登录并读取身份；login 仅打开登录页（写操作需确认，打开后人工完成登录再用 whoami 验证，不轮询登录状态）。登录墙或页面结构变化时报错而非空结果；缺字段保留 null/空串，不补造 0 或空列表。
