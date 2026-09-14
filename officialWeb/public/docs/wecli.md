# webcli操作说明

本页说明如何通过 **WebCLI 命令行**调用 WeCLI（API-first）工具。各内部站的能力说明、「试试说」与具体 `webcli call` 示例，请到 [适配网站](/docs/supported-sites) 查看（标有 `WeCLI · API-first` 的站点）。

> WeCLI 只需浏览器保持登录态（cookie/token），一般无需打开目标页面 DOM。原 DOM 型适配能力同样收录在「适配网站」。

## 命令行操作

可用自然语言让 WeWorker Agent 自动编排；也可在终端直接执行 `webcli call`，精确调用工具。两种方式共用同一套 Chrome 扩展与登录态。

### 使用前准备

1. 已安装并启动 **WeWorker**（桌面端会自动安装/维护 WebCLI，首次 `webcli call` 会自动拉起 Bridge，无需手动启服务）
2. 已在 Chrome 加载 **WeWorker Browser Adapter** 扩展（一次性操作）：
   - 打开 `chrome://extensions/`
   - 打开右上角「开发者模式」
   - 点击「加载未打包的扩展程序」，选择 WeWorker 提示的扩展目录
   - 确认扩展已启用；可用 `webcli extension-path` 查看扩展路径
3. 在 Chrome 中用账号登录目标内部系统至少一次，保证 cookie/token 可用

与「适配网站」里的 DOM 型工具不同：本页 WeCLI 命令为 **API-first**，一般**不必**先打开目标页面 DOM；但浏览器需保持登录态，扩展需处于已连接状态。

### 基本调用格式

```bash
webcli call <tool_name> --args '<json>'
```

- `<tool_name>`：工具名，格式多为 `<域名或标识>.<动作>`，见 [适配网站](/docs/supported-sites) 各站点「子能力」（如 `itsm.example.com.list_tickets`）
- `--args`：JSON 对象字符串；无参数时可写 `'{}'`
- 同一工具常靠 `mode` / `type` / `filter` / `action` 区分子能力，传参请对照适配网站中的子能力说明

示例：

```bash
# 查我的 ITSM 请求单
webcli call itsm.example.com.list_tickets --args '{"mode":"req","filter":"mine"}'

# 无参数命令
webcli call platform-uat.example.com.get_tdsql_tips --args '{}'
```

Windows PowerShell 注意：外侧请用单引号包住 JSON，内侧键名用双引号，例如：

```powershell
webcli call itsm.example.com.list_tickets --args '{"mode":"req","filter":"mine"}'
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

`<id>` 一般为域名，如 `itsm.example.com`、`pace.example.com`。先 `adapter info` 核对参数，再 `call`，可减少试错。

### 推荐调用流程

1. **确认环境**：`webcli --version`；扩展已加载且 WeWorker 未提示「扩展未连接」
2. **确认登录**：内部站需已登录；需要时可先调用对应站点的 `check_login_status`（若有）
3. **查工具**：`webcli adapter info <id>`，对照 [适配网站](/docs/supported-sites)「子能力」选对 `mode` / `type` 等
4. **只读先试**：列表、详情类命令可先跑通
5. **写操作先 dry-run**：复制、导入、提单、配置变更等，先加 `"dryRun": true` 看将提交的字段，确认后再去掉 dry-run 真实执行
6. **高风险操作**：执行流水线、合并 PR、结单、生产治理单、重启 Pod 等，执行前务必人工确认参数

Dry-run 示例：

```bash
# 先预览复制会提交什么
webcli call itsm.example.com.copy_ticket --args '{"mode":"req","dryRun":true}'

# 确认无误后再真实复制（去掉 dryRun，或设为 false）
webcli call itsm.example.com.copy_ticket --args '{"mode":"req","dryRun":false}'
```

### 参数与占位符

- 适配网站命令示例里的 `<pipelineId>`、`<id>`、`<keyword>` 等需换成真实值
- 多步任务通常先 list / 搜索拿 ID，再 detail / 执行：例如先 `list_pipeline_tasks` 得到 `pipelineId`，再 `run_pipeline`
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

API-first 的 WeCLI 命令通常不必 `open_browser`；若调用报错提示需要打开页面，再用：

```bash
webcli call open_browser --args '{"url":"http://itsm.example.com"}'
```

打开后等待数秒再重试业务命令（扩展注入需要一点时间）。内部站请使用适配器技能文档中的 Homepage（注意 http/https，勿默认 https）。

### 常见问题

| 现象 | 处理建议 |
|------|----------|
| `Extension not connected` / 扩展未连接 | 按上文重新加载扩展；在 `chrome://extensions/` 刷新 WebMCP；确认 WeWorker 已启动 |
| 返回未登录 / 401 / 无权限 | 在 Chrome 打开目标站并重新登录，再重试 |
| 工具名不存在 / 未知工具 | `webcli adapter list` 与 `adapter info <id>` 核对名称拼写与是否已安装 |
| 参数错误 / mode 无效 | 对照适配网站「子能力」与 `adapter info` 的参数说明 |
| 写操作结果不符合预期 | 先用 `"dryRun": true` 预览；真实执行前核对 ID、环境（Q/K、prd 等） |
| 命令超时 | 大批量查询或发布类操作较慢，可稍后重试；确认 Bridge 与扩展仍在线 |
| WebCLI 找不到或版本过旧 | 重启或更新 WeWorker，桌面端会自动维护 WebCLI |

出错时不要盲目连点；先看返回信息是扩展、登录还是参数问题，对应处理后再调用一次。

### 和「试试说」怎么配合

1. 想快速体验：打开 [适配网站](/docs/supported-sites)，把「试试说」复制到 WeWorker 对话
2. 想精确控制或排查：在适配网站各站点的「命令行」示例中复制 `webcli call`，按需改 JSON
3. Agent 调用失败时：用同一条命令行示例本地复现，并对照 `webcli adapter info <id>` 修参数
