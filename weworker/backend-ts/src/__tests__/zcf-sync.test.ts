import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js')
  let tmpDir = ''
  return {
    ...actual,
    getConfigDirectory: () => tmpDir,
    __setTmpDir: (dir: string) => { tmpDir = dir },
  }
})

import * as config from '../config.js'
import { normalizeZcfEnabledRoles } from '../zcf-role-settings.js'
import {
  adaptZcfMarkdown,
  buildZcfCatalogResponse,
  buildZcfPromptAppendix,
  AUTO_PLAN_MODE_ID,
  CORE_STYLE_ID,
  DEFAULT_BUNDLED_EXTENSION_STYLE_ID,
  DEFAULT_STYLE_ID,
  DEFAULT_ZCF_MODE,
  ensureBundledZcfInstalled,
  getZcfPackageVersion,
  normalizeZcfMode,
  resolveZcfPrefs,
  sanitizeZcfRoleSettingsPatch,
  sanitizeWorkZcfPrefsPatch,
  syncZcfTemplates,
} from '../zcf-sync.js'

describe('zcf-sync', () => {
  let tmpDir = ''

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-zcf-'))
    ;(config as unknown as { __setTmpDir: (dir: string) => void }).__setTmpDir(tmpDir)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reports remote zcf version placeholder before manual sync', () => {
    expect(getZcfPackageVersion()).toBe('remote')
  })

  it('installs built-in weworker-clear and default extension engineer-professional', () => {
    const meta = ensureBundledZcfInstalled('zh-CN')
    expect(meta.roles.some((r) => r.id === DEFAULT_STYLE_ID)).toBe(true)
    expect(meta.roles.find((r) => r.id === DEFAULT_STYLE_ID)?.label).toBe('默认')
    expect(meta.roles.some((r) => r.id === CORE_STYLE_ID)).toBe(true)
    expect(meta.roles.some((r) => r.id === DEFAULT_BUNDLED_EXTENSION_STYLE_ID)).toBe(true)
    const engineer = meta.roles.find((r) => r.id === DEFAULT_BUNDLED_EXTENSION_STYLE_ID)
    expect(engineer?.label).toBe('工程师专业版')
    expect(engineer?.description).toBe('专业的软件工程师，严格遵循SOLID、KISS、DRY、YAGNI原则')
    expect(meta.roles.filter((r) => r.extension).length).toBeGreaterThanOrEqual(1)

    const configDir = path.join(tmpDir, 'claude-config')
    expect(fs.existsSync(path.join(configDir, 'output-styles', 'weworker-clear.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'output-styles', 'extensions', 'engineer-professional.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'output-styles', 'engineer-professional.md'))).toBe(false)

    const core = fs.readFileSync(path.join(configDir, 'output-styles', 'weworker-clear.md'), 'utf8')
    expect(core).toContain('大标题')
    expect(core).toContain('语气词')
  })

  it('manual sync fetches extension styles from remote without touching built-in core', async () => {
    const remoteFiles = [
      { name: 'nekomata-engineer.md', path: 'templates/common/output-styles/zh-CN/nekomata-engineer.md', type: 'file' },
      { name: 'engineer-professional.md', path: 'templates/common/output-styles/zh-CN/engineer-professional.md', type: 'file' },
    ]
    const remoteContent: Record<string, unknown> = {
      'templates/common/output-styles/zh-CN?ref=main': remoteFiles,
      'templates/common/output-styles/zh-CN/nekomata-engineer.md': '# 猫娘工程师\n\n喵喵工程师规则',
      'templates/common/output-styles/zh-CN/engineer-professional.md': '# 工程师专业版\n\n专业工程师规则',
      'templates/common/workflow/sixStep/zh-CN/workflow.md': '远端六步法',
      'templates/claude-code/zh-CN/workflow/plan/commands/feat.md': '远端功能开发',
      'templates/common/workflow/git/zh-CN/git-commit.md': '远端 Git 工作流',
      'templates/claude-code/zh-CN/workflow/common/commands/init-project.md': '远端项目初始化',
      'package.json': JSON.stringify({ version: '9.9.9' }),
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      const key = Object.keys(remoteContent).find((item) => url.includes(item))
      if (!key) return new Response('not found', { status: 404 })
      const value = remoteContent[key]
      return new Response(
        typeof value === 'string' ? value : JSON.stringify(value),
        { status: 200, headers: { 'Content-Type': typeof value === 'string' ? 'text/plain' : 'application/json' } },
      )
    }))

    ensureBundledZcfInstalled('zh-CN')
    const meta = await syncZcfTemplates('zh-CN')
    expect(meta.lastExtensionSyncAt).toBeTruthy()
    expect(meta.version).toBe('9.9.9')
    expect(meta.roles.some((r) => r.id === 'nekomata-engineer')).toBe(true)
    const nekomata = meta.roles.find((r) => r.id === 'nekomata-engineer')
    expect(nekomata?.label).toBe('猫娘工程师')

    const configDir = path.join(tmpDir, 'claude-config')
    expect(fs.existsSync(path.join(configDir, 'output-styles', 'extensions', 'nekomata-engineer.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'output-styles', 'weworker-clear.md'))).toBe(true)
    expect(fs.readFileSync(path.join(configDir, 'commands', 'zcf', 'workflow.md'), 'utf8')).toBe('远端六步法')
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('falls back to GitHub contents api when raw template download fails', async () => {
    const remoteFiles = [
      { name: 'engineer-professional.md', path: 'templates/common/output-styles/zh-CN/engineer-professional.md', type: 'file' },
    ]
    const rawContent: Record<string, string> = {
      'templates/common/output-styles/zh-CN/engineer-professional.md': '# 工程师专业版\n\n远端风格',
      'templates/common/workflow/sixStep/zh-CN/workflow.md': '远端六步法',
      'templates/claude-code/zh-CN/workflow/plan/commands/feat.md': '远端功能开发',
      'templates/common/workflow/git/zh-CN/git-commit.md': '远端 Git 工作流',
      'templates/claude-code/zh-CN/workflow/common/commands/init-project.md': '远端项目初始化',
      'package.json': JSON.stringify({ version: '9.9.9' }),
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('api.github.com') && url.includes('templates/common/output-styles/zh-CN?ref=main')) {
        return new Response(JSON.stringify(remoteFiles), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const rawKey = Object.keys(rawContent).find((item) => url.includes(item))
      if (!rawKey) return new Response('not found', { status: 404 })
      if (url.includes('raw.githubusercontent.com')) {
        throw new Error('fetch failed')
      }
      return new Response(JSON.stringify({
        name: path.basename(rawKey),
        path: rawKey,
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(rawContent[rawKey], 'utf8').toString('base64'),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    ensureBundledZcfInstalled('zh-CN')
    const meta = await syncZcfTemplates('zh-CN')

    expect(meta.version).toBe('9.9.9')
    expect(meta.roles.some((r) => r.id === 'engineer-professional')).toBe(true)
  })

  it('manual sync fails when remote zcf templates are unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 503 })))
    ensureBundledZcfInstalled('zh-CN')

    await expect(syncZcfTemplates('zh-CN')).rejects.toThrow('GitHub 请求失败 503')
  })

  it('manual sync fails when a required workflow template is unavailable', async () => {
    const remoteFiles = [
      { name: 'engineer-professional.md', path: 'templates/common/output-styles/zh-CN/engineer-professional.md', type: 'file' },
    ]
    const remoteContent: Record<string, unknown> = {
      'templates/common/output-styles/zh-CN?ref=main': remoteFiles,
      'templates/common/output-styles/zh-CN/engineer-professional.md': '# 工程师专业版\n\n专业工程师规则',
      'templates/common/workflow/sixStep/zh-CN/workflow.md': '远端六步法',
      'templates/claude-code/zh-CN/workflow/plan/commands/feat.md': '远端功能开发',
      'templates/common/workflow/git/zh-CN/git-commit.md': '远端 Git 工作流',
      'package.json': JSON.stringify({ version: '9.9.9' }),
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      const key = Object.keys(remoteContent).find((item) => url.includes(item))
      if (!key) return new Response('not found', { status: 404 })
      const value = remoteContent[key]
      return new Response(
        typeof value === 'string' ? value : JSON.stringify(value),
        { status: 200, headers: { 'Content-Type': typeof value === 'string' ? 'text/plain' : 'application/json' } },
      )
    }))
    ensureBundledZcfInstalled('zh-CN')

    await expect(syncZcfTemplates('zh-CN')).rejects.toThrow('init-project.md')
  })

  it('manual sync leaves installed extension files untouched when a style download fails', async () => {
    const remoteFiles = [
      { name: 'nekomata-engineer.md', path: 'templates/common/output-styles/zh-CN/nekomata-engineer.md', type: 'file' },
      { name: 'rem-engineer.md', path: 'templates/common/output-styles/zh-CN/rem-engineer.md', type: 'file' },
    ]
    const remoteContent: Record<string, unknown> = {
      'templates/common/output-styles/zh-CN?ref=main': remoteFiles,
      'templates/common/output-styles/zh-CN/nekomata-engineer.md': '# 猫娘工程师\n\n新远端内容',
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      const key = Object.keys(remoteContent).find((item) => url.includes(item))
      if (!key) return new Response('not found', { status: 404 })
      const value = remoteContent[key]
      return new Response(
        typeof value === 'string' ? value : JSON.stringify(value),
        { status: 200, headers: { 'Content-Type': typeof value === 'string' ? 'text/plain' : 'application/json' } },
      )
    }))
    ensureBundledZcfInstalled('zh-CN')
    const configDir = path.join(tmpDir, 'claude-config')
    const extensionsDir = path.join(configDir, 'output-styles', 'extensions')
    const existingPath = path.join(extensionsDir, 'engineer-professional.md')
    const existingContent = fs.readFileSync(existingPath, 'utf8')

    await expect(syncZcfTemplates('zh-CN')).rejects.toThrow('rem-engineer.md')

    expect(fs.readFileSync(existingPath, 'utf8')).toBe(existingContent)
    expect(fs.existsSync(path.join(extensionsDir, 'nekomata-engineer.md'))).toBe(false)
  })

  it('remote sync requests include an abort signal so updates cannot hang forever', async () => {
    const fetchSpy = vi.fn(async () => new Response('offline', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)
    ensureBundledZcfInstalled('zh-CN')

    await expect(syncZcfTemplates('zh-CN')).rejects.toThrow('GitHub 请求失败 503')

    expect(fetchSpy).toHaveBeenCalled()
    const calls = fetchSpy.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    expect(calls.every(([, init]) => Boolean(init?.signal))).toBe(true)
  })

  it('adaptZcfMarkdown rewrites agent references', () => {
    const adapted = adaptZcfMarkdown('---\nname: x\n---\n启用 Planner Agent 并调用 Agent')
    expect(adapted).not.toContain('---')
    expect(adapted).toContain('由你本人担任规划者')
    expect(adapted).not.toMatch(/启用 Planner Agent/)
  })

  it('buildZcfPromptAppendix skips style injection for default style', () => {
    ensureBundledZcfInstalled('zh-CN')
    const appendix = buildZcfPromptAppendix(DEFAULT_STYLE_ID, DEFAULT_ZCF_MODE)
    expect(appendix).toBe('')
  })

  it('buildZcfPromptAppendix includes built-in style and auto-plan mode content', () => {
    ensureBundledZcfInstalled('zh-CN')
    const appendix = buildZcfPromptAppendix('weworker-clear', AUTO_PLAN_MODE_ID)
    expect(appendix).toContain('当前 AI 风格')
    expect(appendix).toContain('专业严谨简单明确')
    expect(appendix).not.toContain('已完成 → 当前状态 → 下一步')
    expect(appendix).toContain('自动规划')
    expect(appendix).toContain('直接执行')
    expect(appendix).toContain('六步法')
  })

  it('resolveZcfPrefs normalizes legacy workflow modes to auto-plan', () => {
    ensureBundledZcfInstalled('zh-CN')
    const prefs = resolveZcfPrefs(
      { zcf_role: 'engineer-professional', zcf_mode: 'feat' },
      {
        zcf_default_role: 'weworker-clear',
        zcf_default_mode: DEFAULT_ZCF_MODE,
        zcf_enabled_roles: ['weworker-clear'],
        zcf_lang: 'zh-CN',
      },
    )
    expect(prefs.zcfRole).toBe('engineer-professional')
    expect(prefs.zcfMode).toBe(AUTO_PLAN_MODE_ID)
  })

  it('buildZcfCatalogResponse exposes only default and auto-plan modes', () => {
    ensureBundledZcfInstalled('zh-CN')
    const catalog = buildZcfCatalogResponse({
      zcf_lang: 'zh-CN',
      zcf_default_role: 'weworker-clear',
      zcf_enabled_roles: ['weworker-clear'],
      zcf_custom_roles: [],
    })
    expect(catalog.modes.map((mode) => mode.id)).toEqual([DEFAULT_ZCF_MODE, AUTO_PLAN_MODE_ID])
    expect(catalog.modes[0]?.label).toBe('默认')
    expect(catalog.modes[1]?.label).toBe('自动规划')
    expect(catalog.modes[0]?.description).toContain('原生模式')
    expect(catalog.modes[1]?.description).toContain('直接执行、六步法、功能开发、Git 工作流、项目初始化')
  })

  it('normalizeZcfEnabledRoles persists exactly one active style id', () => {
    const enabled = normalizeZcfEnabledRoles(
      ['engineer-professional', 'weworker-clear'],
      [],
      ['default', 'weworker-clear', 'engineer-professional'],
      'weworker-clear',
    )
    expect(enabled).toEqual(['weworker-clear'])
  })

  it('buildZcfPromptAppendix injects custom style prompt', () => {
    const appendix = buildZcfPromptAppendix('custom-test', 'direct', [
      { id: 'custom-test', label: '测试风格', prompt: '请用简洁技术语气回复。' },
    ])
    expect(appendix).toContain('当前 AI 风格')
    expect(appendix).toContain('测试风格')
    expect(appendix).toContain('请用简洁技术语气回复。')
  })

  it('buildZcfCatalogResponse lists all styles in picker but one active default', () => {
    ensureBundledZcfInstalled('zh-CN')
    const catalog = buildZcfCatalogResponse({
      zcf_lang: 'zh-CN',
      zcf_default_role: 'weworker-clear',
      zcf_enabled_roles: ['weworker-clear'],
      zcf_custom_roles: [{ id: 'custom-poet', label: '诗人', prompt: '写诗' }],
    })
    expect(catalog.core_styles).toHaveLength(2)
    expect(catalog.extension_styles).toHaveLength(1)
    expect(catalog.roles).toHaveLength(4)
    expect(catalog.enabled_role_ids).toEqual(['weworker-clear'])
    expect(catalog.roles.find((r) => r.id === DEFAULT_STYLE_ID)?.description).toContain('原生模式')
  })

  it('sanitizeWorkZcfPrefsPatch normalizes legacy mode and invalid role', () => {
    ensureBundledZcfInstalled('zh-CN')
    const settings = {
      zcf_default_role: 'weworker-clear',
      zcf_default_mode: 'auto-plan',
      zcf_enabled_roles: ['weworker-clear'],
      zcf_custom_roles: [],
      zcf_lang: 'zh-CN' as const,
    }
    expect(sanitizeWorkZcfPrefsPatch({ zcf_mode: 'feat' }, settings)).toEqual({ zcf_mode: 'auto-plan' })
    expect(sanitizeWorkZcfPrefsPatch({ zcf_role: 'not-a-real-style' }, settings)).toEqual({
      zcf_role: 'weworker-clear',
    })
  })

  it('sanitizeZcfRoleSettingsPatch can save a newly added custom style as the active default', () => {
    ensureBundledZcfInstalled('zh-CN')
    const settings = {
      zcf_default_role: 'weworker-clear',
      zcf_default_mode: 'auto-plan',
      zcf_enabled_roles: ['weworker-clear'],
      zcf_custom_roles: [],
      zcf_lang: 'zh-CN' as const,
    }

    const patch = sanitizeZcfRoleSettingsPatch({
      zcf_default_role: 'custom-reviewer',
      zcf_enabled_roles: ['custom-reviewer'],
      zcf_custom_roles: [{ id: 'custom-reviewer', label: '评审员', prompt: '严格评审代码。' }],
    }, settings)

    expect(patch).toEqual({
      zcf_default_role: 'custom-reviewer',
      zcf_enabled_roles: ['custom-reviewer'],
      zcf_custom_roles: [{ id: 'custom-reviewer', label: '评审员', prompt: '严格评审代码。' }],
    })
  })

  it('buildSystemPrompt prepends ZCF rules before core WeWorker prompt', async () => {
    ensureBundledZcfInstalled('zh-CN')
    const { buildSystemPrompt } = await import('../agent.js')
    const prompt = buildSystemPrompt({ zcfRole: 'weworker-clear', zcfMode: 'auto-plan' })
    expect(prompt.indexOf('专业严谨简单明确')).toBeLessThan(prompt.indexOf('webcli'))
    expect(prompt).toContain('自动规划')
    expect(prompt).toContain('以 WeWorker 工具与安全规则为准')
  })
})
