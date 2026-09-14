import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  SDKMessage,
  SettingSource,
  SpawnOptions as ClaudeSpawnOptions,
  SpawnedProcess,
} from '@anthropic-ai/claude-agent-sdk' // used in mapSdkMessage parameter type
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import type { Settings } from './config.js'
import { getConfigDirectory, getOpenBrowserAllowedOrigins, getSiteEnabled, getUserDirectory, getUserDirectoryBlacklist } from './config.js'
import { formatBlacklistEntry } from './user-directory-blacklist.js'
import type { ChannelPermissionMode } from './channels/channel-permissions.js'
import type { Message } from './works-store.js'
import { buildMcpServer as _buildMcpServer } from './tools.js'
import { parseAllAdapters } from './adapter-parser.js'
import { buildAgentFilesystemSettings, createUnifiedToolGuard } from './user-directory-access.js'
import { createLogger } from './logger.js'
import { resolveWebcliDir } from './webcli-path.js'
import { ASSISTANT_STATUS_PREFIX, normalizeAssistantStatusLine } from './assistant-status.js'
import { composeSystemPromptWithZcf } from './zcf-sync.js'
import { computeUsageMetrics } from './usage-metrics.js'
import { assertAllowedLlmBaseUrl } from './llm-egress.js'
import { buildRuntimeAllowedLlmBaseUrls } from './provider-registry.js'
import { createWeWorkerToolPolicy } from './agent-tool-policy.js'
import { spawnManagedClaudeCodeProcess } from './claude-process.js'
import { waitForAdapterRuntimeReload } from './adapter-runtime-reload.js'

const log = createLogger('agent')

const MODEL_AUTH_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'CLAUDE_CODE_OAUTH_TOKEN',
]

function ensureIsolatedClaudeConfigDir(platform: NodeJS.Platform = process.platform): string {
  const dir = path.join(getConfigDirectory(), 'claude-config')
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'skills'), { recursive: true })
  const configFile = path.join(dir, '.claude.json')
  let config: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      config = parsed as Record<string, unknown>
    }
  } catch {
    config = {}
  }
  config.env = {}
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
  if (platform === 'win32') {
    const settingsFile = path.join(dir, 'settings.json')
    let userSettings: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        userSettings = parsed as Record<string, unknown>
      }
    } catch {
      userSettings = {}
    }
    userSettings.defaultShell = 'powershell'
    fs.writeFileSync(settingsFile, JSON.stringify(userSettings, null, 2))
  }
  return dir
}

export function buildClaudeNativeShellEnv(
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  return platform === 'win32' ? { CLAUDE_CODE_USE_POWERSHELL_TOOL: '1' } : {}
}

export function buildConfiguredModelEnv(
  settings: Pick<Settings, 'api_key' | 'base_url'>,
  extraEnv?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env = { ...process.env, ...buildClaudeNativeShellEnv(), ...extraEnv }
  for (const key of MODEL_AUTH_ENV_KEYS) delete env[key]
  delete env.CLAUDE_CODE_GIT_BASH_PATH
  delete env.WEWORKER_BUNDLED_GIT_BASH
  env.ANTHROPIC_API_KEY = settings.api_key
  env.CLAUDE_CONFIG_DIR = ensureIsolatedClaudeConfigDir()
  const baseUrl = assertAllowedLlmBaseUrl(settings.base_url, buildRuntimeAllowedLlmBaseUrls(settings.base_url))
  if (baseUrl !== 'https://api.anthropic.com') {
    env.ANTHROPIC_BASE_URL = baseUrl
  } else {
    delete env.ANTHROPIC_BASE_URL
  }
  return env
}

export interface SSEEvent {
  type: 'text_delta' | 'tool_call_start' | 'tool_call_result' | 'tool_call_image' | 'user_choice' | 'done' | 'error' | 'usage'
  content?: string
  id?: string
  name?: string
  args?: unknown
  result?: string
  data?: string
  question?: string
  options?: Array<{ label: string; description?: string }>
  usage?: UsageEvent
}

/** Per-turn token & prompt-cache metrics, emitted once per streamChat turn. */
export interface UsageEvent {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  total_input_tokens: number
  cache_hit_rate: number
  total_cost_usd?: number
  duration_ms?: number
  num_turns?: number
}

export async function generateAssistantStatusLine(
  replyText: string,
  settings: Pick<Settings, 'api_key' | 'base_url' | 'model'>,
): Promise<string | null> {
  const trimmedReply = String(replyText ?? '').trim()
  if (!trimmedReply) return null

  const baseUrl = assertAllowedLlmBaseUrl(settings.base_url, buildRuntimeAllowedLlmBaseUrls(settings.base_url))
  const endpoint = `${baseUrl}/v1/messages`
  const prompt = [
    '请基于下面这条 AI 回复，输出一行简短中文状态。',
    `必须只输出一行，格式固定为“${ASSISTANT_STATUS_PREFIX}<状态内容>”。`,
    '不要输出解释、编号、Markdown、引号或多余文本。',
    '',
    '[AI 回复]',
    trimmedReply,
  ].join('\n')

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': settings.api_key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 80,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return null

    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>
    }
    const text = (data.content ?? [])
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')

    return normalizeAssistantStatusLine(text)
  } catch {
    return null
  }
}

export function buildSystemPrompt(opts?: {
  channelPermissionMode?: ChannelPermissionMode
  platform?: NodeJS.Platform
  zcfRole?: string | null
  zcfMode?: string | null
  zcfCustomRoles?: import('./zcf-sync.js').ZcfCustomRole[]
}): string {
  const channelPermissionMode = opts?.channelPermissionMode ?? 'full'
  const platform = opts?.platform ?? process.platform
  const nativeCommandTool = platform === 'win32' ? 'PowerShell' : 'Bash'
  const defaultShell = platform === 'win32' ? 'powershell' : 'bash'
  if (channelPermissionMode === 'qa_only') {
    const base = `你是 WeWorker 问答助手。

当前用户通过即时通讯通道与你对话，且该通道仅有问答权限。

## 权限范围

- 你可以回答知识性问题、解释概念、提供建议和文字总结。
- 你不能操作网站、调用 webcli、读写文件、创建定时任务或执行任何自动化操作。
- 不要调用 Skill、Bash、PowerShell 或任何工具；直接用文字回复用户。
- 若用户请求上述能力，请明确说明需要主人权限，并提示联系管理员在 设置 → 通道 中配置主人 ID。

请用简洁、准确的中文回复。`
    return composeSystemPromptWithZcf(base, opts?.zcfRole, opts?.zcfMode, opts?.zcfCustomRoles ?? [])
  }

  const allAdapters = parseAllAdapters()
  const userDirectory = getUserDirectory()
  const blacklistEntries = getUserDirectoryBlacklist()
  const blacklistScope = channelPermissionMode === 'full'
    ? '以下路径黑名单规则由系统对原生文件工具、WeWorker Shell 和带路径参数的 MCP 工具强制校验；不适用于 `full` 模式的 Claude Code 内置 Bash：'
    : '以下路径黑名单规则由系统在工具执行时强制校验：'
  const blacklistNotice = blacklistEntries.length
    ? `
${blacklistScope}
${blacklistEntries.map((entry) => `- ${formatBlacklistEntry(entry)}`).join('\n')}

黑名单说明：
- 每条规则会按“路径精确匹配”或“路径正则匹配”执行。
- 被黑名单命中的路径不可读取、写入、列出、上传、解密或发送。
- 如果工具返回 blocked / blacklist 错误，请明确告知用户该路径已被管理员加入黑名单，无法访问。
`
    : ''

  const adapterExecutionEnabled = channelPermissionMode === 'full'
  const webcliInvokeDesc = `Claude Code 内置 ${nativeCommandTool} 执行 \`webcli call <完整工具名> --参数名=参数值\``
  const openBrowserDesc = `使用 Claude Code 内置 ${nativeCommandTool} 执行 \`webcli call open_browser --url=<url>\``
  const webcliStep2 = `2. 使用 Claude Code 内置 ${nativeCommandTool} 执行 \`webcli call <完整工具名> --参数名=参数值\``
  const webcliArgsDesc = '直接使用 `--key=value`；数组和对象可使用 JSON 字面量'
  const openBrowserRule = `用 Claude Code 内置 ${nativeCommandTool} 执行 \`webcli call open_browser --url=...\``
  const bashCapabilityNotice = channelPermissionMode === 'full'
    ? `
## Skill、Adapter 与 ${nativeCommandTool}

优先按已激活的标准 Skill 指令执行。执行 Extension Adapter 或 Toolkit Adapter 时，统一使用 Claude Code 内置 ${nativeCommandTool} 运行 \`webcli call\`，不得使用 \`weworker_powershell\`。
Claude Code 内置 ${nativeCommandTool} 已开放，也可执行构建、测试、git、npm 和其他本地命令。
内置 ${nativeCommandTool} 不受 WeWorker 用户目录白名单、黑名单、绝对路径或命令类型限制。
WebCLI 会按 Adapter 类型分别选择 Chrome 扩展 Bridge 或内嵌 Toolkit Runtime；不要直接调用 Adapter 脚本路径。
`
    : `
## 原生命令工具限制

不要调用 Claude Code 内置 Bash 或 PowerShell 工具。
当前权限模式不能执行 Extension Adapter 或 Toolkit Adapter；不要调用 webcli，也不要尝试用 \`weworker_powershell\` 绕过。
构建、测试、git、npm 或查看命令输出必须使用 \`weworker_powershell\`（WeWorker Shell）。
WeWorker Shell 在当前平台默认使用 ${defaultShell}。
WeWorker Shell 的 stdout/stderr 会实时显示在右侧终端面板中，用户可见执行过程。
`

  const authSites: string[] = []
  for (const [adapterId, adapter] of allAdapters) {
    if (!getSiteEnabled(adapterId, adapter.defaultEnabled)) continue
    if (adapter.requiresAuth) {
      const backgroundApiTools = Object.entries(adapter.toolExecution || {})
        .filter(([, execution]) => execution?.type === 'api' && execution?.runtime === 'background')
        .map(([toolName]) => toolName)
      const directToolSummary = backgroundApiTools.length <= 4
        ? backgroundApiTools.map((name) => `\`${name}\``).join('、')
        : `共 ${backgroundApiTools.length} 个（以该站点 Skill 中的 Execution 标记为准）`
      const authCheckTool = adapter.authCheckTool || `${adapterId}.check_login_status`
      authSites.push(
        backgroundApiTools.length > 0
          ? `- ${adapter.name}（${adapter.match[0]}）：API direct 工具 ${directToolSummary}，必须先直接调用`
          : `- ${adapter.name}（${adapter.match[0]}） -> 检测：\`webcli call ${authCheckTool}\``,
      )
    }
  }

  const base = `你是 WeWorker，一个通过 Adapter 操作网页的 AI 助手。

## 能力范围

${adapterExecutionEnabled
    ? '你通过 webcli 命令行工具调用 Extension Adapter 与 Toolkit Adapter，能够在网页上执行操作。'
    : '当前权限模式允许使用标准 Skill 和受控文件／Shell 工具，但不能执行 Extension Adapter 或 Toolkit Adapter。'}
当用户提到某个网站时，你应该激活对应的 Skill 来了解该网站支持的工具和操作方式。
${adapterExecutionEnabled
    ? `所有网站工具通过${webcliInvokeDesc}调用。
对于 Skill 中同时标记为 \`Execution: type=api, runtime=background\` 和 \`Execution: mode=direct\` 的工具，它们是无需 DOM 的 API 工具，必须直接调用，不需要先打开对应网站。旧 Skill 如果只标记了 \`Execution: mode=direct\`，也按同样规则处理。
对于页面/DOM 工具，调用前需要确保对应网站已在 Chrome 中打开。如果未打开，请先${openBrowserDesc}打开该网站。`
    : 'Skill 可用于阅读说明，但不要执行其中的 Adapter 命令。'}

## 使用 webcli call 的规则

当你需要操作某个网站时，按以下步骤进行：
1. 激活该网站对应的 Skill，查阅其中的工具列表和参数说明。
${adapterExecutionEnabled ? webcliStep2 : '2. 当前权限模式不能执行 Adapter；需要执行时明确说明需要 full 权限。'}
3. 使用完整工具名称，例如 \`jd.com.search_products\`。
4. 参数${webcliArgsDesc}，字段必须匹配 Skill 文档中的参数定义。

对于没有对应 Skill 的网站，你没有操作能力，应明确告知用户当前不支持该网站。
${bashCapabilityNotice}

## 大结果读取规则

webcli 工具（如 mail.example.com.list_messages 的列表/详情查询）返回过大时，完整结果会整份落盘到用户目录，只回传一个 \`type: "large_output"\` 的**精简指针**（含 \`file\`、\`count\`、一行 \`header\`）——**不含具体条目数据**。这样设计是为了不让超大文本占据上下文、拖慢后续每一个推理回合。
- 拿到指针后，**不要**从指针本身去读工单内容；指针只告诉你"有几条、是什么类型"。
- 需要具体内容时，调用 \`webcli_result\` 工具读取对应 \`file\`：\`mode=summary\` 看可读总览、\`page\` 分页、\`pick\` 只取需要的几列、\`item\` 看单条（可含 raw）。
- **多查询并发场景**：先发起所有查询，中间步只看指针的 \`count\`/\`header\` 决定下一步即可；**到汇总阶段再用 \`webcli_result\` 统一取**需要的字段，避免每步都把大段数据读进上下文被反复重扫。
- 缓存有有效期；若 \`webcli_result\` 返回 \`type: "cache_expired"\`，请重新调用原 webcli 工具刷新后再读，不要给出陈旧结果。
- 不要为了取整份大文本而重跑原查询，也不要用 shell（cat/python/jq 等）自行解析落盘文件——直接用 \`webcli_result\`。

## 使用 open_browser 的规则

${adapterExecutionEnabled
    ? '只有页面/DOM 工具需要先打开网站。`type=api, runtime=background` + `mode=direct` 的 API 工具不要预先打开网站或检测登录；如果这类工具返回需要登录或需要页面上下文，再打开 Skill 文档中的 Homepage URL。'
    : '本节仅在 full 权限可执行；当前不要打开网站或调用 Adapter。'}

${adapterExecutionEnabled ? `${openBrowserRule} 打开一个受支持的网站后，必须等待至少 5 秒再执行任何后续页面/DOM 操作。` : '当前权限模式不能调用 open_browser。'}
原因：网站 adapter 需要时间注入并注册工具，过早调用会导致工具不存在而报错。

URL 必须使用 Skill 文档中的 Homepage URL，不要自行猜测协议。
很多公司内网站点使用 http 而非 https，使用错误协议会导致无法打开。

## 文件访问范围

Claude Code 原生文件工具、WeWorker Shell 和带路径参数的 MCP 工具只能访问用户目录 \`${userDirectory}\` 及其子目录中的文件。
严禁读取、写入、列出、搜索、上传、解密或发送该目录之外的任何路径。
${channelPermissionMode === 'full'
    ? `此目录边界不适用于 \`full\` 模式的 Claude Code 内置 ${nativeCommandTool}；内置 ${nativeCommandTool} 可以访问其他绝对路径，也不应用用户目录黑名单。`
    : 'WeWorker Shell 命令（含 cat、type、python 等）与内置文件工具同样受用户目录边界约束，越界请求会被系统拦截。'}
如果用户请求访问其他位置，应说明需要先把文件导入用户目录（可通过文件面板或聊天附件导入），再在该目录内操作。
\`CLAUDE_CONFIG_DIR/skills\` 下的技能目录禁止在 WeWorker 会话里直接编辑、删除、重命名或上传。用户如果要新增 skills、补资源、改结构，请一律引导使用左侧自带的 “SKILLS与场景” 功能，或者让用户在技能管理界面手动创建/导入 skill 文件夹。你可以在用户目录中帮用户生成/修改好 skill 草稿，再提供复制或软链安装方案；但不要直接代替用户修改 \`CLAUDE_CONFIG_DIR/skills\` 下的文件。
如果用户直接提出修改 \`CLAUDE_CONFIG_DIR/skills\` 下文件的请求，第一句就必须拒绝并给出替代方案，不要先查看目录内容、不要先尝试执行写入、不要先向用户确认再继续。
\`Read\`、\`Glob\`、\`Grep\`、\`Edit\`、\`Write\`、\`NotebookEdit\` 可用于用户目录内的文件读取、搜索和编辑。
文件读取、搜索、编辑优先使用 Claude Code 内置文件工具：\`Read\`、\`Glob\`、\`Grep\`、\`Edit\`、\`Write\`、\`NotebookEdit\`；只有需要执行真实命令、构建、测试、git、npm 或查看命令输出时，才使用 \`weworker_powershell\`。
\`list_files\`、\`check_file_encryption\`、\`decrypt_file\`、\`send_file_to_user\`、\`send_image_to_user\` 等工具也仅接受用户目录内的路径。
${blacklistNotice}

## 本地命令执行规则

${channelPermissionMode === 'full'
    ? `执行 Extension Adapter 或 Toolkit Adapter 时必须使用 Claude Code 内置 ${nativeCommandTool} 运行 \`webcli call\`，不得使用 \`weworker_powershell\`；其他本地命令、构建、测试、git 或 npm 也可以使用内置 ${nativeCommandTool}。`
    : '当需要执行本地命令、Shell 命令、构建、测试、git、npm 或查看命令输出时，必须调用 `weworker_powershell` 工具，不要调用 Claude Code 内置 Bash 或 PowerShell。'}
\`weworker_powershell\` 在当前平台默认使用 \`shell: "${defaultShell}"\`。
\`xcopy\`、\`copy\`、\`dir\`、\`del\`、\`mklink\` 等 Windows 原生命令，或命令中包含 \`C:\\...\` 这类 Windows 路径时，应使用 \`shell: "powershell"\`，必要时设置 \`outputEncoding: "gbk"\` 读取中文输出，避免 bash 误解释反斜杠和 \`/E\` 等参数。
\`weworker_powershell\` 默认已在用户目录执行，通常无需先 cd 到用户目录。
\`weworker_powershell\` 的实时 stdout/stderr 会显示在 WeWorker 终端面板中，用户可以看到执行过程。
${adapterExecutionEnabled
    ? '网站操作仍按 webcli 规则执行；不要为了调用网站工具而改用 `weworker_powershell`。'
    : '当前权限模式不能执行 Adapter；严禁用 `weworker_powershell` 调用 webcli。'}

## 引导用户执行命令

用户也可以在聊天输入框中输入 \`!<命令>\`，通过当前平台默认 Shell（${defaultShell}）直接执行，执行结果会进入当前对话上下文，不会再交给 AI 判断。
当你需要用户自己执行某条本地命令或 webcli 命令时，请把命令写成以 \`!\` 开头的代码块，例如：
\`\`\`bash
!webcli call open_browser --url=http://jd.com
\`\`\`
前端会自动为这种 \`!\` 命令显示“复制”和“执行”按钮：用户点击“复制”会复制命令，点击“执行”会直接执行命令，不会再次发送给 AI。
不要只给普通命令；需要用户执行时必须包含 \`!\` 前缀。
${process.platform === 'win32' ? `
## 文件加密处理规则

在使用任何文件之前（读取内容、上传附件、发送给用户、作为其他工具参数等），必须先调用 \`check_file_encryption\` 工具检查该文件是否被公司 DLP 加密。

按以下步骤处理：
1. 调用 \`check_file_encryption\`，传入 \`file_path\`。
2. 查看返回 JSON 中的 \`encrypted\` 或 \`encryption_status\` 字段。
3. 如果是 encrypted，必须先调用 \`decrypt_file\` 对同一路径解密，确认 success: true 后再继续。
4. 如果未加密，直接继续原定操作。
5. 如果加密检查失败或解密失败（包含未找到 sd_decrypt.exe），当前环境可能为非 OA 环境；直接按原定操作继续，不要阻塞或等待用户确认；在回复中简要说明已跳过加密检查。
` : ''}

## 文件读取编码规则

读取文本文件时，默认首选 UTF-8。
如果内容出现乱码，再按当前系统尝试常见本地编码：Windows 可尝试 gbk、gb18030、cp936、utf-16-le；macOS 可尝试 macintosh、latin1、utf-16-le；Linux 可尝试 latin1、gbk。
如果仍然乱码，再尝试 big5、shift_jis、euc-kr、utf-16-be、cp1252 等。
每次换编码都应重新读取并比对内容是否可读，不要混用多种编码结果。

## 用户选择规则

当操作涉及需要用户做出偏好决策的场景（例如支付方式、收货地址、商品规格等），必须调用 \`ask_user\` 工具让用户选择，不要自行决定。
绝对禁止用纯文本列出选项让用户回复，你必须调用 \`ask_user\` 工具。
绝对禁止调用内置工具 \`AskUserQuestion\`；该工具不会显示 WeWorker 选择按钮，用户无法正确作答。任何需要用户选择或确认的场景，一律使用 \`ask_user\`。
调用 \`ask_user\` 时，尽量从前一步工具返回的真实数据中提取选项。
当任何工具返回结果中包含 \`requires_user_choice: true\` 字段时，你必须立即调用 \`ask_user\` 工具，并将返回结果中的 \`question\` 和 \`options\` 原样传入。

## 当前状态回复规则

你的每一条 assistant 回复末尾都必须包含一行当前状态，格式固定为：\`${ASSISTANT_STATUS_PREFIX}<简短状态>\`。
要求：
- 每次回复都要写，不能省略。
- 状态必须反映此时真实进展，例如：正在执行第 2 步、等待用户选择、已完成当前任务。
- 即使前面已经写了步骤说明、Todo 列表或工具执行结果总结，最后也要补上这一行。
- 如果你正在等待用户行动，也必须明确写出等待中的状态。

## Todo List 更新规则

当当前任务需要计划、分步执行、继续未完成计划，或当前对话已存在未完成 Todo List 时，你必须使用内置 \`TodoWrite\` 工具维护进度。
规则：
- 创建计划时，调用 \`TodoWrite\` 写入完整 todo 列表。
- 每次开始、继续、完成、阻塞、修改或删除任何 todo 时，必须再次调用 \`TodoWrite\`，并传入完整最新列表。
- 不要只用自然语言说“第 N 步完成/开始”，状态变化必须配套调用 \`TodoWrite\`。
- \`TodoWrite.todos\` 是全量快照，不是增量更新；删除未完成 todo 时，直接从最新列表中移除。
- todo 状态只能使用 \`pending\`、\`in_progress\`、\`completed\`。
- 当当前 \`in_progress\` todo 受阻、失败、超时、连续重试失败或需要用户介入时，可保持 \`status: "in_progress"\` 并写入 \`blocked_reason\` 或 \`failure_reason\` 说明原因，前端会显示失败；也可以由你自行调整计划、改回 \`pending\` 或删除未完成项。
- 仅在自然语言正文中说明“失败/阻塞/超时”不算更新 Todo List；失败必须通过 \`TodoWrite\` 参数中的 \`blocked_reason\` 或 \`failure_reason\` 表达。
- 已完成 todo 不可修改、删除或回退状态。
- 未完成 todo 可以修改、删除、新增或调整状态。
- 当前计划未完成、失败或中止时，不要重开新计划；只能基于原 TodoWrite 列表继续更新。
- 当前计划全部完成后，后续如用户明确要求新任务，才创建新的 TodoWrite 列表。

## 工具错误处理规则

当某个工具调用返回错误时，最多重试 2 次（即总共调用不超过 3 次）。
如果同一个工具连续失败且错误信息相同或相似，立即停止重试，向用户说明情况，并调用 \`TodoWrite\` 更新当前计划：可将当前 todo 保持为 \`in_progress\` 并写入 \`blocked_reason\` 或 \`failure_reason\`，也可调整/删除未完成计划。
${adapterExecutionEnabled && authSites.length > 0 ? `
## 登录检测规则

以下网站需要用户登录后才能操作：

${authSites.join('\n')}

对于这些网站，使用 open_browser 打开后（等待 5 秒后），必须先调用该网站的 check_login_status 工具检测登录状态。
如果返回 \`logged_in: false\`，应立即告知用户需要先在浏览器中登录该网站。
` : ''}`
  return composeSystemPromptWithZcf(base, opts?.zcfRole, opts?.zcfMode, opts?.zcfCustomRoles ?? [])
}
function findClaudeExecutable(): string | undefined {
  try {
    const result = execSync('which claude', {
      shell: process.env.SHELL || '/bin/zsh',
      timeout: 3000,
    }).toString().trim()
    if (result && fs.existsSync(result)) return result
  } catch {}
  const candidates = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.npm', 'bin', 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return undefined
}

function findNodeExecutable(): string | undefined {
  const isWin = process.platform === 'win32'
  try {
    const result = execSync(isWin ? 'where node' : 'which node', {
      shell: isWin ? undefined : (process.env.SHELL || '/bin/zsh'),
      timeout: 3000,
    }).toString().trim().split('\n')[0].trim()
    if (result && fs.existsSync(result)) return result
  } catch {}
  const candidates = isWin
    ? [
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'nodejs', 'node.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'nvm', 'current', 'node.exe'),
      ]
    : [
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node',
      ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return undefined
}

let _wrapperPath: string | undefined

export function resolvePackagedClaudeEntrypoint(resourcesPath: string, platform = process.platform): string {
  const claudeCodeDir = path.join(resourcesPath, 'claude-code')
  const candidates = [
    path.join(claudeCodeDir, 'bin', 'claude.exe'),
    path.join(claudeCodeDir, 'cli-wrapper.cjs'),
    path.join(claudeCodeDir, 'cli.js'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return candidates[0]
}

function getPackagedClaudeSetup(): { pathToClaudeCodeExecutable: string; executable?: string; extraEnv?: Record<string, string> } {
  const resourcesPath = process.env.WEWORKER_RESOURCES_PATH || ''
  const claudeEntrypoint = resolvePackagedClaudeEntrypoint(resourcesPath)
  const execPath = process.env.WEWORKER_EXEC_PATH || process.execPath
  const isWin = process.platform === 'win32'
  const usesNodeScript = ['.js', '.cjs', '.mjs'].includes(path.extname(claudeEntrypoint))
  const nativeShellEnv = buildClaudeNativeShellEnv()

  if (!usesNodeScript) {
    return {
      pathToClaudeCodeExecutable: claudeEntrypoint,
      ...(Object.keys(nativeShellEnv).length ? { extraEnv: nativeShellEnv } : {}),
    }
  }

  if (isWin) {
    const extraEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1', ...nativeShellEnv }
    // Script fallbacks run through Electron in Node.js mode via
    // spawnClaudeCodeProcess.
    return {
      pathToClaudeCodeExecutable: claudeEntrypoint,
      ...(Object.keys(extraEnv).length ? { extraEnv } : {}),
    }
  }

  // macOS/Linux: write a node shebang wrapper to avoid Terminal popup / Electron relaunch
  if (_wrapperPath && fs.existsSync(_wrapperPath)) {
    return { pathToClaudeCodeExecutable: _wrapperPath }
  }
  const nodePath = findNodeExecutable()
  const wrapperPath = path.join(os.homedir(), '.weworker', 'claude-wrapper')
  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true })
  if (nodePath) {
    fs.writeFileSync(wrapperPath, `#!${nodePath}\nrequire(${JSON.stringify(claudeEntrypoint)})\n`)
  } else {
    fs.writeFileSync(wrapperPath, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${execPath}" "${claudeEntrypoint}" "$@"\n`)
  }
  fs.chmodSync(wrapperPath, 0o755)
  _wrapperPath = wrapperPath
  return { pathToClaudeCodeExecutable: wrapperPath }
}

function stringifyPromptValue(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function clampPromptText(text: string, max = 8000): string {
  const value = String(text || '')
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`
}

function extractToolResultText(result: unknown): string {
  if (typeof result !== 'string') return stringifyPromptValue(result)
  try {
    const parsed = JSON.parse(result)
    if (parsed && typeof parsed === 'object' && typeof (parsed as { output?: unknown }).output === 'string') {
      return (parsed as { output: string }).output
    }
  } catch {
    // Keep raw non-JSON tool output.
  }
  return result
}

function contentBlockPromptText(block: Message['content'][number]): string {
  if (block.type === 'text') return block.text
  if (block.type === 'file_attachment') return `[File] ${block.name}: ${block.path}`
  if (block.type === 'tool_use') {
    const args = block.args && typeof block.args === 'object' ? block.args as Record<string, unknown> : {}
    const command = typeof args.command === 'string' ? args.command : ''
    const resultText = extractToolResultText(block.result)
    const lines = [
      `[Tool] ${block.name || 'tool'}`,
      command ? `command: ${command}` : `args: ${stringifyPromptValue(block.args)}`,
      block.status ? `status: ${block.status}` : '',
      resultText ? `result:\n${clampPromptText(resultText)}` : '',
    ].filter(Boolean)
    return lines.join('\n')
  }
  return ''
}

function messagePromptText(message: Message): string {
  return message.content
    .map(contentBlockPromptText)
    .filter((text) => text.trim())
    .join('\n')
}

// Convert stored messages to a single prompt string for the Agent SDK
function buildPromptString(messages: Message[]): string {
  if (messages.length === 0) return ''

  const lastMsg = messages[messages.length - 1]
  const history = messages.slice(0, -1)

  const lastText = messagePromptText(lastMsg)

  if (history.length === 0) return lastText

  const historyText = history.map(m => {
    const textContent = messagePromptText(m)
    if (!textContent.trim()) return null
    return `${m.role === 'user' ? 'User' : 'Assistant'}: ${textContent}`
  }).filter(Boolean).join('\n\n')

  if (!historyText) return lastText
  return `[浠ヤ笅鏄箣鍓嶇殑瀵硅瘽鍘嗗彶锛屼粎渚涘弬鑰僝\n${historyText}\n\n[褰撳墠鐢ㄦ埛娑堟伅]\n${lastText}`
}

// Strip any base64 image markdown that Claude may emit in its text response
// e.g. ![Screenshot](data:image/jpeg;base64,/9j/...)
function stripBase64Images(text: string): string {
  // Claude sometimes embeds the screenshot as a markdown image in its text block.
  // The base64 string is so long that it never has a closing ')' within the same
  // streaming delta 鈥?so we match from '![' up to the end of the string when no
  // closing ')' is found, effectively removing the entire trailing image embed.
  let result = text
  const re = /!\[[^\]]*\]\(data:image\//
  let m: RegExpExecArray | null
  while ((m = re.exec(result)) !== null) {
    const start = m.index
    // Find closing ')' after the marker
    const closeIdx = result.indexOf(')', m.index + m[0].length)
    if (closeIdx !== -1) {
      // Complete markdown image 鈥?remove it
      result = result.slice(0, start) + result.slice(closeIdx + 1)
    } else {
      // No closing ')' 鈥?truncated base64, remove from here to end of string
      result = result.slice(0, start)
      break
    }
  }
  return result.trim()
}

function* mapSdkMessage(msg: SDKMessage, streaming: boolean, textBlockBuf: { id: string; text: string }[]): Generator<SSEEvent> {
  // Log SDK message types for timing analysis
  if (msg.type !== 'stream_event') {
    log.info(`sdk-event: type=${msg.type}`)
  }
  // Streaming text deltas 鈥?only used in streaming mode
  if (msg.type === 'stream_event') {
    if (!streaming) return
    const event = (msg as unknown as { event: { type: string; delta?: { type: string; text?: string }; content_block?: { type: string; id?: string; name?: string }; index?: number } }).event

    if (event.type === 'content_block_start') {
      if (event.content_block?.type === 'text') {
        // Start buffering a new text block
        textBlockBuf.push({ id: String(event.index ?? textBlockBuf.length), text: '' })
      } else if (event.content_block?.type === 'tool_use') {
        yield {
          type: 'tool_call_start',
          id: event.content_block.id,
          name: event.content_block.name,
          args: {},
          status: 'running',
        } as SSEEvent & { status: string }
      }
      return
    }

    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      // Accumulate into the current text block buffer
      const buf = textBlockBuf[textBlockBuf.length - 1]
      if (buf) {
        buf.text += event.delta.text
      } else {
        // Fallback: no open block, emit directly
        yield { type: 'text_delta', content: event.delta.text }
      }
      return
    }

    if (event.type === 'content_block_stop') {
      const buf = textBlockBuf.pop()
      if (buf?.text) {
        const cleaned = stripBase64Images(buf.text)
        if (cleaned) yield { type: 'text_delta', content: cleaned }
      }
      return
    }

    return
  }

  // User message 鈥?contains tool results (including images)
  if (msg.type === 'user') {
    const userMsg = (msg as unknown as { message: { content: Array<{ type: string; tool_use_id?: string; content?: unknown }> } }).message
    for (const block of userMsg.content ?? []) {
      if (block.type === 'tool_result') {
        // content may be a string (e.g. Skill tool) or an array of parts
        const content = block.content
        if (typeof content === 'string') {
          yield { type: 'tool_call_result', id: block.tool_use_id, result: content }
        } else if (Array.isArray(content)) {
          for (const part of content as Array<{ type: string; text?: string; source?: { data: string; media_type: string }; data?: string }>) {
            if (part.type === 'text' && part.text) {
              yield { type: 'tool_call_result', id: block.tool_use_id, result: part.text }
            } else if (part.type === 'image') {
              const imgData = part.source?.data ?? part.data
              if (imgData) {
                yield { type: 'tool_call_image', id: block.tool_use_id, data: imgData }
              }
            }
          }
        }
      }
    }
    return
  }

  // Full assistant message 鈥?in non-streaming mode, extract text here (after all tool calls done)
  if (msg.type === 'assistant') {
    if (!streaming) {
      const assistantMsg = (msg as unknown as { message: { content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> } }).message
      for (const block of assistantMsg.content ?? []) {
        if (block.type === 'text' && block.text) {
          const cleaned = stripBase64Images(block.text)
          if (cleaned) yield { type: 'text_delta', content: cleaned }
        }
        if (block.type === 'tool_use' && block.id) {
          yield { type: 'tool_call_start', id: block.id, name: block.name ?? '', args: block.input ?? {} } as SSEEvent
        }
      }
    } else {
      // In streaming mode, text came via deltas, but tool input didn't 鈥?extract it here
      const assistantMsg = (msg as unknown as { message: { content: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }> } }).message
      for (const block of assistantMsg.content ?? []) {
        if (block.type === 'tool_use' && block.id && block.input && Object.keys(block.input).length > 0) {
          yield { type: 'tool_call_start', id: block.id, name: block.name ?? '', args: block.input } as SSEEvent
        }
      }
    }
    return
  }

  if (msg.type === 'result') {
    // P0.5 baseline: log per-turn token usage + prompt-cache hit rate once per
    // streamChat turn. `usage` is also yielded so callers/frontend can aggregate.
    const r = msg as unknown as {
      subtype?: string
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
      total_cost_usd?: number
      duration_ms?: number
      num_turns?: number
    }
    if (r.usage) {
      const m = computeUsageMetrics(r.usage)
      log.info(
        `usage in=${m.input_tokens} cache_read=${m.cache_read_input_tokens} cache_create=${m.cache_creation_input_tokens} out=${m.output_tokens} total_in=${m.total_input_tokens} cache_hit=${(m.cache_hit_rate * 100).toFixed(1)}% cost=$${r.total_cost_usd ?? 0} dur=${r.duration_ms ?? 0}ms turns=${r.num_turns ?? 0} subtype=${r.subtype ?? '?'}`,
      )
      yield {
        type: 'usage',
        usage: {
          ...m,
          total_cost_usd: r.total_cost_usd,
          duration_ms: r.duration_ms,
          num_turns: r.num_turns,
        },
      } as SSEEvent
    }
    yield { type: 'done' }
  }
}

export async function* streamChat(
  messages: Message[],
  settings: Settings,
  abortController?: AbortController,
  opts: {
    streaming?: boolean;
    enabledAdapterIds?: Set<string>;
    workId?: string;
    zcfRole?: string | null;
    zcfMode?: string | null;
    channelPermissionMode?: ChannelPermissionMode;
    onAskUser?: (event: { type: string; id: string; question: string; options: Array<{ label: string; description?: string }> }) => void;
    channelAskUserHandler?: (question: string, options: Array<{ label: string; description?: string }>) => Promise<string>;
  } = {},
): AsyncGenerator<SSEEvent> {
  // Claude Code discovers user Skills when each query starts. If a website was
  // just scaffolded, wait for its hot-install to finish before starting query.
  await waitForAdapterRuntimeReload()
  const enabledAdapterIds = opts.enabledAdapterIds
  const channelPermissionMode = opts.channelPermissionMode ?? 'full'

  const mcpServer = _buildMcpServer({
    channelPermissionMode,
    workId: opts.workId ?? null,
    askUserSSECallback: opts.onAskUser ?? null,
    channelAskUserHandler: opts.channelAskUserHandler ?? null,
  })
  const claudeSetup: { pathToClaudeCodeExecutable?: string; executable?: string; extraEnv?: Record<string, string> } = process.env.WEWORKER_PACKAGED
    ? getPackagedClaudeSetup()
    : { pathToClaudeCodeExecutable: findClaudeExecutable() }

  // Always place Claude CLI in its own process group. SDK close/abort otherwise
  // terminates only the CLI and leaves command tools, Toolkit Runtime, and Playwright orphaned.
  const spawnClaudeCodeProcess = (spawnArgs: ClaudeSpawnOptions): SpawnedProcess => {
    const execPath = process.env.WEWORKER_EXEC_PATH || process.execPath
    // SDK passes command="node" (or "bun") when it treats pathToClaudeCodeExecutable as a script.
    // Replace it with the Electron exe running in Node.js mode when packaged.
    const isRuntimeCmd = ['node', 'bun', 'deno'].includes(spawnArgs.command)
    const command = claudeSetup.extraEnv && isRuntimeCmd ? execPath : spawnArgs.command
    const child = spawnManagedClaudeCodeProcess(
      { ...spawnArgs, command },
      claudeSetup.extraEnv,
    )
    child.stderr?.on('data', (d: Buffer) => log.error('claude-stderr', d.toString().trimEnd()))
    child.on('exit', (code: number) => log.info(' code:', code))
    return child as unknown as SpawnedProcess
  }
  const systemPrompt = buildSystemPrompt({
    channelPermissionMode,
    zcfRole: opts.zcfRole,
    zcfMode: opts.zcfMode,
    zcfCustomRoles: settings.zcf_custom_roles,
  })

  let queryEnv: NodeJS.ProcessEnv
  try {
    queryEnv = buildConfiguredModelEnv(settings, claudeSetup.extraEnv)
  } catch (e) {
    yield { type: 'error', content: e instanceof Error ? e.message : 'LLM base URL is not allowed' }
    return
  }

  // includePartialMessages enables streaming text deltas but causes Claude to emit
  // text before tool calls complete. qa_only disables partial streaming and project
  // skills so visitors get plain text answers instead of silent tool attempts.
  // Runtime skills are stored under the isolated CLAUDE_CONFIG_DIR/skills,
  // which Claude Code treats as the user skill source.
  const settingSources: SettingSource[] = channelPermissionMode === 'qa_only' ? [] : ['user', 'project']
  const includePartialMessages = channelPermissionMode === 'qa_only'
    ? false
    : opts.streaming !== false

  const textBlockBuf: { id: string; text: string }[] = []
  const queryStartTime = Date.now()
  log.info(` calling Claude API 鈥?model=${settings.model}, base_url=${settings.base_url || 'https://api.anthropic.com'}`)

  // Resolve webcli directory for PATH so Bash can find the `webcli` command
  const webcliDir = resolveWebcliDir()
  log.info(` webcliDir=${webcliDir}, exists=${fs.existsSync(webcliDir)}`)
  const pathPrefix = [webcliDir, path.dirname(process.execPath)].join(path.delimiter)
  const envWithWebcli = {
    ...queryEnv,
    PATH: `${pathPrefix}${path.delimiter}${queryEnv.PATH || process.env.PATH || ''}`,
    WEWORKER_ALLOWED_OPEN_BROWSER_ORIGINS: getOpenBrowserAllowedOrigins().join(','),
    WEWORKER_ADAPTERS_DIR: path.join(getUserDirectory(), '.claude', 'skills'),
    // Ensure Electron binary can act as Node.js runtime for packaged webcli
    ...(process.env.WEWORKER_PACKAGED ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }

  const nativeCommandTool = process.platform === 'win32' ? 'PowerShell' : 'Bash'
  const alternateCommandTool = process.platform === 'win32' ? 'Bash' : 'PowerShell'
  const baseDisallowed = ['Agent', 'WebFetch', 'Task', 'TaskOutput', 'CronList', 'CronCreate', 'CronDelete', 'AskUserQuestion', alternateCommandTool]
  const disallowedTools = channelPermissionMode === 'qa_only'
    ? [...baseDisallowed, nativeCommandTool, 'Skill', 'Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite', 'WebSearch']
    : channelPermissionMode === 'no_bash'
      ? [...baseDisallowed, nativeCommandTool]
      : baseDisallowed
  const filesystemSettings = buildAgentFilesystemSettings(getUserDirectory(), channelPermissionMode)
  const filesystemToolGuard = createUnifiedToolGuard(channelPermissionMode)
  const toolPolicy = createWeWorkerToolPolicy(channelPermissionMode)
  const canUseTool: typeof toolPolicy = async (toolName, input, context) => {
    const policyDecision = await toolPolicy(toolName, input, context)
    if (policyDecision.behavior === 'deny') return policyDecision
    return filesystemToolGuard(toolName, input as Record<string, unknown>)
  }

  const queryHandle = query({
    prompt: buildPromptString(messages),
    options: {
      abortController,
      model: settings.model,
      systemPrompt,
      mcpServers: { weworker: mcpServer },
      disallowedTools,
      canUseTool,
      settings: filesystemSettings,
      // bypassPermissions skips canUseTool; blacklist enforcement relies on canUseTool + tool handlers.
      permissionMode: 'default',
      includePartialMessages,
      cwd: getUserDirectory(),
      settingSources,
      pathToClaudeCodeExecutable: claudeSetup.pathToClaudeCodeExecutable,
      spawnClaudeCodeProcess,
      env: envWithWebcli,
    },
  })

  // When the abort signal fires, forcefully close the query to kill the
  // underlying Claude CLI subprocess. Without this, the child process
  // keeps running (and operating on websites) even after the HTTP
  // connection is closed.
  let queryRunning = true
  const onAbort = () => {
    log.info(` onAbort called 鈥?queryRunning=${queryRunning}`)
    if (!queryRunning) return // query already finished, nothing to kill
    log.info(' abort signal received, closing query handle')
    queryHandle.close()
  }
  if (abortController) {
    if (abortController.signal.aborted) {
      log.info(' abortController already aborted before query started')
      queryHandle.close()
      return
    }
    abortController.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    log.info(' starting for-await over queryHandle')
    let firstEventReceived = false
    for await (const msg of queryHandle) {
      if (!firstEventReceived) {
        firstEventReceived = true
        log.info(` first event received 鈥?elapsed=${((Date.now() - queryStartTime) / 1000).toFixed(2)}s`)
      }
      for (const event of mapSdkMessage(msg, includePartialMessages, textBlockBuf)) {
        yield event
      }
    }
    log.info(` for-await loop completed normally 鈥?total=${((Date.now() - queryStartTime) / 1000).toFixed(2)}s`)
  } catch (e) {
    // Silently ignore abort errors (user cancelled)
    if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('aborted'))) {
      log.info(` caught abort error: ${e.message}`)
      return
    }
    log.info(` caught error: ${e instanceof Error ? e.message : String(e)}`)
    yield { type: 'error', content: e instanceof Error ? e.message : String(e) }
  } finally {
    log.info(' finally block 鈥?setting queryRunning=false')
    queryRunning = false
    if (abortController) {
      abortController.signal.removeEventListener('abort', onAbort)
    }
  }
}
