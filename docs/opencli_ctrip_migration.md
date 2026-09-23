# OpenCLI 携程迁移清单（进行中）

来源固定为 jackwener/OpenCLI 提交 `8271afc67e8504bda94c147f446ee29775d08274` 的 `clis/ctrip/`；本批仅处理携程，不代表整个 `clis/` 已调查或迁移。来源仓库根 `LICENSE` 与 `package.json` 均标示 Apache-2.0；携程源码没有额外文件级许可证声明，引用 `@jackwener/opencli/registry`、`errors` 和本目录 `utils.js`，没有复制图片、捕获样本或第三方资源。本包重新适配原有请求形状与结果投影，保留来源归属，Apache-2.0 完整文本见 `docs/third_party/OpenCLI-LICENSE.txt`。未引入 OpenCLI 运行依赖或新 npm 依赖。

现有根 `adapters/` 无携程包，不覆盖现有站点命令。来源有 14 项只读查询及 1 项登录写操作；`auth.js` 经 `clis/_shared/site-auth.js` 注册两个命令。除联想 API 外，来源命令需要浏览器页面、DOM、Cookie 或网络捕获，不可直接搬运为无浏览器的 API Adapter。用户入口为 `webcli call ctrip.com.<command-id>`；本次公开 Profile 只注册真正实现的两项。

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
