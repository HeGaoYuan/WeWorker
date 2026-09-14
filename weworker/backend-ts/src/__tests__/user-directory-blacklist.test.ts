import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  compileExactPathPattern,
  countInvalidBlacklistEntries,
  isPathBlacklisted,
  isShellCommandReferencingBlacklistedPath,
  normalizeUserDirectoryBlacklist,
  patternUsesAbsolutePath,
  validateBlacklistEntry,
} from '../user-directory-blacklist.js'

describe('user-directory blacklist', () => {
  const root = path.join(os.tmpdir(), 'weworker-blacklist-test')

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('keeps only valid exact_path and regex_path entries', () => {
    const entries = normalizeUserDirectoryBlacklist([
      { type: 'regex_path', pattern: '^secrets/key\\.txt$' },
      { type: 'exact_path', pattern: 'folder-b/foo/.env' },
      { type: 'path', pattern: 'secrets/key.txt' },
      { type: 'regex_path', pattern: '(' },
    ])

    expect(entries).toEqual([
      { type: 'regex_path', pattern: '^secrets/key\\.txt$' },
      { type: 'exact_path', pattern: 'folder-b/foo/.env' },
    ])
  })

  it('rejects invalid regex patterns', () => {
    expect(validateBlacklistEntry({ type: 'regex_path', pattern: '(' })).toMatch(/无效/)
    expect(validateBlacklistEntry({ type: 'regex_path', pattern: '^ok$' })).toBeNull()
    expect(validateBlacklistEntry({ type: 'exact_path', pattern: '.env' })).toBeNull()
    expect(countInvalidBlacklistEntries([
      { type: 'regex_path', pattern: '(' },
      { type: 'path', pattern: 'x' },
    ])).toBe(2)
  })

  // Keep in sync with renderer SettingsModal.jsx validateBlacklistEntry
  it('validation contract matches settings UI expectations', () => {
    const cases: Array<{ entry: { type: string; pattern: string }; error: string | null }> = [
      { entry: { type: 'exact_path', pattern: '' }, error: '规则不能为空' },
      { entry: { type: 'regex_path', pattern: '   ' }, error: '规则不能为空' },
      { entry: { type: 'exact_path', pattern: '.env' }, error: null },
      { entry: { type: 'exact_path', pattern: 'folder-b/foo/.env' }, error: null },
      { entry: { type: 'regex_path', pattern: '^secrets/.*$' }, error: null },
      { entry: { type: 'regex_path', pattern: '(' }, error: '正则表达式无效' },
      { entry: { type: 'path', pattern: 'legacy' }, error: '不支持的规则类型' },
    ]
    for (const { entry, error } of cases) {
      const result = validateBlacklistEntry(entry as Parameters<typeof validateBlacklistEntry>[0])
      if (error === null) expect(result).toBeNull()
      else expect(result).toBe(error)
    }
  })

  it('matches relative regex against user-directory paths by default', () => {
    fs.mkdirSync(path.join(root, 'folder-b', 'zcf (1)', 'BaiduSyncdisk'), { recursive: true })
    const target = path.join(root, 'folder-b', 'zcf (1)', 'BaiduSyncdisk', '同步空间帮助文档.pdf')
    const entries = [{
      type: 'regex_path' as const,
      pattern: '^folder-b/zcf \\(1\\)/BaiduSyncdisk/同步空间帮.*档\\.pdf$',
    }]

    expect(patternUsesAbsolutePath(entries[0].pattern)).toBe(false)
    expect(isPathBlacklisted(target, entries, root)).toBe(true)
    expect(isPathBlacklisted(path.join(root, 'folder-b', 'zcf (1)', 'BaiduSyncdisk', '其他.pdf'), entries, root)).toBe(false)
  })

  it('matches absolute regex against resolved absolute paths', () => {
    fs.mkdirSync(path.join(root, 'secrets'), { recursive: true })
    const target = path.join(root, 'secrets', 'key.txt')
    const normalizedRoot = root.replace(/\\/g, '/')
    const entries = [{
      type: 'regex_path' as const,
      pattern: `^${normalizedRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/secrets/key\\.txt$`,
    }]

    expect(patternUsesAbsolutePath(entries[0].pattern)).toBe(true)
    expect(isPathBlacklisted(target, entries, root)).toBe(true)
    expect(isPathBlacklisted(path.join(root, 'secrets', 'other.txt'), entries, root)).toBe(false)
  })

  it('matches exact relative paths literally', () => {
    const entries = normalizeUserDirectoryBlacklist([
      { type: 'exact_path', pattern: 'folder-b/zcf (1)/BaiduSyncdisk/同步空间新手教程.docx' },
    ])
    expect(entries[0]?.pattern).toBe('folder-b/zcf (1)/BaiduSyncdisk/同步空间新手教程.docx')
    expect(compileExactPathPattern(entries[0]!.pattern)).toBe('^folder-b/zcf \\(1\\)/BaiduSyncdisk/同步空间新手教程\\.docx$')
    expect(isPathBlacklisted(
      path.join(root, 'folder-b', 'zcf (1)', 'BaiduSyncdisk', '同步空间新手教程.docx'),
      entries,
      root,
    )).toBe(true)
  })

  it('matches exact Windows absolute paths literally', () => {
    const userRoot = 'C:/Users/liuqi/.weworker/user-files'
    const target = path.join(userRoot, 'build_simple.bat')
    const entries = normalizeUserDirectoryBlacklist([
      { type: 'exact_path', pattern: 'C:\\Users\\liuqi\\.weworker\\user-files\\build_simple.bat' },
    ])
    expect(isPathBlacklisted(target, entries, userRoot)).toBe(true)
  })

  it('matches relative regex case-insensitively on Windows paths', () => {
    const windowsRoot = 'C:/Users/liuqi/.weworker/user-files'
    const target = path.win32.join(windowsRoot, 'folder-b', 'zcf (1)', 'BaiduSyncDisk', '同步空间新手教程.docx')
    const entries = [{
      type: 'regex_path' as const,
      pattern: '^folder-b/zcf \\(1\\)/BaiduSyncdisk/同步空间新手教程\\.docx$',
    }]

    expect(isPathBlacklisted(target, entries, windowsRoot)).toBe(true)
  })

  it('detects absolute path regex prefixes', () => {
    expect(patternUsesAbsolutePath('^C:/Users/liuqi/.weworker/user-files/.*')).toBe(true)
    expect(patternUsesAbsolutePath('^folder-b/.*')).toBe(false)
    expect(patternUsesAbsolutePath('^~/secret\\.txt$')).toBe(true)
    expect(patternUsesAbsolutePath('C:/Users/liuqi/.weworker/user-files/foo.txt')).toBe(true)
  })

  it('blocks shell commands that only reference a blacklisted basename', () => {
    const entries = [{
      type: 'exact_path' as const,
      pattern: 'folder-b/zcf (1)/BaiduSyncdisk/同步空间新手教程.docx',
    }]
    const cmd = 'python -c "import docx; print(docx.Document(\'同步空间新手教程.docx\').paragraphs)"'
    expect(isShellCommandReferencingBlacklistedPath(cmd, entries, root)).toBe(true)
    expect(isShellCommandReferencingBlacklistedPath('echo hello', entries, root)).toBe(false)
  })

  it('does not substring-match filename via exact_path', () => {
    const userRoot = 'C:/Users/liuqi/.weworker/user-files'
    const target = path.join(userRoot, 'folder-b', 'zcf (1)', 'BaiduSyncdisk', '一分钟精通如何使用同步空间.mp4')
    const entries = normalizeUserDirectoryBlacklist([{ type: 'exact_path', pattern: '一分钟' }])
    expect(isPathBlacklisted(target, entries, userRoot)).toBe(false)
  })

  it('blocks exact filename .env but not .envi', () => {
    const entries = normalizeUserDirectoryBlacklist([{ type: 'exact_path', pattern: '.env' }])
    expect(isPathBlacklisted(path.join(root, '.env'), entries, root)).toBe(true)
    expect(isPathBlacklisted(path.join(root, 'secrets', '.env'), entries, root)).toBe(true)
    expect(isPathBlacklisted(path.join(root, '.envi'), entries, root)).toBe(false)
    expect(isPathBlacklisted(path.join(root, 'secrets', '.envi'), entries, root)).toBe(false)
  })

  it('does not treat .env.example as .env for path or shell tokens', () => {
    const entries = normalizeUserDirectoryBlacklist([{ type: 'exact_path', pattern: '.env' }])
    expect(isPathBlacklisted(path.join(root, '.env.example'), entries, root)).toBe(false)
    expect(isPathBlacklisted(path.join(root, 'secrets', '.env.example'), entries, root)).toBe(false)
    expect(isShellCommandReferencingBlacklistedPath('type ".env.example"', entries, root)).toBe(false)
    expect(isShellCommandReferencingBlacklistedPath('type ".env"', entries, root)).toBe(true)
  })

  it('blocks full relative path to mp4 exactly', () => {
    const userRoot = 'C:/Users/liuqi/.weworker/user-files'
    const rel = 'folder-b/zcf (1)/BaiduSyncdisk/一分钟精通如何使用同步空间.mp4'
    const target = path.join(userRoot, rel)
    const entries = normalizeUserDirectoryBlacklist([{ type: 'exact_path', pattern: rel }])
    expect(isPathBlacklisted(target, entries, userRoot)).toBe(true)
  })
})
