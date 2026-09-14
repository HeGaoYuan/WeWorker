# Webwright Toolkit 产品升级 Roadmap

## 文档定位

- 状态：执行中。
- 更新时间：2026-08-09。
- 适用范围：Python harness 的 `local_browser + local_cdp` 模式。
- 产品依据：[`toolkit_product_design.md`](toolkit_product_design.md)。
- 技术依据：[`toolkit_technical_design.md`](toolkit_technical_design.md)。
- 交互依据：[`../src/webwright/server/web/`](../src/webwright/server/web/)。

本文档是 Toolkit 产品升级的唯一进度源，只记录阶段状态、已完成成果、下一步、阻塞和最近验证。产品规则以产品设计为准，技术实现以技术设计为准；项目级 `ROADMAP.md` 只保留整体概览和本文档入口。

## 当前阶段

阶段一至阶段七均已完成。下一阶段为阶段八「多 Tool 组合与系统验收」。

## 阶段进度

| 阶段 | 状态 | 成果或目标 |
|---|---|---|
| 一、领域模型与持久化基础 | 已完成 | Toolkit、Tool 及其活动具备稳定的数据基础。 |
| 二、Toolkit Runtime 与最小 Tool Runner | 已完成 | Tool 可在受控浏览器环境中独立运行。 |
| 三、Exploration 产品化接入 | 已完成 | Exploration 全生命周期已纳入 Toolkit 产品流程。 |
| 四、Debug Run 执行链 | 已完成 | 正式版本和开发中版本均可调试并留存结果。 |
| 五、Developer Agent 与开发中版本 | 已完成 | 支持首次开发、继续开发、重新开始及基于 Exploration 重新开发。 |
| 六、发布与正式交付物 | 已完成 | 发布、正式调试、当前产物验证和只读导出已闭环；交付物为 Runtime 状态外置、运行规格内嵌的标准四文件 Skill。 |
| 七、三工作区接入真实后端 | 已完成 | 探索、开发、调试三个工作区及全局管理能力已接入真实后端。 |
| 八、多 Tool 组合与系统验收 | 待开始 | 完成同一 Toolkit 下多 Tool 固定顺序调试、共享状态、失败中止、重启恢复和系统级验收。 |

## 已完成

- 2026-08-09：在现有「探索｜开发｜调试」产品结构内增加开发中代码手动编辑与保存。代码下方默认显示「编辑代码」，进入编辑态后原位切换为「取消修改／保存修改」；界面隐藏 `code_hash`／`artifact_hash` 原始值，只展示首次开发、已发布版本、当前产物和旧产物等语义状态。人工保存和 Developer Agent 共用唯一开发中槽位，保存只替换 Python 代码并保留现有契约与开发依据；预期 `code_hash`、全局活动互斥和 Slot 结构校验共同阻止并发覆盖或无效签名，保存生成新哈希后必须重新调试成功才能发布。正式代码、Schema、运行契约和封存的工作区重构方案均未实施。
- 2026-07-21：正式 Skill 删除 `scripts/toolkit.json`，Toolkit ID、允许域名、起始 URL 和参数／返回值 Schema 内嵌于 `toolkit.py`；Published Runtime 改为显式接收运行规格，formal Debug 通过 stdin 将原始参数 JSON 交给正式 CLI 校验和执行，导出收敛为四文件。
- 2026-07-20：优化重新开发和模型管理交互：选择 Exploration 后先填写指令再启动；模型管理改为列表优先。
- 2026-07-19：正式 Skill frontmatter `description` 改为「Toolkit 描述＋当需要操作以下域名的网页时可使用」，不再列举 Tool 名称；当前天津 Skill 已确定性重建。
- 2026-07-19：正式 Skill 对外调用入口切换为 `webcli-py scripts/toolkit.py <tool>`；生成说明不再要求用户安装 Python／Playwright 或执行 pip，五文件结构、正式执行文件和 `artifact_hash` 范围保持不变。
- 2026-07-18：修复首次开发入口与指令输入：正式／开发槽位都为空时，开发工作区使用普通首次开发入口，显示选中的成功 Exploration、必填用户指令和「开始开发」按钮；首次开发不再复用 exploration-only restart API，已有正式版本的重新开发隔离规则保持不变。
- 2026-07-18：完成「从探索重新开发」：已发布 Tool 可从一次成功 Exploration 重新开发，且不继承正式／开发中代码或历史 Debug 证据；失败不影响现有正式版本。
- 2026-07-18：完成正式交付闭环：标准五文件 Skill、Runtime 状态外置、formal Debug、当前产物验证、五文件只读导出、旧生成物迁移清理及系统验收全部通过。
- 2026-07-15：完成阶段一至阶段七，Toolkit 的领域数据、运行、探索、调试、开发、发布和三工作区产品流程全部落地。

## 进行中

- 无。

## 下一步

- 实施阶段八「多 Tool 组合与系统验收」。

## 阻塞

- 外部模型实跑阻塞：当前激活的智谱 `glm-4.7` 在 Google Flights Exploration 中出现 `ReadTimeout`。该问题不阻塞已由本地受控模型验证的 API 和执行链，但在确认外部模型端到端稳定前仍需复验。

## 最近验证

- 2026-08-09：手动代码保存聚焦回归、组件全量测试 `269 passed, 4 skipped`、Python 编译、前端 JavaScript 语法、`git diff --check` 和 WeWorker 集成回归 `22 passed` 全部通过。隔离真实页面验证编辑、有效保存、哈希更新、无效签名错误、失败恢复及取消路径，页面无业务 Console Error。
- 2026-07-21：四文件 Skill 改造聚焦回归 `52 passed, 3 skipped`，仓库完整回归 `213 passed, 3 skipped`；自包含 Runtime 恢复真实 CDP E2E `1 passed`，`compileall` 和 `git diff --check` 通过。北京、廊坊、天津、武汉四个现有正式 Toolkit 均已重建，根 CLI `--help` 验证通过，正式 Skill 中已无 `scripts/toolkit.json`；通用分发与天津真实 CDP E2E 因当前浏览器缺少各自要求的精确预备标签页而保持环境门控跳过。
- 2026-07-20：重新开发和模型管理 UI 回归通过；`tests/unit/test_server_app.py` 21 passed、前端 `node --check` 和 `git diff --check` 通过。
- 2026-07-19：Skill 域名描述改造的 Publisher 聚焦回归 `26 passed`，仓库完整回归 `206 passed, 3 skipped`；当前 `tianjin-property/SKILL.md` frontmatter 已核对为 `jxd.ghhzrzy.tj.gov.cn`，不包含 Tool 名称，`compileall` 和 `git diff --check` 通过。
- 2026-07-19：Publisher 聚焦回归 `26 passed`，仓库完整回归 `206 passed, 3 skipped`；当前 `tianjin-property/SKILL.md` 已确定性重建为 `webcli-py` 调用说明，并通过 `webcli-py scripts/toolkit.py download-tianjin-fangcha-pdf --help` 验证，`compileall` 和 `git diff --check` 通过。
- 2026-07-18：首次开发入口修复完整回归 `199 passed, 3 skipped`；`compileall`、全部前端 ES modules `node --check` 和 `git diff --check` 通过。隔离真实 UI 验证新 Tool 选择 Exploration 后的入口、初始指令框、空输入提示，以及已发布 Tool 既有双入口，console error 为零。
- 2026-07-18：「从探索重新开发」聚焦回归 `62 passed`；完整回归 `199 passed, 3 skipped`；`compileall`、全部前端 ES modules `node --check` 和 `git diff --check` 通过，真实 UI 验收通过且 console error 为零。
- 2026-07-18：标准五文件 Skill 完整回归 `186 passed, 3 skipped`；Runtime 恢复、通用分发和天津打印三条真实 CDP E2E 各 `1 passed`；Skill 校验、Playwright-only 隔离环境、`compileall`、前端 `node --check` 和 `git diff --check` 通过。

## 维护规则

- 每次完成开发、修复、文档补齐或重要调研后，同步更新本文档。
- 只有已经实现并验证的事项才能进入「已完成」或将阶段标为「已完成」。
- 开始一个阶段时，同时更新「当前阶段」「进行中」和对应阶段状态。
- 出现阻塞时记录事实、影响范围和解除条件；未确认的信息标为「待确认」。
- 产品范围变化先更新产品设计，技术方案变化先更新技术设计，再同步调整本文档。
