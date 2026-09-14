import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('call', '调用网站工具', 'call '),
  subcommand('adapter', '管理站点 adapter', 'adapter '),
  subcommand('service', '管理本地 webcli 服务', 'service '),
  subcommand('install --skills', '安装 adapter skills', 'install --skills '),
  subcommand('extension-path', '显示扩展目录', 'extension-path '),
  subcommand('trace', '查看 trace 详情', 'trace '),
  option('--help', '显示帮助'),
  option('--version', '显示版本'),
]

const serviceCandidates = [
  subcommand('start', '启动服务'),
  subcommand('stop', '停止服务'),
  subcommand('status', '查看服务状态'),
  subcommand('logs', '查看服务日志'),
]

const adapterCandidates = [
  subcommand('list', '列出 adapter'),
  subcommand('info', '查看 adapter 信息'),
  subcommand('skill', '查看 adapter skill'),
  subcommand('knowledge', '查看 adapter knowledge'),
  subcommand('skills-path', '显示 skills 目录'),
  subcommand('install', '安装 adapter'),
  subcommand('remove', '移除 adapter'),
]

const builtinToolCandidates = [
  { name: 'open_browser', value: 'open_browser ', kind: 'tool', description: '打开网站页面' },
  { name: 'click', value: 'click ', kind: 'tool', description: '点击页面元素' },
  { name: 'input_text', value: 'input_text ', kind: 'tool', description: '输入文本' },
]

const builtinToolParameters = {
  open_browser: [{ name: 'url', required: true }],
  click: [{ name: 'selector', required: true }],
  input_text: [
    { name: 'selector', required: true },
    { name: 'text', required: true },
  ],
}

const adapterIdSubcommands = new Set(['info', 'skill', 'knowledge', 'remove'])

function siteIdCandidates(sites = []) {
  const seen = new Set()
  return (Array.isArray(sites) ? sites : [])
    .map((site) => ({
      id: String(site?.id || '').trim(),
      name: String(site?.name || site?.id || '').trim(),
      enabled: site?.enabled !== false,
    }))
    .filter((site) => {
      if (!site.id || seen.has(site.id)) return false
      seen.add(site.id)
      return true
    })
    .map((site) => ({
      name: site.id,
      value: `${site.id} `,
      kind: 'site',
      description: site.name && site.name !== site.id ? site.name : '站点 adapter',
      enabled: site.enabled,
    }))
}

function siteToolCandidates(sites = []) {
  const seen = new Set()
  const candidates = []
  for (const site of Array.isArray(sites) ? sites : []) {
    const siteName = site?.name || site?.id || '站点工具'
    for (const tool of site?.tools || []) {
      const name = String(tool?.name || '').trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      candidates.push({
        name,
        value: `${name} `,
        kind: 'tool',
        description: `${siteName} · ${tool?.description || '站点工具'}`,
      })
    }
  }
  return candidates
}

function findTool(sites = [], toolName) {
  const name = String(toolName || '').trim()
  if (!name) return null
  for (const site of Array.isArray(sites) ? sites : []) {
    const tool = (site?.tools || []).find((item) => String(item?.name || '').trim() === name)
    if (tool) return tool
  }
  if (builtinToolParameters[name]) return { name, parameters: builtinToolParameters[name] }
  return null
}

function optionStartIndex(tokens = []) {
  const index = tokens.findIndex((token) => String(token || '').startsWith('-'))
  return index === -1 ? tokens.length : index
}

function resolveCallToolName(args = []) {
  if (args[0] !== 'call') return ''
  const toolTokens = args.slice(1, 1 + optionStartIndex(args.slice(1)))
  return toolTokens.join(' ').trim()
}

function flagTemplateCandidate(toolName, sites) {
  const tool = findTool(sites, toolName)
  const flagParts = []
  for (const param of tool?.parameters || []) {
    if (param?.required && param.name) flagParts.push(`--${param.name}=<${param.name}>`)
  }
  const template = flagParts.join(' ')

  return {
    name: template || '(无需参数)',
    value: template ? `${template} ` : '',
    kind: 'value',
    description: tool ? `${toolName} 参数模板` : '未找到工具参数，仍可手动输入 --key=value',
  }
}

function webcliValueCandidates(optionName, args, sites, options = {}) {
  if (optionName !== '--args') return []
  if (args[0] !== 'call') return []
  const toolName = args[1]
  if (!toolName) return []
  return [flagTemplateCandidate(toolName, sites)]
}

function webcliCandidates(args, sites) {
  const [command, subcommand] = args
  if (!command) return rootCandidates

  if (command === 'service') {
    if (!subcommand) return serviceCandidates
    if (subcommand === 'start') return [option('--daemon', '后台启动服务'), option('-d', '后台启动服务')]
    if (subcommand === 'logs') return [option('--follow', '持续输出日志'), option('-f', '持续输出日志')]
    return []
  }

  if (command === 'adapter') {
    if (!subcommand) return adapterCandidates
    if (adapterIdSubcommands.has(subcommand) && args.length === 2) return siteIdCandidates(sites)
    if (subcommand === 'list') return [option('--json', '输出 JSON')]
    if (subcommand === 'skill') {
      return [
        option('--generated', '查看生成版本'),
        option('--regenerate', '重新生成 skill'),
        option('--overwrite', '覆盖已有文件'),
      ]
    }
    if (subcommand === 'knowledge') return [option('--json', '输出 JSON')]
    if (subcommand === 'install') {
      return [
        option('--url', '从 URL 安装 adapter'),
        option('--file', '从本地文件安装 adapter'),
        option('--reload', '安装后重载'),
      ]
    }
    if (subcommand === 'remove') return [option('--reload', '移除后重载')]
    return []
  }

  if (command === 'call') {
    if (!subcommand) return [...siteToolCandidates(sites), ...builtinToolCandidates]
    const toolName = resolveCallToolName(args)
    const template = flagTemplateCandidate(toolName, sites)
    if (template.value) return [template]
    return [option('--key=value', '直接传参（如 --url=http://example.com）')]
  }

  if (command === 'install' && subcommand === '--skills') return siteIdCandidates(sites)
  if (command === 'install') return [option('--skills', '安装 skills'), option('--target', '指定安装目录')]

  return []
}

export default {
  name: 'webcli',
  description: 'WeWorker 网站工具命令',
  pathCompletion: false,
  pathOptions: new Set(['--file', '--target']),
  valueOptions: new Set(['--url']),
  complete({ args, current, context }) {
    return filterCandidates(webcliCandidates(args, context?.sites), current)
  },
  completeValue({ option: optionName, args, current, context, includeOption }) {
    return filterCandidates(webcliValueCandidates(optionName, args, context?.sites, { includeOption }), current)
  },
}
