# WebCLI 操作说明

本页说明如何通过 **WebCLI 命令行**调用 WeWorker Adapter。各网站的能力说明和「试试说」示例，请到 [适配网站](/docs/supported-sites) 查看。

> WebCLI 使用统一的 `webcli call <adapter-id>.<tool-id>` 入口。具体 Adapter 可能通过浏览器扩展执行，也可能通过内置运行时执行；需要登录的网站会使用浏览器当前登录态。

## 命令行操作

可用自然语言让 WeWorker Agent 自动编排；也可在终端直接执行 `webcli call`，精确调用工具。两种方式共用同一套 Chrome 扩展与登录态。

### 使用前准备

1. 已安装并启动 **WeWorker**（桌面端会自动安装/维护 WebCLI，首次 `webcli call` 会自动拉起 Bridge，无需手动启服务）
2. 已在 Chrome 加载 **WeWorker Browser Adapter** 扩展（一次性操作）：
   - 打开 `chrome://extensions/`
   - 打开右上角「开发者模式」
   - 点击「加载未打包的扩展程序」，选择 WeWorker 提示的扩展目录
   - 确认扩展已启用；可用 `webcli extension-path` 查看扩展路径
3. 在 Chrome 中用账号登录目标网站（如需要），保证浏览器登录态可用

不同 Adapter 的运行方式可能不同：页面型工具通常需要打开目标网站；后台/公开读取型工具可能不需要目标页已打开。以 `webcli adapter info <id>` 和命令返回提示为准。

### 基本调用格式

```bash
webcli call <tool_name> --args '<json>'
```

- `<tool_name>`：工具名，格式多为 `<域名或标识>.<动作>`，见 [适配网站](/docs/supported-sites) 各站点说明（如 `mail.163.com.search_emails`）
- `--args`：JSON 对象字符串；无参数时可写 `'{}'`
- 同一工具常靠 `mode` / `type` / `filter` / `action` 区分子能力，传参请对照适配网站中的子能力说明

示例：

```bash
# 搜索邮件
webcli call mail.163.com.search_emails --args '{"keyword":"发票"}'

# 无参数命令
webcli call github.com.repos --args '{}'
```

Windows PowerShell 注意：外侧请用单引号包住 JSON，内侧键名用双引号，例如：

```powershell
webcli call mail.163.com.search_emails --args '{"keyword":"发票"}'
```

### 发现有哪些工具

不确定工具名或参数时，先查适配器：

```bash
webcli --version                    # 确认 WebCLI 可用
webcli adapter list                 # 列出已安装适配器
webcli adapter list --json          # 含工具定义的 JSON
webcli adapter info <id>            # 查看某适配器全部工具与参数
webcli adapter skill <id>           # 输出该适配器的 Skill 说明
```

`<id>` 一般为域名，如 `jd.com`、`xiaohongshu.com`、`github.com`。先 `adapter info` 核对参数，再 `call`，可减少试错。

### 推荐调用流程

1. **确认环境**：`webcli --version`；扩展已加载且 WeWorker 未提示「扩展未连接」
2. **确认登录**：需要登录的网站需已登录；需要时可先调用对应站点的 `check_login_status` 或 `whoami`（若有）
3. **查工具**：`webcli adapter info <id>`，对照 [适配网站](/docs/supported-sites)「子能力」选对 `mode` / `type` 等
4. **只读先试**：列表、详情类命令可先跑通
5. **写操作先确认**：发布、删除、点赞、收藏、购买、支付、投递、发送消息等外部影响操作，执行前务必核对目标、参数和页面状态
6. **高风险操作**：涉及支付、购买、发布、删除或对外发送内容时，必须由用户确认后再执行

Dry-run 示例：

```bash
# 先查询候选内容
webcli call xiaohongshu.com.search --args '{"keyword":"杭州周末徒步","limit":5}'

# 需要点赞、收藏、发布等操作时，先确认目标内容是否正确
webcli call bilibili.com.favorite_video --args '{"title":"示例视频标题"}'
```

### 参数与占位符

- 适配网站命令示例里的 `<id>`、`<keyword>`、`<url>` 等需换成真实值
- 多步任务通常先 list / 搜索拿 ID，再 detail / 执行：例如先搜索商品或内容，再打开详情或执行后续操作
- `filter`、`mode`、`type`、`action` 的可选值以适配网站「子能力」括号内说明为准（如 `filter=mine|pending|approving|all`）
- JSON 里字符串都用双引号；布尔用 `true` / `false`，不要加引号

### 常用辅助命令

```bash
webcli service status               # 查看 Bridge 是否在运行
webcli service start -d             # 必要时后台启动 Bridge（一般可省略）
webcli extension-path               # 打印 Chrome 扩展目录，用于加载未打包扩展
webcli call capture_screenshot --args '{}'
webcli call capture_screenshot --args '{"fullPage":true}'
```

如果调用报错提示需要打开页面，可以先打开目标网站：

```bash
webcli call open_browser --args '{"url":"https://www.jd.com"}'
```

打开后等待数秒再重试业务命令（扩展注入需要一点时间）。请使用 Adapter 文档或 `adapter info` 中的站点入口。

### 常见问题

| 现象 | 处理建议 |
|------|----------|
| `Extension not connected` / 扩展未连接 | 按上文重新加载扩展；在 `chrome://extensions/` 刷新 WebMCP；确认 WeWorker 已启动 |
| 返回未登录 / 401 / 无权限 | 在 Chrome 打开目标站并重新登录，再重试 |
| 工具名不存在 / 未知工具 | `webcli adapter list` 与 `adapter info <id>` 核对名称拼写与是否已安装 |
| 参数错误 / mode 无效 | 对照适配网站「子能力」与 `adapter info` 的参数说明 |
| 写操作结果不符合预期 | 先核对目标页面、候选 ID、标题和参数；真实执行前再次确认 |
| 命令超时 | 大批量查询或发布类操作较慢，可稍后重试；确认 Bridge 与扩展仍在线 |
| WebCLI 找不到或版本过旧 | 重启或更新 WeWorker，桌面端会自动维护 WebCLI |

出错时不要盲目连点；先看返回信息是扩展、登录还是参数问题，对应处理后再调用一次。

### 和「试试说」怎么配合

1. 想快速体验：打开 [适配网站](/docs/supported-sites)，把「试试说」复制到 WeWorker 对话
2. 想精确控制或排查：用 `webcli adapter info <id>` 查看工具，再按需调用 `webcli call`
3. Agent 调用失败时：用同一条命令行示例本地复现，并对照 `webcli adapter info <id>` 修参数
