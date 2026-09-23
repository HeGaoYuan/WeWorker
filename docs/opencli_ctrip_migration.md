# OpenCLI 携程迁移清单（本地实现完成，真实站点待验）

## 来源与许可

来源固定为 `jackwener/OpenCLI` 提交 `8271afc67e8504bda94c147f446ee29775d08274` 的 `clis/ctrip/`；本批只处理携程，不代表整个 `clis/` 已迁移。来源仓库根 `LICENSE` 与 `package.json` 均标示 Apache-2.0；携程源码没有额外文件级许可证声明，也没有引用图片、原始捕获样本或其他第三方资源。

实现按 WeWorker v2 契约重新适配请求、页面生命周期和结果投影，没有复制 OpenCLI 运行依赖。来源归属及完整许可证保存在 `docs/third_party/OpenCLI-LICENSE.txt`，桌面包复制为 `licenses/OpenCLI-LICENSE.txt`。没有新增 npm 依赖，没有带入凭据、Cookie 值、本机路径、用户数据或真实网络响应。

## 分类与架构处理

- **不涉及 DOM（6 项）**：`search`、`hotel-suggest` 使用页面同源公开联想 API；`whoami` 使用受限 Cookie helper；`login` 仅执行确认后的官方登录页导航；`hotel-search`、`hotel` 读取页面 `window.__NEXT_DATA__` SSR 状态。
- **DOM 提取（8 项）**：`train`、`bus`、`ferry`、`flight-round`、`attraction`、`cruise`、`tour`、`package` 从页面稳定选择器读取列表，并在需要时滚动加载。
- **混合（1 项）**：`flight` 用 DOM 只判断页面或验证码是否就绪，业务结果来自页面自然产生的 `batchSearch` 网络响应，不重建携程请求。
- 按“是否调用 DOM”统计为涉及 DOM 9 项、不涉及 DOM 6 项；按“业务数据来源”统计为 DOM 8、API 2、Cookie/导航 2、SSR 2、网络响应 1。
- 全部命令继续使用既有 Extension Runner；没有新建旁路 Runner，没有改动 Toolkit 或 Toolkit 自动探索。
- 页面导航会销毁当前注入脚本，页面命令采用“首次导航、加载后相同参数再次调用”。登录采用“确认后打开官方登录页，人工完成后调用只读 `whoami` 验证”，不伪装成可跨导航等待的长调用。

根 `adapters/` 原先没有携程包，因此没有覆盖现有同站点能力；第一批两个联想命令保持兼容，本批扩展到全部 15 项。用户入口统一为 `webcli call ctrip.com.<command-id>`。

## 当前命令清单

| 来源命令 | 参数、输出与分页行为 | 分类 / 安全 | 本地处理结果与证据 | 真实环境剩余项 |
| --- | --- | --- | --- | --- |
| `search` | `query`、`limit=15`（1–50）；目的地/景点/车站联想；首批截取，无游标 | API；read | 已迁移；同源 POST、禁重定向、无凭据；mock 覆盖输入、响应和上游错误 | 真实联想 API 返回形状 |
| `hotel-suggest` | `query`、`limit=15`（1–50）；城市/商圈/酒店联想；首批截取 | API；read | 已迁移；与 `search` 共用实现并保留 `searchType=H` | 真实联想 API 返回形状 |
| `whoami` | 无参数；仅返回 `logged_in/name/vip_grade` | Cookie，非 DOM；read | 已迁移；不返回 `login_uid` 或任何 Cookie 值；mock 验证脱敏 | 已登录账号只读复验 |
| `login` | 无业务参数；打开官方登录页 | 导航，非 DOM；write | 已迁移；确认门生效；未登录时导航，已登录时最小化返回 | 人工登录、验证码及随后 `whoami` 复验 |
| `hotel-search` | `city/checkin/checkout/limit=10`（1–30）；SSR 首屏通常约 13 条，无后续页 | SSR 页面状态，非 DOM；read | 已迁移；日期关系、列表映射和空结果有 fixture | 真实 `__NEXT_DATA__` 结构与首屏数量 |
| `hotel` | `id`；单酒店详情、评分、设施、政策和位置 | SSR 页面状态，非 DOM；read | 已迁移；详情状态和字段投影有 fixture | 真实详情页 SSR 结构 |
| `train` | `from/to/date/limit=20`（1–50）；滚动后截取 | DOM；read | 已迁移；深链接、验证码、滚动和卡片解析有 fixture | 真实选择器和懒加载 |
| `bus` | `from/to/date/limit=20`（1–50）；滚动后截取 | DOM；read | 已迁移；保留携程 `param` 深链接形状和字段解析 | 真实选择器和验证码 |
| `ferry` | `from/to/date/limit=20`（1–50）；滚动后截取 | DOM；read | 已迁移；船名、港口、时间、票价和状态有 fixture | 真实选择器和验证码 |
| `flight` | `from/to/date/limit=20`（1–50）；合并批次至上游 `finished=true`，再排序截取 | 网络响应 + DOM 就绪；read | 已迁移；8 MiB/20 条受限捕获、同域/声明域过滤、脱敏日志、截断/状态/JSON/恢复测试 | 真实 `batchSearch` 响应体大小、批次数和风控 |
| `flight-round` | `from/to/depart/return/limit=20`（1–50）；滚动后返回去程腿与往返总价 | DOM；read | 已迁移；日期关系、文本块解析和票价有 fixture | 真实卡片文本结构 |
| `attraction` | `city/limit=20`（1–50）；当前城市景点链接去重截取 | DOM；read | 已迁移；城市范围、评分和万级点评数有 fixture | 真实城市页和重定向行为 |
| `cruise` | `port/limit=20`（1–50）；先解析港口代码，可能两次导航 | DOM；read | 已迁移；港口索引、二次导航和线路卡片有 fixture | 真实港口索引及空结果文案 |
| `tour` | `destination/limit=20`（1–50）；当前列表截取，无游标 | DOM；read | 已迁移；标题、标签、评分、销量、点评和价格有 fixture | 真实列表选择器 |
| `package` | `destination/limit=20`（1–50）；自由行当前列表截取，无游标 | DOM；read | 已迁移；复用度假列表解析，保持独立命令和路由 | 真实列表选择器 |

## 整合、安全与验证

- manifest 仅声明 10 个实际命令路由域名。`login` 是唯一 write 命令，继续使用 v2 确认门；其余 14 项均为 read。
- `network_capture_start/read` 复用现有 CDP 附着设施，只捕获匹配 pattern 且属于当前页或 manifest 许可域名的响应；最多保留 20 条、单体返回最多 8 MiB，日志只记录元数据。helper 只释放自己建立的 debugger 附着，并在 detach/tab removal 时清理会话。
- v2 校验确认 `ctrip.com` 版本 `0.2.0`、15 个 Extension 命令，manifest、模块注册、路由域名和 safety 一致。
- Ctrip/mock 与包聚焦 61 项、WebCLI 全量 83 文件/597 项、Extension 加载器/运行时 16 项、Profile/打包 6 项全部通过。
- `prepare-build.cjs` 成功，公开 Profile 生成 8 个 host-managed 包；内建携程包为 `0.2.0`/15 命令，CLI 结构化帮助可见全部 15 个规范命令。
- 没有执行真实点赞、发帖、删除、预订、购买或支付。上述证据不等于真实携程、真实登录、验证码、完整安装包或 macOS 验收通过。`certify-api-adapters` 不用于本批 DOM/SSR/混合命令，也没有把两项联想 mock 写成 live API 认证。

## 需要人工参与

1. 在测试账号环境完成人工登录或验证码，然后调用 `webcli call ctrip.com.whoami`，确认只返回最小化字段。
2. 对 14 个只读查询使用公开测试参数逐项复验页面导航、真实选择器、输出和空结果；不进行下单、预订或支付。
3. 特别观察单程航班是否完整捕获多个 `batchSearch` 响应、是否触发 8 MiB 上限，以及验证码后的重试行为。
4. 后续再继续此前暂缓的真实 API 生成、Windows 最新修复包和 macOS 验收；本记录不把这些事项标为完成。

## 第一批历史记录

以下表格和数字是仅完成两个联想命令时的历史快照，其中“待迁移”状态已由上方当前清单取代。

| 来源文件 / 命令 | 参数与结果、分页 | 执行依赖 / 处理结果 | 证据或待办 |
| --- | --- | --- | --- |
| `search.js` / `search` | query、limit=15 (1–50)；目的地/景点/车站等联想行；首批截取，无分页游标 | **已迁移** `ctrip.com.search`；m.ctrip.com 页面同源 POST，read，无凭据 | `webcli/__tests__/ctrip-adapter.test.js` mock；真实站点待测 |
| `hotel-suggest.js` / `hotel-suggest` | query、limit=15 (1–50)；城市/商圈/酒店联想行；首批截取 | **已迁移** `ctrip.com.hotel-suggest`；同一 API，searchType=H | 同上；真实站点待测 |
| `auth.js` / `whoami` | 无参数；用户 ID、姓名、会员等级 | **待迁移**；Cookie login_uid/AHeadUserInfo + 个人信息页；属于敏感个人数据 | 需设计最小化输出和已登录页面/权限 mock，禁止记录 Cookie |
| `auth.js` / `login` | timeout；登录交互状态；来源 access=write | **待迁移**；浏览器导航及人工登录、轮询 Cookie；迁移时必须标记 write 并经确认门 | 需要人工交互，不在 mock 中宣称登录成功 |
| `attraction.js` / `attraction` | city 数字 ID、limit=20 (1–50)；景点/评分/点评/URL，渲染列表截取 | **待迁移**；you.ctrip.com 页面导航、等待验证码、DOM 提取 | 需页面生命周期与 DOM fixture |
| `bus.js` / `bus` | from、to、date、limit=20；汽车班次，滚动列表截取 | **待迁移**；bus.ctrip.com 深链接、验证码/DOM/滚动 | 需页面生命周期与 DOM fixture |
| `cruise.js` / `cruise` | port、limit=20；邮轮线路，列表截取 | **待迁移**；cruise.ctrip.com 端口查找、导航和 DOM | 需跨导航恢复及 DOM fixture |
| `ferry.js` / `ferry` | from、to、date、limit=20；船班，滚动列表截取 | **待迁移**；ship.ctrip.com 深链接、验证码/DOM/滚动 | 需页面生命周期与 DOM fixture |
| `flight-round.js` / `flight-round` | from、to IATA、depart、return、limit=20；往返航班，滚动列表截取 | **待迁移**；flights.ctrip.com 导航和 DOM | 需日期校验、双程输出/DOM fixture |
| `flight.js` / `flight` | from、to IATA、date、limit=20；单程航班，批量响应截取 | **待迁移**；INTERCEPT 策略/CDP 网络捕获，不可改成静态 DOM 占位 | 需受限网络捕获能力与脱敏 fixture，不记录真实响应 |
| `hotel-search.js` / `hotel-search` | city、checkin、checkout、limit=20；酒店/报价，SSR 首屏约 13 条 | **待迁移**；hotels.ctrip.com SSR 页面、日期校验；限制并非真实分页 | 需首屏边界与 DOM fixture |
| `hotel.js` / `hotel` | id；酒店详情/评分设施政策，单行 | **待迁移**；hotels.ctrip.com SSR 详情页 | 需页面/DOM fixture |
| `package.js` / `package` | destination、limit=20；机酒套餐列表截取 | **待迁移**；vacations.ctrip.com DOM | 需页面/DOM fixture |
| `tour.js` / `tour` | destination、limit=20；跟团线路列表截取 | **待迁移**；vacations.ctrip.com DOM | 需页面/DOM fixture |
| `train.js` / `train` | from、to、date、limit=20；列车班次列表截取 | **待迁移**；trains.ctrip.com 深链接和 DOM | 需页面/DOM fixture |

实现顺序：公开 API 两项 → 其余页面只读命令按酒店、交通、景点/度假分组 → 网络捕获单程航班 → 登录与个人信息。页面导航会销毁当前注入脚本，不能把 OpenCLI 的 `page.goto/evaluate` 原样移入 v2 命令；后续须遵守既有 Extension Runner 和宿主目录/授权边界，必要时采用显式两步页面导航/重调用约定，而不是新建旁路 Runner。Toolkit 自动探索不在此任务范围。

验证：包校验 `node webcli/index.js adapter validate adapters/ctrip.com`，mock 页面请求/响应测试 5/5，WebCLI 全量 83 文件 566/566，扩展加载/运行时 14/14，Profile/打包聚焦 6/6；公开 `prepare-build.cjs` 成功并将两个命令复制到内建包，CLI JSON 帮助报告两个命令。旧 API 认证清单排除不在其旧目录的 v2 页面包，没有把 DOM 包冒充 API 认证。许可文本同时在源码仓库和桌面资源 `licenses/OpenCLI-LICENSE.txt` 中保留。上述测试不等于真实携程 API、登录、验证码或浏览器页面验收；尚未生成最终安装包。无实际网站写操作。公开 Profile 添加新包；其他站点包、旧目录和内部仓库未改。
