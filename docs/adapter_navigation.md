# 页面命令的宿主导航续执行

页面命令通过现有 Extension Runner 执行，宿主负责在无页面时打开声明的 routeDomain，并串行处理同一 tab 的注入、调用、导航和结果。

需要切换页面的处理器返回保留结构：

```json
{"__webcli_navigation":{"version":1,"url":"https://example.com/results","resume":true}}
```

这是显式协议；普通业务结果 status=navigating 不会触发自动重放。resume=true 仅允许 manifest 中声明为 read 的命令；处理器必须在执行业务副作用前返回续执行请求。宿主校验 URL、等待加载、重新核验包摘要、重新注入，并以原参数调用同一命令。写操作无论 requires_confirmation 是否关闭，均不能恢复执行；可用 resume=false 终止导航并返回 result，例如打开官方登录页。

允许恢复的目标仅限 match 中的 HTTP(S) 域名；终止导航还可使用 runtime_allowed_hosts。禁止 URL 凭据，最终重定向主机也要校验。每个 tab 的队列覆盖完整事务，最多 4 次导航，105 秒执行预算（包括排队耗时），单次页面等待最多 25 秒。业务处理器抛错、连接中断或超时不重放；只有业务处理器启动前的文档切换注入失败允许至多 3 次注入尝试。超时无法撤销页面已发出的请求，不把超时理解为操作没有发生。

派生 Skill 说明自动开页；包内 guidance.md 负责业务任务顺序、参数来源及结果含义。自然语言规划仍由 Agent 完成。新协议不会自动改写其他包过去返回的普通 navigating 结果；Adapter 作者需要按此协议改造导航步骤。

框架在内外仓库同步；携程包是本轮使用该协议的实现。后台 API 继续通过已有 Bridge/Extension 路径，无需业务标签页，仍要求连接扩展。
