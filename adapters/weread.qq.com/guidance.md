# 微信读书

shelf/notes/notebooks/highlights/book/ai-outline 为浏览器读取（书架、笔记、划线、书籍详情与 AI 大纲），登录后可读个人数据；book-search/ranking/search 为后台 API（weread.qq.com/web 与 i.weread.qq.com 固定路径，仅 GET、禁重定向），搜索与排行无需页面上下文。whoami 校验登录并读取身份；login 仅打开登录页（写操作需确认，打开后人工完成登录再用 whoami 验证，不轮询登录状态）。接口返回登录墙或结构变化时报错而非空结果；缺字段保留 null/空串，不补造 0 或空列表。
