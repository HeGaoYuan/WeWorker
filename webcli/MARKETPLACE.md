# WebCLI — 浏览器自动化工具

> 用于 Skill 广场的插件介绍。介绍原理与使用，与给 Agent 看的 `skills/webcli/SKILL.md`（操作指令）分开维护。

通过 Chrome 扩展适配器，让 AI Agent 操控网站，完成搜索、点击、填表、读取内容、截图等操作。

## 原理

Chrome 扩展运行在浏览器沙箱中，外部进程无法直接调用。WebCLI 通过一个本地 WebSocket Bridge（端口 3711）打通隔阂：扩展的 Service Worker 主动连接 Bridge，Agent 经 `webcli call` 把工具调用转发给扩展，由页面适配器操作 DOM 并将结果原路返回。每个受支持的网站都有自己的适配器和专属工具。

## 使用

安装后由 Agent 自动完成 webcli 命令的安装/更新和适配器 skill 生成，用户只需一次性在 Chrome 加载扩展（`chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序）。之后用自然语言驱动即可，例如：

- 「搜下京东上的手机」→ 自动打开京东并搜索
- 「查我的 ITSM 待办工单」→ 搜索 ITSM 工单
- 「看下 163 邮箱未读邮件」→ 读取邮件列表
- 「帮我提个 ECC 单子」→ 自动填写并提交工单
- 「截个图」→ 截取当前页面

## 支持场景

京东购物/下单/订单查询、ITSM 工单提交/审批、163 邮箱 / Gmail / QQ 邮箱、小红书、诺诺发票、ProjectDemo 产品管理、SCM 配置管理、Pace+、ExpenseDemo 费控、内部文档等。
