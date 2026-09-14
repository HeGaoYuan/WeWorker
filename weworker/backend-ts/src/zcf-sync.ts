import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfigDirectory } from './config.js'
import { createLogger } from './logger.js'

const log = createLogger('zcf-sync')
const ZCF_REPO_OWNER = 'UfoMiao'
const ZCF_REPO_NAME = 'zcf'
const ZCF_REPO_REF = 'main'
const ZCF_RAW_BASE = `https://raw.githubusercontent.com/${ZCF_REPO_OWNER}/${ZCF_REPO_NAME}/${ZCF_REPO_REF}`
const ZCF_API_BASE = `https://api.github.com/repos/${ZCF_REPO_OWNER}/${ZCF_REPO_NAME}/contents`
const ZCF_FETCH_TIMEOUT_MS = 30_000

export type ZcfLang = 'zh-CN' | 'en'

export interface ZcfRoleOption {
  id: string
  label: string
  description: string
  builtin?: boolean
  core?: boolean
  extension?: boolean
}

export type { ZcfCustomRole } from './zcf-role-settings.js'
export {
  AUTO_PLAN_MODE_ID,
  CORE_STYLE_ID,
  DEFAULT_BUNDLED_EXTENSION_STYLE_ID,
  DEFAULT_STYLE_ID,
  DEFAULT_ZCF_ENABLED_ROLES,
  DEFAULT_ZCF_MODE,
  isCustomRoleId,
  migrateLegacyDefaultRole,
  normalizeZcfCustomRoles,
  normalizeZcfEnabledRoles,
  normalizeZcfMode,
  resolveEnabledRoleFallback,
} from './zcf-role-settings.js'
import type { ZcfCustomRole } from './zcf-role-settings.js'
import {
  AUTO_PLAN_MODE_ID,
  CORE_STYLE_ID,
  DEFAULT_BUNDLED_EXTENSION_STYLE_ID,
  DEFAULT_STYLE_ID,
  DEFAULT_ZCF_ENABLED_ROLES,
  DEFAULT_ZCF_MODE,
  isCustomRoleId,
  migrateLegacyDefaultRole,
  normalizeZcfCustomRoles,
  normalizeZcfEnabledRoles,
  normalizeZcfMode,
  resolveEnabledRoleFallback,
} from './zcf-role-settings.js'

export interface ZcfModeOption {
  id: string
  label: string
  description: string
  commandFile?: string
}

export interface ZcfSyncMeta {
  version: string
  lang: ZcfLang
  syncedAt: string | null
  roles: ZcfRoleOption[]
  modes: ZcfModeOption[]
  filesCopied: number
  lastExtensionSyncAt?: string | null
}

const STYLE_LABELS: Record<string, string> = {
  'weworker-clear': '专业严谨简单明确',
}

/** ZCF CLI 安装器用的短摘要（来自 configuration.json outputStyles.*.description） */
const ZCF_PICKER_DESCRIPTIONS: Record<ZcfLang, Record<string, string>> = {
  'zh-CN': {
    'engineer-professional': '专业的软件工程师，严格遵循SOLID、KISS、DRY、YAGNI原则',
    'nekomata-engineer': '专业的猫娘工程师幽浮喵，结合严谨工程师素养与可爱猫娘特质',
    'laowang-engineer': '老王暴躁技术流，绝不容忍代码报错和不规范的代码',
    'ojousama-engineer': '傲娇金发大小姐程序员哈雷酱，融合严谨工程师素养与傲娇大小姐特质',
    'rem-engineer': '忠诚的蓝发女仆程序员蕾姆，融合极度温柔的奉献精神与冷静果敢的执行力',
    'leibus-engineer': '工程师出身的营销鬼才，用极致的产品思维和严谨的工程素养为你提供技术服务',
  },
  en: {
    'engineer-professional': 'Professional software engineer following SOLID, KISS, DRY, YAGNI principles',
    'nekomata-engineer': 'Professional catgirl engineer UFO Nya, combining rigorous engineering with cute catgirl traits',
    'laowang-engineer': 'Laowang grumpy tech style, never tolerates code errors and non-standard code',
    'ojousama-engineer': 'Tsundere blonde ojou-sama programmer Halley-chan, combining rigorous engineering excellence with tsundere ojou-sama traits',
    'rem-engineer': 'Loyal blue-haired maid programmer Rem, blending extreme gentle devotion with calm decisive execution',
    'leibus-engineer': 'Marketing genius engineer background, providing technical services with ultimate product thinking and rigorous engineering quality',
  },
}

const CORE_PICKER_DESCRIPTIONS: Record<ZcfLang, string> = {
  'zh-CN': '简洁直接；禁止 emoji、大标题与无意义措辞',
  en: 'Concise and direct; no emoji, big headings, or filler',
}

function extractStylePickerDescription(
  id: string,
  meta: Record<string, string>,
  lang: ZcfLang,
): string {
  if (id === CORE_STYLE_ID) {
    return CORE_PICKER_DESCRIPTIONS[lang] || CORE_PICKER_DESCRIPTIONS['zh-CN']
  }
  return ZCF_PICKER_DESCRIPTIONS[lang]?.[id]
    || ZCF_PICKER_DESCRIPTIONS['zh-CN'][id]
    || meta.description
    || ''
}

function extractStyleDisplayName(id: string, meta: Record<string, string>, body: string): string {
  if (id === CORE_STYLE_ID) {
    return STYLE_LABELS[CORE_STYLE_ID] ?? '专业严谨简单明确'
  }

  const h1 = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
  if (h1) {
    return h1
      .replace(/\s*[-–—]\s*.+$/, '')
      .replace(/\s*[（(][^）)]*[）)]\s*$/, '')
      .replace(/\s*输出样式\s*$/, '')
      .trim()
  }

  if (meta.name && meta.name !== id) return meta.name
  return id
}

const MODE_DEFS: Array<{ id: string; label: string; description: string; dest: string; bundled: string; zcfSrc: (lang: ZcfLang) => string }> = [
  {
    id: 'direct',
    label: '直接执行',
    description: '收到任务后立即执行，适合简单明确的操作',
    dest: '',
    bundled: '',
    zcfSrc: () => '',
  },
  {
    id: 'sixStep',
    label: '六步法',
    description: '分步规划、逐步确认后再执行，适合复杂开发任务',
    dest: 'commands/zcf/workflow.md',
    bundled: 'commands/zcf/workflow.md',
    zcfSrc: (lang) => `common/workflow/sixStep/${lang}/workflow.md`,
  },
  {
    id: 'feat',
    label: '功能开发',
    description: '先规划再实施，适合新功能或多步任务',
    dest: 'commands/zcf/feat.md',
    bundled: 'commands/zcf/feat.md',
    zcfSrc: (lang) => `claude-code/${lang}/workflow/plan/commands/feat.md`,
  },
  {
    id: 'git',
    label: 'Git 工作流',
    description: '遵循 Git 提交与分支规范，适合版本管理相关任务',
    dest: 'commands/zcf/git-commit.md',
    bundled: 'commands/zcf/git-commit.md',
    zcfSrc: (lang) => `common/workflow/git/${lang}/git-commit.md`,
  },
  {
    id: 'init-project',
    label: '项目初始化',
    description: '分析项目结构并生成初始化建议',
    dest: 'commands/zcf/init-project.md',
    bundled: 'commands/zcf/init-project.md',
    zcfSrc: (lang) => `claude-code/${lang}/workflow/common/commands/init-project.md`,
  },
]

const USER_FACING_MODES: ZcfModeOption[] = [
  {
    id: DEFAULT_ZCF_MODE,
    label: '默认',
    description: '原生模式，不注入工作流指引，理解任务后直接执行',
  },
  {
    id: AUTO_PLAN_MODE_ID,
    label: '自动规划',
    description: '收到任务后自动从五种工作流择一：直接执行、六步法、功能开发、Git 工作流、项目初始化',
  },
]

function getBundledZcfDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, '..', 'bundled', 'zcf')
}

export function getZcfPackageVersion(): string {
  return readZcfSyncMeta()?.version || 'remote'
}

export function getClaudeConfigDir(): string {
  return path.join(getConfigDirectory(), 'claude-config')
}

export function getZcfSyncMetaPath(): string {
  return path.join(getConfigDirectory(), 'zcf-sync.json')
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    meta[key] = value
  }
  return { meta, body: match[2] }
}

function copyFile(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyIfMissing(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false
  if (fs.existsSync(dest)) return false
  copyFile(src, dest)
  return true
}

function copyOverwrite(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false
  copyFile(src, dest)
  return true
}

function githubApiUrl(remotePath: string): string {
  return `${ZCF_API_BASE}/${remotePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ZCF_REPO_REF)}`
}

function githubRawUrl(remotePath: string): string {
  return `${ZCF_RAW_BASE}/${remotePath.split('/').map(encodeURIComponent).join('/')}`
}

async function fetchRemoteJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'WeWorker-ZCF-Sync',
    },
    signal: AbortSignal.timeout(ZCF_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`GitHub 请求失败 ${res.status}: ${url}`)
  }
  return await res.json() as T
}

async function fetchRemoteText(remotePath: string): Promise<string> {
  const url = githubRawUrl(remotePath)
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/plain',
        'User-Agent': 'WeWorker-ZCF-Sync',
      },
      signal: AbortSignal.timeout(ZCF_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(`GitHub 模板下载失败 ${res.status}: ${remotePath}`)
    }
    return await res.text()
  } catch (e) {
    log.warn('raw zcf template download failed, falling back to contents api', {
      remotePath,
      error: e instanceof Error ? e.message : String(e),
    })
  }
  const item = await fetchRemoteJson<GitHubContentItem>(githubApiUrl(remotePath))
  if (item.type !== 'file' || typeof item.content !== 'string') {
    throw new Error(`GitHub 远端路径不是文件: ${remotePath}`)
  }
  return Buffer.from(item.content.replace(/\s/g, ''), 'base64').toString('utf8')
}

interface GitHubContentItem {
  name: string
  path: string
  type: 'file' | 'dir' | string
  download_url?: string | null
  content?: string
  encoding?: string
}

async function listRemoteMarkdownFiles(remoteDir: string): Promise<GitHubContentItem[]> {
  const items = await fetchRemoteJson<GitHubContentItem[] | GitHubContentItem>(githubApiUrl(remoteDir))
  if (!Array.isArray(items)) {
    throw new Error(`GitHub 远端路径不是目录: ${remoteDir}`)
  }
  return items.filter((item) => item.type === 'file' && item.name.endsWith('.md'))
}

async function fetchRemoteZcfVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await fetchRemoteText('package.json')) as { version?: string }
    return pkg.version || 'remote'
  } catch (e) {
    log.warn('failed to read remote zcf version', { error: e instanceof Error ? e.message : String(e) })
    return 'remote'
  }
}

function roleOptionFromFile(id: string, raw: string, lang: ZcfLang = 'zh-CN'): ZcfRoleOption {
  const { meta, body } = parseFrontmatter(raw)
  const isCore = id === CORE_STYLE_ID
  return {
    id,
    label: extractStyleDisplayName(id, meta, body),
    description: extractStylePickerDescription(id, meta, lang),
    builtin: true,
    core: isCore,
    extension: !isCore,
  }
}

function getExtensionsStylesDir(configDir: string): string {
  return path.join(configDir, 'output-styles', 'extensions')
}

function cleanupLegacyExtensionStylesInRoot(stylesDir: string): void {
  if (!fs.existsSync(stylesDir)) return
  for (const file of fs.readdirSync(stylesDir).filter((f) => f.endsWith('.md'))) {
    const id = file.replace(/\.md$/, '')
    if (id === CORE_STYLE_ID) continue
    fs.rmSync(path.join(stylesDir, file), { force: true })
  }
}

function resolveStyleFilePath(configDir: string, roleId: string): string {
  if (roleId === CORE_STYLE_ID) {
    return path.join(configDir, 'output-styles', `${roleId}.md`)
  }
  const extensionPath = path.join(getExtensionsStylesDir(configDir), `${roleId}.md`)
  if (fs.existsSync(extensionPath)) return extensionPath
  return path.join(configDir, 'output-styles', `${roleId}.md`)
}

function buildDefaultStyleOption(): ZcfRoleOption {
  return {
    id: DEFAULT_STYLE_ID,
    label: '默认',
    description: '原生模式，不注入任何风格提示词',
    builtin: true,
    core: true,
    extension: false,
  }
}

function scanOutputStyles(configDir: string, lang: ZcfLang = 'zh-CN'): ZcfRoleOption[] {
  const stylesDir = path.join(configDir, 'output-styles')
  const roles: ZcfRoleOption[] = [buildDefaultStyleOption()]

  const corePath = path.join(stylesDir, `${CORE_STYLE_ID}.md`)
  if (fs.existsSync(corePath)) {
    roles.push(roleOptionFromFile(CORE_STYLE_ID, fs.readFileSync(corePath, 'utf8'), lang))
  }

  const extensionsDir = getExtensionsStylesDir(configDir)
  if (fs.existsSync(extensionsDir)) {
    for (const file of fs.readdirSync(extensionsDir).filter((f) => f.endsWith('.md'))) {
      const id = file.replace(/\.md$/, '')
      if (id === CORE_STYLE_ID) continue
      const raw = fs.readFileSync(path.join(extensionsDir, file), 'utf8')
      roles.push(roleOptionFromFile(id, raw, lang))
    }
  }

  roles.sort((a, b) => {
    if (a.id === DEFAULT_STYLE_ID) return -1
    if (b.id === DEFAULT_STYLE_ID) return 1
    if (a.id === CORE_STYLE_ID) return -1
    if (b.id === CORE_STYLE_ID) return 1
    if (a.core && !b.core) return -1
    if (!a.core && b.core) return 1
    return a.label.localeCompare(b.label, 'zh-CN')
  })
  return roles
}

function buildUserFacingModes(): ZcfModeOption[] {
  return USER_FACING_MODES.map((mode) => ({ ...mode }))
}

function loadAutoPlanModeContent(): string {
  const configDir = getClaudeConfigDir()
  const optionLines = MODE_DEFS.map((mode) => (
    `- **${mode.label}**：${mode.description}`
  ))

  const workflowSections = MODE_DEFS
    .filter((mode) => mode.id !== 'direct' && mode.dest)
    .map((mode) => {
      const filePath = path.join(configDir, mode.dest)
      const raw = readMarkdownFile(filePath)
      if (!raw) return null
      const body = adaptZcfMarkdown(raw)
      if (!body) return null
      return [
        `### 工作流参考：${mode.label}`,
        '',
        body,
      ].join('\n')
    })
    .filter(Boolean)

  return [
    '## 当前工作流模式',
    '',
    '模式：自动规划',
    '',
    '收到任务后，你必须先判断应采用的内部工作流，并在首条回复中用一行说明所选工作流及理由（例如：「选用六步法：任务需多阶段设计与评审」）。',
    '只能从下列五种工作流中选择一种；选定后严格按对应流程执行：',
    '',
    ...optionLines,
    '',
    '若任务简单明确、可立即动手，必须选 **直接执行**，不要强行套用复杂流程。',
    '由你本人在当前会话中串行完成各步骤；不要尝试 spawn 子 Agent 或 Task 工具。',
    '若与 WeWorker 站点操作、webcli、用户目录或 ask_user 规则冲突，以 WeWorker 规则为准。',
    '',
    '---',
    '',
    '以下为各工作流详细指引（仅供你内部遵循，勿向用户逐条复述）：',
    '',
    workflowSections.join('\n\n'),
  ].join('\n')
}

function writeSyncMeta(meta: ZcfSyncMeta): void {
  fs.writeFileSync(getZcfSyncMetaPath(), JSON.stringify(meta, null, 2), 'utf8')
}

function replaceDirectorySync(src: string, dest: string): void {
  const backup = `${dest}.bak-${process.pid}-${Date.now()}`
  let backedUp = false
  try {
    if (fs.existsSync(dest)) {
      fs.renameSync(dest, backup)
      backedUp = true
    }
    fs.renameSync(src, dest)
    if (backedUp) fs.rmSync(backup, { recursive: true, force: true })
  } catch (e) {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    if (backedUp && fs.existsSync(backup)) fs.renameSync(backup, dest)
    throw e
  }
}

function readSyncMetaPartial(): Partial<ZcfSyncMeta> {
  const existing = readZcfSyncMeta()
  return existing ?? {}
}

export function ensureBundledZcfInstalled(lang: ZcfLang = 'zh-CN'): ZcfSyncMeta {
  const bundledDir = getBundledZcfDir()
  const configDir = getClaudeConfigDir()
  const stylesDest = path.join(configDir, 'output-styles')
  fs.mkdirSync(stylesDest, { recursive: true })
  cleanupLegacyExtensionStylesInRoot(stylesDest)

  let filesCopied = 0

  const coreSrc = path.join(bundledDir, 'output-styles', lang, `${CORE_STYLE_ID}.md`)
  const coreDest = path.join(stylesDest, `${CORE_STYLE_ID}.md`)
  if (copyOverwrite(coreSrc, coreDest)) filesCopied++

  const extensionsDest = getExtensionsStylesDir(configDir)
  const prev = readSyncMetaPartial()
  const defaultExtSrc = path.join(bundledDir, 'output-styles', 'extensions', lang, `${DEFAULT_BUNDLED_EXTENSION_STYLE_ID}.md`)
  const defaultExtDest = path.join(extensionsDest, `${DEFAULT_BUNDLED_EXTENSION_STYLE_ID}.md`)
  if (!prev.lastExtensionSyncAt) {
    if (fs.existsSync(extensionsDest)) fs.rmSync(extensionsDest, { recursive: true, force: true })
    fs.mkdirSync(extensionsDest, { recursive: true })
    if (copyOverwrite(defaultExtSrc, defaultExtDest)) filesCopied++
  } else {
    fs.mkdirSync(extensionsDest, { recursive: true })
    if (copyIfMissing(defaultExtSrc, defaultExtDest)) filesCopied++
  }

  for (const mode of MODE_DEFS) {
    if (!mode.bundled) continue
    const src = path.join(bundledDir, mode.bundled)
    const dest = path.join(configDir, mode.dest)
    if (copyIfMissing(src, dest)) filesCopied++
  }

  const roles = scanOutputStyles(configDir, lang)
  const modes = buildUserFacingModes()
  const meta: ZcfSyncMeta = {
    version: prev.version || 'bundled',
    lang,
    syncedAt: prev.syncedAt ?? null,
    roles,
    modes,
    filesCopied,
    lastExtensionSyncAt: prev.lastExtensionSyncAt ?? null,
  }
  writeSyncMeta(meta)
  if (filesCopied > 0) {
    log.info('installed bundled zcf templates', { filesCopied, lang })
  }
  return meta
}

/** Manual update: fetch latest extension styles and workflows from the ZCF GitHub repository. */
export async function syncZcfTemplates(lang: ZcfLang = 'zh-CN'): Promise<ZcfSyncMeta> {
  ensureBundledZcfInstalled(lang)

  const configDir = getClaudeConfigDir()
  const extensionsDest = getExtensionsStylesDir(configDir)
  const commandsDest = path.join(configDir, 'commands', 'zcf')
  const tempRoot = path.join(getConfigDirectory(), `.zcf-sync-${process.pid}-${Date.now()}`)
  const tempExtensionsDest = path.join(tempRoot, 'extensions')
  const tempCommandsDest = path.join(tempRoot, 'commands', 'zcf')
  fs.mkdirSync(tempExtensionsDest, { recursive: true })
  fs.mkdirSync(tempCommandsDest, { recursive: true })

  let filesCopied = 0

  try {
    const outputStylesRemoteDir = `templates/common/output-styles/${lang}`
    const remoteStyleFiles = await listRemoteMarkdownFiles(outputStylesRemoteDir)
    for (const file of remoteStyleFiles) {
      const id = file.name.replace(/\.md$/, '')
      if (id === CORE_STYLE_ID) continue
      const raw = await fetchRemoteText(file.path)
      fs.writeFileSync(path.join(tempExtensionsDest, file.name), raw, 'utf8')
      filesCopied++
    }

    if (filesCopied === 0) {
      throw new Error(`ZCF 远端没有可更新的扩展风格: ${outputStylesRemoteDir}`)
    }

    for (const mode of MODE_DEFS) {
      if (!mode.dest) continue
      const remotePath = `templates/${mode.zcfSrc(lang)}`
      const raw = await fetchRemoteText(remotePath)
      const relativeDest = path.relative(path.join(configDir, 'commands', 'zcf'), path.join(configDir, mode.dest))
      const tempDestPath = path.join(tempCommandsDest, relativeDest)
      fs.mkdirSync(path.dirname(tempDestPath), { recursive: true })
      fs.writeFileSync(tempDestPath, raw, 'utf8')
      filesCopied++
    }

    replaceDirectorySync(tempExtensionsDest, extensionsDest)
    replaceDirectorySync(tempCommandsDest, commandsDest)

    const roles = scanOutputStyles(configDir, lang)
    const modes = buildUserFacingModes()
    const version = await fetchRemoteZcfVersion()
    const meta: ZcfSyncMeta = {
      version,
      lang,
      syncedAt: readSyncMetaPartial().syncedAt ?? null,
      roles,
      modes,
      filesCopied,
      lastExtensionSyncAt: new Date().toISOString(),
    }
    writeSyncMeta(meta)
    log.info('zcf extension templates synced from remote', { version: meta.version, filesCopied })
    return meta
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

export function readZcfSyncMeta(): ZcfSyncMeta | null {
  const metaPath = getZcfSyncMetaPath()
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ZcfSyncMeta
  } catch {
    return null
  }
}

/** @deprecated Use ensureBundledZcfInstalled — no automatic pull from zcf npm. */
export function ensureZcfSynced(lang: ZcfLang = 'zh-CN'): ZcfSyncMeta {
  return ensureBundledZcfInstalled(lang)
}

export function getZcfCatalog(lang: ZcfLang = 'zh-CN'): ZcfSyncMeta {
  return ensureBundledZcfInstalled(lang)
}

export interface ZcfCatalogResponse {
  package_version: string
  sync: ZcfSyncMeta | null
  roles: ZcfRoleOption[]
  core_styles: ZcfRoleOption[]
  extension_styles: ZcfRoleOption[]
  /** @deprecated use core_styles + extension_styles */
  builtin_roles: ZcfRoleOption[]
  custom_roles: ZcfRoleOption[]
  enabled_role_ids: string[]
  modes: ZcfModeOption[]
  lang: ZcfLang
}

export function buildZcfCatalogResponse(settings: {
  zcf_lang: ZcfLang
  zcf_default_role?: string
  zcf_enabled_roles: string[]
  zcf_custom_roles: ZcfCustomRole[]
}): ZcfCatalogResponse {
  const catalog = getZcfCatalog(settings.zcf_lang)
  const coreStyles = catalog.roles.filter((role) => role.core)
  const extensionStyles = catalog.roles.filter((role) => role.extension)
  const customRoles = settings.zcf_custom_roles.map((role) => ({
    id: role.id,
    label: role.label,
    description: '使用自定义提示词作为默认风格',
    builtin: false,
  }))
  const allRoles = [...catalog.roles, ...customRoles]
  const activeStyleId = normalizeZcfEnabledRoles(
    settings.zcf_enabled_roles,
    settings.zcf_custom_roles,
    catalog.roles.map((role) => role.id),
    settings.zcf_default_role,
  )[0]
  return {
    package_version: getZcfPackageVersion(),
    sync: readZcfSyncMeta(),
    roles: allRoles,
    core_styles: coreStyles,
    extension_styles: extensionStyles,
    builtin_roles: catalog.roles,
    custom_roles: customRoles,
    enabled_role_ids: [activeStyleId],
    modes: catalog.modes,
    lang: catalog.lang,
  }
}

function readMarkdownFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf8')
}

export function adaptZcfMarkdown(content: string): string {
  return content
    .replace(/^---[\s\S]*?---\r?\n?/m, '')
    .replace(/启用\s*Planner Agent/gi, '由你本人担任规划者')
    .replace(/启用\s*[\w-]+\s*Agent/gi, '由你本人完成')
    .replace(/调用\s*Agent\b/gi, '继续执行')
    .replace(/Agent\s*工具/gi, '当前会话')
    .replace(/Task\s*工具/gi, '当前会话')
    .replace(/\$ARGUMENTS/g, '')
    .trim()
}

export function loadCustomRoleContent(roleId: string, customRoles: ZcfCustomRole[]): string {
  const role = customRoles.find((item) => item.id === roleId)
  if (!role?.prompt.trim()) return ''
  return [
    '## 当前 AI 风格（必须遵守）',
    '',
    `风格：${role.label}`,
    '',
    '从本条 system 指令起，你的每一条面向用户的回复都必须符合该风格的语气与表达习惯。',
    '不要说明自己在切换风格；直接按该风格自然回复。',
    '禁止使用 emoji、表情符号、颜文字或装饰性 Unicode 字符。',
    '',
    role.prompt.trim(),
  ].join('\n')
}

export function loadZcfRoleContent(
  roleId: string | null | undefined,
  customRoles: ZcfCustomRole[] = [],
): string {
  if (!roleId || roleId === 'default') return ''
  if (isCustomRoleId(roleId)) {
    return loadCustomRoleContent(roleId, customRoles)
  }
  const configDir = getClaudeConfigDir()
  const filePath = resolveStyleFilePath(configDir, roleId)
  const raw = readMarkdownFile(filePath)
  if (!raw) return ''
  const { meta, body: templateBody } = parseFrontmatter(raw)
  const body = adaptZcfMarkdown(raw)
  if (!body) return ''
  const label = extractStyleDisplayName(roleId, meta, templateBody)
  const isCore = roleId === CORE_STYLE_ID
  const strictRules = isCore
    ? [
      '内置「专业严谨简单明确」风格（最高优先级，简洁聊天风格）：',
      '- 简洁直接：先结论后细节；短句短段；不写废话、铺垫、寒暄、鼓励语。',
      '- 禁止 emoji、表情、颜文字、装饰性符号；禁止语气词与口头语（如「好的」「呢」「吧」等）。',
      '- 禁止重复用户已知信息；禁止为凑篇幅而展开。',
      '- 面向用户的回复禁止使用 Markdown 的 # / ## / ### 章节标题；不要用「测试1：…」式大标题分段。',
      '- 本 system 指令中的 Markdown 标题仅供你理解规则，面向用户的回复不得复用该结构。',
      '- 确需分段时只用 **加粗短标签**（1–3 词，如 **结果**、**下一步**）；多步任务用列表或短段落，像同事同步进展，不要写成文档。',
      '',
    ].join('\n')
    : [
      '从本条 system 指令起，你的每一条面向用户的回复都必须符合该风格的语气与表达习惯。',
      '不要说明自己在切换风格；直接按该风格自然回复。',
      '禁止使用 emoji、表情符号、颜文字或装饰性 Unicode 字符。',
      '',
    ].join('\n')
  return [
    '## 当前 AI 风格（必须遵守）',
    '',
    `风格：${label}`,
    '',
    strictRules,
    body,
  ].join('\n')
}

export function loadZcfModeContent(modeId: string | null | undefined): string {
  const normalized = normalizeZcfMode(modeId)
  if (normalized === DEFAULT_ZCF_MODE) return ''
  if (normalized === AUTO_PLAN_MODE_ID) return loadAutoPlanModeContent()
  return ''
}

export function buildZcfPromptAppendix(
  roleId?: string | null,
  modeId?: string | null,
  customRoles: ZcfCustomRole[] = [],
): string {
  const parts = [loadZcfRoleContent(roleId, customRoles), loadZcfModeContent(modeId)].filter(Boolean)
  return parts.join('\n\n')
}

export function composeSystemPromptWithZcf(
  core: string,
  roleId?: string | null,
  modeId?: string | null,
  customRoles: ZcfCustomRole[] = [],
): string {
  const zcfAppendix = buildZcfPromptAppendix(roleId, modeId, customRoles)
  if (!zcfAppendix) return core
  return [
    zcfAppendix,
    '',
    '---',
    '',
    core,
    '',
    '---',
    '',
    '再次强调：你必须持续体现「当前 AI 风格」的语言习惯；若有冲突，以 WeWorker 工具与安全规则为准。',
  ].join('\n')
}

export function getZcfRoleLabel(
  roleId: string | null | undefined,
  customRoles: ZcfCustomRole[] = [],
): string {
  if (!roleId) return ''
  if (roleId === DEFAULT_STYLE_ID) return '默认'
  const custom = customRoles.find((role) => role.id === roleId)
  if (custom) return custom.label
  const configDir = getClaudeConfigDir()
  const filePath = resolveStyleFilePath(configDir, roleId)
  const raw = readMarkdownFile(filePath)
  if (raw) {
    const { meta, body } = parseFrontmatter(raw)
    return extractStyleDisplayName(roleId, meta, body)
  }
  return STYLE_LABELS[roleId] || roleId
}

export function resolveZcfPrefs(
  work: { zcf_role?: string | null; zcf_mode?: string | null },
  settings: {
    zcf_default_role?: string
    zcf_default_mode?: string
    zcf_enabled_roles?: string[]
    zcf_custom_roles?: ZcfCustomRole[]
    zcf_lang?: ZcfLang
  },
): { zcfRole: string; zcfMode: string } {
  const lang = settings.zcf_lang || 'zh-CN'
  const available = new Set([
    ...listAvailableStyleIds(lang),
    ...(settings.zcf_custom_roles || []).map((role) => role.id),
  ])
  const fallback = normalizeZcfEnabledRoles(
    settings.zcf_enabled_roles,
    settings.zcf_custom_roles || [],
    [...available],
    settings.zcf_default_role,
  )[0]

  const resolveRole = (role?: string | null) => {
    const candidate = role || fallback
    if (available.has(candidate)) return candidate
    if (available.has(fallback)) return fallback
    return DEFAULT_STYLE_ID
  }

  return {
    zcfRole: resolveRole(work.zcf_role),
    zcfMode: normalizeZcfMode(work.zcf_mode || settings.zcf_default_mode),
  }
}

export function sanitizeWorkZcfPrefsPatch(
  patch: { zcf_role?: string | null; zcf_mode?: string | null },
  settings: Parameters<typeof resolveZcfPrefs>[1],
): { zcf_role?: string | null; zcf_mode?: string | null } {
  const next: { zcf_role?: string | null; zcf_mode?: string | null } = {}
  if (patch.zcf_role !== undefined) {
    next.zcf_role = resolveZcfPrefs({ zcf_role: patch.zcf_role, zcf_mode: null }, settings).zcfRole
  }
  if (patch.zcf_mode !== undefined) {
    next.zcf_mode = normalizeZcfMode(patch.zcf_mode)
  }
  return next
}

export function sanitizeZcfDefaultSettings(
  input: { zcf_default_role?: string; zcf_default_mode?: string },
  settings: Parameters<typeof resolveZcfPrefs>[1],
): { zcf_default_role?: string; zcf_default_mode?: string } {
  const next: { zcf_default_role?: string; zcf_default_mode?: string } = {}
  if (input.zcf_default_role !== undefined) {
    next.zcf_default_role = resolveZcfPrefs(
      { zcf_role: input.zcf_default_role, zcf_mode: null },
      settings,
    ).zcfRole
  }
  if (input.zcf_default_mode !== undefined) {
    next.zcf_default_mode = normalizeZcfMode(input.zcf_default_mode)
  }
  return next
}

export function sanitizeZcfRoleSettingsPatch(
  input: {
    zcf_default_role?: string
    zcf_enabled_roles?: string[]
    zcf_custom_roles?: ZcfCustomRole[]
  },
  settings: Parameters<typeof resolveZcfPrefs>[1],
): { zcf_default_role?: string; zcf_enabled_roles?: string[]; zcf_custom_roles?: ZcfCustomRole[] } {
  const customRoles = input.zcf_custom_roles !== undefined
    ? normalizeZcfCustomRoles(input.zcf_custom_roles)
    : normalizeZcfCustomRoles(settings.zcf_custom_roles || [])
  const candidate = input.zcf_default_role
    ?? (Array.isArray(input.zcf_enabled_roles) ? input.zcf_enabled_roles[0] : settings.zcf_default_role)
  const enabledRoles = Array.isArray(input.zcf_enabled_roles)
    ? input.zcf_enabled_roles
    : (candidate ? [candidate] : settings.zcf_enabled_roles)
  const activeStyle = normalizeZcfEnabledRoles(
    enabledRoles,
    customRoles,
    listAvailableStyleIds(settings.zcf_lang || 'zh-CN'),
    candidate,
  )[0]

  const next: { zcf_default_role?: string; zcf_enabled_roles?: string[]; zcf_custom_roles?: ZcfCustomRole[] } = {}
  if (input.zcf_custom_roles !== undefined) next.zcf_custom_roles = customRoles
  if (
    input.zcf_default_role !== undefined
    || input.zcf_enabled_roles !== undefined
    || input.zcf_custom_roles !== undefined
  ) {
    next.zcf_default_role = activeStyle
    next.zcf_enabled_roles = [activeStyle]
  }
  return next
}

export function listAvailableStyleIds(lang: ZcfLang = 'zh-CN'): string[] {
  const catalog = getZcfCatalog(lang)
  return [DEFAULT_STYLE_ID, ...catalog.roles.map((role) => role.id).filter((id) => id !== DEFAULT_STYLE_ID)]
}
