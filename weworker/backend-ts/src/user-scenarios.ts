import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ParsedAdapter } from './adapter-parser.js'
import type { RegistryScenarioDef, RegistryScenarioPrompt } from './site-scenarios.js'
import { getOfficialScenarioDefs } from './site-scenarios.js'

const CONFIG_DIR = path.join(os.homedir(), '.weworker')
const DEFAULT_USER_SCENARIOS_FILE = path.join(CONFIG_DIR, 'scenarios.json')

type LegacyScenarioStore = {
  version: 1
  sites: Record<string, RegistryScenarioDef[]>
}

type ScenarioStore = {
  version: 2
  /** User-created scenarios and full user overrides of official scenarios. */
  sites: Record<string, RegistryScenarioDef[]>
}

type AnyScenarioStore = LegacyScenarioStore | ScenarioStore

export type ScenarioResetField = 'title' | 'summary' | 'steps' | 'prompts'

/**
 * Titles shipped by the previous application version. Version-1 stores copied
 * these official scenarios into the user file, so they are removed once when
 * upgrading to the override-only version-2 store.
 */
export const LEGACY_OFFICIAL_SCENARIO_TITLES: Record<string, readonly string[]> = {
  'jd.com': ['导航主页', '搜索商品', '查看购物车', '查看订单', '购买商品', '支付'],
  'mail.163.com': ['读取邮件列表', '搜索邮件', '查看邮件详情', '下载附件', '写邮件'],
  'mail.google.com': ['查收邮件', '搜索下载'],
  'mail.qq.com': ['读取邮件列表', '搜索邮件', '查看邮件详情', '下载附件', '自动下载发票'],
  'nnfp.jss.com.cn': ['下载发票 PDF', '邮件链接取票'],
  'xiaohongshu.com': ['搜索笔记', '发现流行'],
}

function userScenariosFile(): string {
  return process.env.WEWORKER_SCENARIOS_FILE || DEFAULT_USER_SCENARIOS_FILE
}

function scenarioKey(scenario: RegistryScenarioDef): string {
  return scenario.id || scenario.title
}

function cloneScenario(scenario: RegistryScenarioDef): RegistryScenarioDef {
  return {
    id: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    ...(Array.isArray(scenario.steps) ? { steps: [...scenario.steps] } : {}),
    ...(Array.isArray(scenario.tool_names) ? { tool_names: [...scenario.tool_names] } : {}),
    ...(Array.isArray(scenario.prompts) ? { prompts: scenario.prompts.map((prompt) => ({ ...prompt })) } : {}),
    ...(typeof scenario.updated_at === 'string' ? { updated_at: scenario.updated_at } : {}),
  }
}

function scenarioContent(scenario: RegistryScenarioDef): RegistryScenarioDef {
  const copy = cloneScenario(scenario)
  delete copy.updated_at
  return copy
}

function sameScenarioContent(left: RegistryScenarioDef, right: RegistryScenarioDef): boolean {
  return JSON.stringify(scenarioContent(left)) === JSON.stringify(scenarioContent(right))
}

function applyOfficialFields(
  current: RegistryScenarioDef,
  official: RegistryScenarioDef,
  fields: ScenarioResetField[],
): RegistryScenarioDef {
  const next = cloneScenario(current)
  const fieldSet = new Set(fields)

  if (fieldSet.has('title')) next.title = official.title
  if (fieldSet.has('summary')) next.summary = official.summary
  if (fieldSet.has('steps')) {
    if (Array.isArray(official.steps)) next.steps = [...official.steps]
    else delete next.steps
  }
  if (fieldSet.has('prompts')) {
    if (Array.isArray(official.prompts)) next.prompts = official.prompts.map((prompt) => ({ ...prompt }))
    else delete next.prompts
  }
  next.updated_at = new Date().toISOString()

  return next
}

function normalizePrompts(prompts: unknown): RegistryScenarioPrompt[] | undefined {
  if (!Array.isArray(prompts)) return undefined
  return prompts
    .map((prompt) => {
      if (!prompt || typeof prompt !== 'object') return null
      const text = typeof (prompt as { text?: unknown }).text === 'string'
        ? (prompt as { text: string }).text
        : ''
      const reply = typeof (prompt as { reply?: unknown }).reply === 'string'
        ? (prompt as { reply: string }).reply
        : ''
      if (!text.trim()) return null
      return {
        text,
        ...(reply.trim() ? { reply } : {}),
      }
    })
    .filter((prompt): prompt is RegistryScenarioPrompt => !!prompt)
}

function normalizeSites(sites: unknown): Record<string, RegistryScenarioDef[]> {
  if (!sites || typeof sites !== 'object') return {}
  return Object.fromEntries(
    Object.entries(sites)
      .filter(([, scenarios]) => Array.isArray(scenarios))
      .map(([siteId, scenarios]) => [siteId, (scenarios as RegistryScenarioDef[]).map(cloneScenario)]),
  )
}

function readStore(): AnyScenarioStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(userScenariosFile(), 'utf-8')) as Partial<AnyScenarioStore>
    if (parsed && typeof parsed === 'object') {
      return {
        version: parsed.version === 2 ? 2 : 1,
        sites: normalizeSites(parsed.sites),
      } as AnyScenarioStore
    }
  } catch {
    // Missing or malformed user file: start with an empty override store.
  }
  return { version: 2, sites: {} }
}

function writeStore(store: ScenarioStore): void {
  const filePath = userScenariosFile()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2))
}

export function migrateLegacyScenarioStore(store: LegacyScenarioStore): ScenarioStore {
  const sites: Record<string, RegistryScenarioDef[]> = {}

  for (const [siteId, scenarios] of Object.entries(store.sites)) {
    const legacyTitles = new Set(LEGACY_OFFICIAL_SCENARIO_TITLES[siteId] || [])
    const preserved = scenarios
      .filter((scenario) => !legacyTitles.has(scenario.title))
      .map(cloneScenario)
    if (preserved.length) sites[siteId] = preserved
  }

  return { version: 2, sites }
}

export function ensureUserScenarioStore(_adapters: Map<string, ParsedAdapter>): ScenarioStore {
  const store = readStore()
  if (store.version === 2) return store

  const migrated = migrateLegacyScenarioStore(store)
  writeStore(migrated)
  return migrated
}

export function mergeOfficialAndUserScenarios(
  official: RegistryScenarioDef[],
  userOverrides: RegistryScenarioDef[],
): RegistryScenarioDef[] {
  const overridesByKey = new Map(userOverrides.map((scenario) => [scenarioKey(scenario), scenario]))
  const officialKeys = new Set(official.map(scenarioKey))
  const merged = official.map((scenario) => cloneScenario(overridesByKey.get(scenarioKey(scenario)) || scenario))

  for (const scenario of userOverrides) {
    if (!officialKeys.has(scenarioKey(scenario))) merged.push(cloneScenario(scenario))
  }
  return merged
}

export function getUserScenariosForSite(
  adapters: Map<string, ParsedAdapter>,
  siteId: string,
): RegistryScenarioDef[] {
  const adapter = adapters.get(siteId)
  if (!adapter) return []
  const store = ensureUserScenarioStore(adapters)
  return mergeOfficialAndUserScenarios(
    getOfficialScenarioDefs(adapter),
    store.sites[siteId] || [],
  )
}

export function getCustomScenariosForSite(
  adapters: Map<string, ParsedAdapter>,
  siteId: string,
): RegistryScenarioDef[] {
  const adapter = adapters.get(siteId)
  if (!adapter) return []
  const officialKeys = new Set(getOfficialScenarioDefs(adapter).map(scenarioKey))
  return getUserScenariosForSite(adapters, siteId)
    .filter((scenario) => !officialKeys.has(scenarioKey(scenario)))
}

export function hasOfficialScenario(
  adapters: Map<string, ParsedAdapter>,
  siteId: string,
  scenarioId: string,
): boolean {
  const adapter = adapters.get(siteId)
  if (!adapter) return false
  return getOfficialScenarioDefs(adapter).some((scenario) => scenarioKey(scenario) === scenarioId)
}

export function createUserScenario(
  adapters: Map<string, ParsedAdapter>,
  siteId: string,
  scenarioId: string,
  patch: Partial<RegistryScenarioDef>,
): RegistryScenarioDef | null {
  if (!adapters.has(siteId) || !scenarioId) return null
  const store = ensureUserScenarioStore(adapters)
  const list = store.sites[siteId] || []
  const exists = list.some((scenario) => scenarioKey(scenario) === scenarioId)
  if (exists || hasOfficialScenario(adapters, siteId, scenarioId)) return null

  const prompts = normalizePrompts(patch.prompts)
  const title = typeof patch.title === 'string' && patch.title.trim()
    ? patch.title
    : '新建场景'
  const summary = typeof patch.summary === 'string'
    ? patch.summary
    : ''
  const next: RegistryScenarioDef = {
    id: scenarioId,
    title,
    summary,
    ...(Array.isArray(patch.steps) ? { steps: patch.steps.filter((step): step is string => typeof step === 'string') } : {}),
    ...(prompts ? { prompts } : { prompts: [{ text: '' }] }),
    updated_at: new Date().toISOString(),
  }

  store.sites[siteId] = [next, ...list]
  writeStore(store)
  return cloneScenario(next)
}

export function saveUserScenario(
  adapters: Map<string, ParsedAdapter>,
  siteId: string,
  scenarioId: string,
  patch: Partial<RegistryScenarioDef>,
): RegistryScenarioDef | null {
  const adapter = adapters.get(siteId)
  if (!adapter) return null
  const store = ensureUserScenarioStore(adapters)
  const list = store.sites[siteId] || []
  const current = mergeOfficialAndUserScenarios(getOfficialScenarioDefs(adapter), list)
    .find((scenario) => scenarioKey(scenario) === scenarioId)
  if (!current) return null

  const prompts = normalizePrompts(patch.prompts)
  const next: RegistryScenarioDef = {
    ...cloneScenario(current),
    title: typeof patch.title === 'string' ? patch.title : current.title,
    summary: typeof patch.summary === 'string' ? patch.summary : current.summary,
    ...(Array.isArray(patch.steps) ? { steps: patch.steps.filter((step): step is string => typeof step === 'string') } : {}),
    ...(prompts ? { prompts } : {}),
    updated_at: new Date().toISOString(),
  }

  const index = list.findIndex((scenario) => scenarioKey(scenario) === scenarioId)
  if (index >= 0) list[index] = next
  else list.push(next)
  store.sites[siteId] = list
  writeStore(store)
  return cloneScenario(next)
}

export function deleteUserScenario(
  adapters: Map<string, ParsedAdapter>,
  siteId: string,
  scenarioId: string,
): boolean {
  if (hasOfficialScenario(adapters, siteId, scenarioId)) return false
  const store = ensureUserScenarioStore(adapters)
  const list = store.sites[siteId]
  if (!list) return false

  const index = list.findIndex((scenario) => scenarioKey(scenario) === scenarioId)
  if (index < 0) return false

  list.splice(index, 1)
  store.sites[siteId] = list
  writeStore(store)
  return true
}

export function resetUserScenario(
  adapters: Map<string, ParsedAdapter>,
  siteId: string,
  scenarioId: string,
  fields?: ScenarioResetField[],
): RegistryScenarioDef | null {
  const adapter = adapters.get(siteId)
  if (!adapter) return null
  const official = getOfficialScenarioDefs(adapter).find((scenario) => scenarioKey(scenario) === scenarioId)
  if (!official) return null

  const store = ensureUserScenarioStore(adapters)
  const list = store.sites[siteId] || []
  const index = list.findIndex((scenario) => scenarioKey(scenario) === scenarioId)

  if (!fields?.length) {
    if (index >= 0) list.splice(index, 1)
    if (list.length) store.sites[siteId] = list
    else delete store.sites[siteId]
    writeStore(store)
    return cloneScenario(official)
  }

  const current = index >= 0 ? list[index] : official
  const restored = applyOfficialFields(current, official, fields)
  if (sameScenarioContent(restored, official)) {
    if (index >= 0) list.splice(index, 1)
  } else if (index >= 0) {
    list[index] = restored
  } else {
    list.push(restored)
  }

  if (list.length) store.sites[siteId] = list
  else delete store.sites[siteId]
  writeStore(store)
  return cloneScenario(restored)
}
