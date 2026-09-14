import os from 'node:os'
import path from 'node:path'

export const USER_DIRECTORY_BLACKLIST_TYPES = {
  exact_path: '路径精确匹配',
  regex_path: '路径正则匹配',
} as const

export type UserDirectoryBlacklistType = keyof typeof USER_DIRECTORY_BLACKLIST_TYPES

export interface UserDirectoryBlacklistEntry {
  type: UserDirectoryBlacklistType
  pattern: string
}

export function normalizeBlacklistType(value: unknown): UserDirectoryBlacklistType | null {
  const next = String(value ?? '').trim()
  if (next === 'exact_path' || next === 'regex_path') return next
  return null
}

function normalizeSlashes(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '')
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(String(value || '').trim()) || String(value || '').trim().startsWith('\\\\')
}

function normalizeRelativePath(value: string): string {
  return normalizeSlashes(String(value || '').trim()).replace(/^\.\/+/, '').replace(/^\/+/, '')
}

function expandHome(value: string): string {
  const trimmed = String(value || '').trim()
  if (trimmed === '~') return os.homedir()
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2))
  if (trimmed.startsWith('~\\')) return path.join(os.homedir(), trimmed.slice(2))
  return trimmed
}

function compileRegex(pattern: string): RegExp | null {
  const trimmed = String(pattern || '').trim()
  if (!trimmed) return null
  try {
    return new RegExp(trimmed)
  } catch {
    return null
  }
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 将精确路径规则转为内部匹配用正则（存储仍保留用户原始输入） */
export function compileExactPathPattern(pattern: string): string {
  const trimmed = String(pattern || '').trim()
  if (!trimmed) return ''
  if (patternUsesAbsolutePath(trimmed)) {
    return `^${escapeRegexLiteral(normalizeSlashes(trimmed))}$`
  }
  const normalized = normalizeRelativePath(trimmed)
  if (normalized.includes('/')) {
    return `^${escapeRegexLiteral(normalized)}$`
  }
  return `(^|/)${escapeRegexLiteral(normalized)}$`
}

function compileEntryPattern(entry: UserDirectoryBlacklistEntry): RegExp | null {
  const pattern = String(entry.pattern || '').trim()
  if (!pattern) return null
  if (entry.type === 'exact_path') return compileRegex(compileExactPathPattern(pattern))
  return compileRegex(pattern)
}

/** 判断规则是否以绝对路径起笔，用于选择匹配目标 */
export function patternUsesAbsolutePath(pattern: string): boolean {
  const trimmed = String(pattern || '').trim()
  const probe = trimmed.replace(/^\^+/, '')
  if (/^[A-Za-z]:[\\/]/.test(probe)) return true
  if (probe.startsWith('\\\\')) return true
  if (probe === '~' || probe.startsWith('~/') || probe.startsWith('~\\')) return true
  if (/^\/(?:Users|home|tmp|var|opt|mnt|media|[A-Za-z])/.test(probe)) return true
  return false
}

function getRelativePathFromRoot(userRoot: string, targetPath: string): string {
  const pathApi = isWindowsAbsolutePath(userRoot) || isWindowsAbsolutePath(targetPath)
    ? path.win32
    : path
  const relative = pathApi.relative(pathApi.resolve(userRoot), pathApi.resolve(targetPath))
  return normalizeRelativePath(relative)
}

function getPathMatchTarget(pattern: string, userRoot: string, targetPath: string): string {
  const expanded = expandHome(targetPath)
  const resolved = isWindowsAbsolutePath(expanded) ? normalizeSlashes(expanded) : path.resolve(expanded)
  if (patternUsesAbsolutePath(pattern)) {
    return normalizeSlashes(resolved)
  }
  return getRelativePathFromRoot(userRoot, resolved)
}

export function validateBlacklistEntry(entry: UserDirectoryBlacklistEntry): string | null {
  const pattern = String(entry.pattern || '').trim()
  if (!pattern) return '规则不能为空'
  if (entry.type === 'exact_path') return null
  if (entry.type === 'regex_path') {
    if (!compileRegex(pattern)) return '正则表达式无效'
    return null
  }
  return '不支持的规则类型'
}

export function normalizeUserDirectoryBlacklist(raw: unknown): UserDirectoryBlacklistEntry[] {
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const entries: UserDirectoryBlacklistEntry[] = []

  for (const item of raw) {
    const entry = parseBlacklistEntry(item)
    if (!entry) continue

    const key = `${entry.type}:${entry.pattern}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }

  return entries
}

function parseBlacklistEntry(raw: unknown): UserDirectoryBlacklistEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const type = normalizeBlacklistType(record.type)
  const pattern = String(record.pattern ?? '').trim()
  if (!type || !pattern) return null

  const entry: UserDirectoryBlacklistEntry = { type, pattern }
  if (validateBlacklistEntry(entry)) return null
  return entry
}

function unquotePathToken(value: string): string {
  const trimmed = String(value || '').trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** 从 Shell 命令提取可能的路径/文件名 token（不做子串匹配） */
export function extractShellCommandPathTokens(command: string): string[] {
  const tokens = new Set<string>()
  const quoted = command.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g) || []
  for (const item of quoted) tokens.add(unquotePathToken(item))

  const stripped = command.replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, ' ')
  for (const part of stripped.split(/\s+/)) {
    if (part) tokens.add(part)
  }
  return [...tokens].filter(Boolean)
}

function resolveShellTokenPath(token: string, userRoot: string): string {
  const trimmed = String(token || '').trim()
  if (!trimmed) return path.resolve(userRoot)
  const expanded = expandHome(trimmed)
  if (isWindowsAbsolutePath(expanded)) return normalizeSlashes(expanded)
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(userRoot, expanded)
}

function extractQuotedPathLiterals(value: string): string[] {
  const literals: string[] = []
  for (const match of String(value || '').matchAll(/(?:r)?['"]([^'"]+)['"]/gi)) {
    if (match[1]) literals.push(match[1])
  }
  return literals
}

function collectShellPathCandidates(token: string, userRoot: string): string[] {
  const values = new Set<string>([String(token || '').trim(), ...extractQuotedPathLiterals(token)])
  const candidates = new Set<string>()
  for (const value of values) {
    if (!value || value.startsWith('-')) continue
    candidates.add(resolveShellTokenPath(value, userRoot))
  }
  return [...candidates]
}

function shellTokenReferencesExactPathRule(
  token: string,
  entry: UserDirectoryBlacklistEntry,
  userRoot: string,
): boolean {
  if (entry.type !== 'exact_path') return false
  const normalized = patternUsesAbsolutePath(entry.pattern)
    ? normalizeSlashes(entry.pattern)
    : normalizeRelativePath(entry.pattern)
  if (!normalized.includes('/')) return false

  const ruleBasename = normalized.split('/').filter(Boolean).pop() || ''
  if (!ruleBasename) return false

  const probeValues = [String(token || '').trim(), ...extractQuotedPathLiterals(token)]
  for (const value of probeValues) {
    if (!value) continue
    const basename = value.split(/[/\\]/).filter(Boolean).pop() || value
    if (basename !== ruleBasename) continue
    const blockedPath = patternUsesAbsolutePath(entry.pattern)
      ? isWindowsAbsolutePath(normalized) ? normalizeSlashes(normalized) : path.resolve(expandHome(normalized))
      : path.join(userRoot, normalized)
    if (isPathBlacklisted(blockedPath, [entry], userRoot)) return true
  }
  return false
}

/** 检测 Shell 命令是否通过路径 token 引用黑名单（整段路径/文件名精确匹配，不做子串） */
export function isShellCommandReferencingBlacklistedPath(
  command: string,
  entries: UserDirectoryBlacklistEntry[],
  userRoot: string,
): boolean {
  if (!entries.length || !String(command || '').trim()) return false

  const root = isWindowsAbsolutePath(userRoot) ? path.win32.resolve(userRoot) : path.resolve(userRoot)
  for (const token of extractShellCommandPathTokens(command)) {
    if (!token || token.startsWith('-') || /^https?:\/\//i.test(token)) continue
    for (const candidate of collectShellPathCandidates(token, root)) {
      if (isPathBlacklisted(candidate, entries, root)) return true
    }
    for (const entry of entries) {
      if (shellTokenReferencesExactPathRule(token, entry, root)) return true
    }
  }
  return false
}

function testRegexAgainstPath(regex: RegExp, target: string, windowsPath: boolean): boolean {
  if (windowsPath && !regex.flags.includes('i')) {
    return new RegExp(regex.source, `${regex.flags}i`).test(target)
  }
  return regex.test(target)
}

export function isPathBlacklisted(
  targetPath: string,
  entries: UserDirectoryBlacklistEntry[],
  userRoot: string,
): boolean {
  if (!entries.length) return false

  const windowsPath = process.platform === 'win32'
    || isWindowsAbsolutePath(userRoot)
    || isWindowsAbsolutePath(targetPath)
  for (const entry of entries) {
    const regex = compileEntryPattern(entry)
    if (!regex) continue
    const target = getPathMatchTarget(entry.pattern, userRoot, targetPath)
    if (testRegexAgainstPath(regex, target, windowsPath)) return true
  }

  return false
}

export function formatBlacklistEntry(entry: UserDirectoryBlacklistEntry): string {
  const scope = patternUsesAbsolutePath(entry.pattern) ? '绝对路径' : '用户目录相对路径'
  if (entry.type === 'exact_path') {
    return `${USER_DIRECTORY_BLACKLIST_TYPES.exact_path}（${scope}）\`${entry.pattern}\``
  }
  return `${USER_DIRECTORY_BLACKLIST_TYPES.regex_path}（${scope}）\`${entry.pattern}\``
}

export function countInvalidBlacklistEntries(raw: unknown): number {
  if (!Array.isArray(raw)) return 0
  let count = 0
  for (const item of raw) {
    if (!parseBlacklistEntry(item)) count += 1
  }
  return count
}
