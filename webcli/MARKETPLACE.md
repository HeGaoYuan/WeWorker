# WebCLI — 浏览器自动化工具

> 用于 Skill 广场的插件介绍。介绍原理与使用，与给 Agent 看的 `skills/webcli/SKILL.md`（操作指令）分开维护。

通过 Chrome 扩展适配器，让 AI Agent 操控网站，完成搜索、点击、填表、读取内容、截图等操作。

## 原理

Chrome 扩展运行在浏览器沙箱中，外部进程无法直接调用。WebCLI 通过一个本地 WebSocket Bridge（端口 3711）打通隔阂：扩展的 Service Worker 主动连接 Bridge，Agent 经 `webcli call` 把工具调用转发给扩展，由页面适配器操作 DOM 并将结果原路返回。每个受支持的网站都有自己的适配器和专属工具。

## 使用

桌面端已内置 WebCLI；单独使用命令行工具时执行：

```bash
# 只装命令行工具
npm install -g weworker-webcli

# 或者让 AI 助手连「操作指令」一起装好
npx skills add https://cdn.jsdelivr.net/npm/weworker-webcli/skills/webcli/SKILL.md
```

用户只需一次性在 Chrome 加载扩展（`chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序）。之后用自然语言驱动即可，例如：

- 「搜下京东上的手机」→ 自动打开京东并搜索
- 「看下我 163 邮箱的未读邮件」→ 读取邮件列表
- 「看看知乎热榜」→ 打开知乎并读取热榜
- 「帮我查下明天北京到上海的高铁」→ 打开 12306 查询
- 「截个图」→ 截取当前页面

## 支持场景

电商购物（京东、1688、闲鱼）、社媒与内容（B 站、知乎、微博、抖音、小红书、贴吧、豆瓣、36Kr）、新闻与参考（Hacker News、Wikipedia、arXiv）、邮箱（163、QQ、Gmail）、出行与票务（12306、携程）、招聘（51job、BOSS 直聘）、开发者（GitHub、Gitee、V2EX、掘金、有道云笔记）、点评与金融（大众点评、什么值得买、雪球）等。
