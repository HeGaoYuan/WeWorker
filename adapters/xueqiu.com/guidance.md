# 雪球

hot/hot-stock/feed/stock/kline/search/groups/watchlist/comments/earnings-date 为浏览器读取（行情、个股、K 线、讨论、自选、财报日历），访问 xueqiu.com；fund-holdings/fund-snapshot 读取 danjuanfunds.com 基金持仓与快照。whoami 校验登录并读取身份；login 仅打开登录页（写操作需确认，打开后人工完成登录再用 whoami 验证，不轮询登录状态）。行情接口有访问频率限制，触发限流时明确报错；缺字段保留 null/空串，不补造 0 或空列表。
