import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('site-memory')

const SITE_MEMORY_ENV = 'WEWORKER_SITE_MEMORY_FILE'
const SITE_MEMORY_SCHEMA_VERSION = 1

interface WorkflowActionEntry {
  url?: string
  method?: string
  requestBodyPreview?: string
  responsePreview?: string
  responseContentType?: string
}

interface ActionCaptureEntry extends WorkflowActionEntry {
  intercepted?: boolean
  blockedReason?: string
  aiIsPrimary?: boolean
  aiPurpose?: string
  aiWhy?: string
  userSelectedPrimary?: boolean
}

interface WorkflowAction {
  step?: string
  result?: Record<string, unknown>
  networkDelta?: {
    entries?: WorkflowActionEntry[]
  }
}

interface WorkflowResult {
  tabId?: number
  opened?: { url?: string }
  pageStateBefore?: { url?: string }
  resultPageState?: { url?: string; listCandidates?: number; paginationCandidates?: number }
  pageStateAfter?: { url?: string }
  verdict?: { pattern?: string; recommendedStrategy?: string; reason?: string }
  workflow?: { version?: string }
  actions?: WorkflowAction[]
  network?: { entries?: WorkflowActionEntry[] }
}

interface ActionCaptureResult {
  site?: string
  actionName?: string
  mode?: string
  workflow?: { version?: string }
  capturedActions?: ActionCaptureEntry[]
  recommendation?: { toolName?: string }
}

export interface SiteApiCandidate {
  url: string
  method: string
  requestBodyPreview?: string
  sourceSteps: string[]
}

export interface ActionResponseHints {
  topLevelKeys: string[]
  listPath: string
  itemKeys: string[]
  idLikeKeys: string[]
  displayLikeKeys: string[]
  availabilityLikeKeys: string[]
  preferredIdKey: string
  preferredDisplayKey: string
  preferredAvailabilityKey: string
}

export interface StoredActionCandidate {
  actionName: string
  mode: string
  toolName: string
  url: string
  method: string
  requestBodyPreview?: string
  responsePreview?: string
  responseContentType?: string
  responseHints?: ActionResponseHints
  intercepted: boolean
  blockedReason?: string
  aiIsPrimary?: boolean
  aiPurpose?: string
  aiWhy?: string
  primarySelection?: 'user' | 'ai' | 'heuristic' | ''
  capturedAt: string
  sourceWorkflowVersion: string
}

export interface ActionCandidateQuality {
  score: number
  signals: string[]
}

export interface ActionToolEvidenceSummary {
  toolName: string
  actionName: string
  historyCount: number
  selectedUrl: string
  selectedMethod: string
  selectedScore: number
  selectedSignals: string[]
  candidates: Array<{
    url: string
    method: string
    capturedAt: string
    score: number
    signals: string[]
    selected: boolean
  }>
}

export interface ActionEvidenceSummary {
  historyCount: number
  bestViewCount: number
  toolSummaries: ActionToolEvidenceSummary[]
}

export interface SiteMemoryRecord {
  siteKey: string
  siteHost: string
  siteOrigin: string
  updatedAt: string
  firstCapturedAt: string
  captureCount: number
  workflowVersion: string
  workflowVersionsSeen: string[]
  lastSourceUrl: string
  canonicalEntryUrl: string
  canonicalResultUrl: string
  verdictPattern: string
  recommendedStrategy: string
  verdictReason: string
  search: {
    executed: boolean
    action: string
    keywordSeed: string
  }
  resultSignals: {
    listCandidates: number
    paginationCandidates: number
  }
  listApiCandidates: SiteApiCandidate[]
  actionApiCandidates: StoredActionCandidate[]
  actionCaptureHistory?: StoredActionCandidate[]
  actionEvidenceSummary?: ActionEvidenceSummary
  detailHints: {
    mode: string
    bestCandidateHref: string
    bestCandidateText: string
    networkDetailCandidates: string[]
  }
  pagination: {
    attempted: boolean
    verified: boolean
    mode: string
    targetPage: number | null
    activePageBefore: number | null
    activePageAfter: number | null
    reason: string
  }
  rawSummary: {
    tabId: number | null
    resultPageUrl: string
    finalPageUrl: string
  }
}

interface SiteMemoryStore {
  version: number
  sites: Record<string, SiteMemoryRecord>
}

function defaultStore(): SiteMemoryStore {
  return {
    version: SITE_MEMORY_SCHEMA_VERSION,
    sites: {},
  }
}

function resolveSiteMemoryFile(): string {
  const override = (process.env[SITE_MEMORY_ENV] || '').trim()
  if (override) return override
  return path.join(os.homedir(), '.weworker', 'site-memory.json')
}

function resolveSiteMemoryDir(): string {
  return path.dirname(resolveSiteMemoryFile())
}

function readStore(): SiteMemoryStore {
  try {
    const raw = fs.readFileSync(resolveSiteMemoryFile(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SiteMemoryStore>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sites !== 'object' || parsed.sites === null) {
      return defaultStore()
    }
    return {
      version: SITE_MEMORY_SCHEMA_VERSION,
      sites: parsed.sites as Record<string, SiteMemoryRecord>,
    }
  } catch {
    return defaultStore()
  }
}

function writeStore(store: SiteMemoryStore): void {
  fs.mkdirSync(resolveSiteMemoryDir(), { recursive: true })
  fs.writeFileSync(resolveSiteMemoryFile(), JSON.stringify(store, null, 2), 'utf8')
}

function safeUrl(input: unknown): string {
  return typeof input === 'string' ? input.trim() : ''
}

function parseUrl(input: string): URL | null {
  if (!input) return null
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function toSiteIdentity(result: WorkflowResult): { siteKey: string; siteHost: string; siteOrigin: string; sourceUrl: string } | null {
  const candidates = [
    safeUrl(result.opened?.url),
    safeUrl(result.resultPageState?.url),
    safeUrl(result.pageStateAfter?.url),
    safeUrl(result.pageStateBefore?.url),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const parsed = parseUrl(candidate)
    if (!parsed) continue
    return {
      siteKey: parsed.hostname,
      siteHost: parsed.hostname,
      siteOrigin: parsed.origin,
      sourceUrl: candidate,
    }
  }

  return null
}

function isNoiseProbe(probe: string): boolean {
  return /globalsearch\.html|static\/tpls|systemmanage\/getsysvaluebykey|getmappinguser|getenv|menu\/getmenus|gettotalitems|horn_info|contact_users|append_keyword|is_new_transfer/.test(probe)
}

function isLikelyListApiEntry(entry: WorkflowActionEntry): boolean {
  const probe = `${entry.url || ''} ${entry.requestBodyPreview || ''}`.toLowerCase()
  if (!probe || isNoiseProbe(probe)) return false
  if (/getrequestdetail|getstatuslistbyrequestid|requestdetail|eventdetail|changedetail|problemdetail/.test(probe)) return false
  if (/getcilist|getcigroup/.test(probe)) return true
  return /(list|search|query|get[a-z0-9]*list|currentpage|pagesize|totalcount|keyword|history=|rows|records)/.test(probe)
}

function extractListApiCandidates(result: WorkflowResult): SiteApiCandidate[] {
  const rankedSteps = ['search', 'refine_search', 'pagination']
  const byKey = new Map<string, SiteApiCandidate>()
  const actions = Array.isArray(result.actions) ? result.actions : []

  for (const step of rankedSteps) {
    const action = actions.find((item) => item?.step === step)
    const entries = action?.networkDelta?.entries || []
    for (const entry of entries) {
      if (!isLikelyListApiEntry(entry)) continue
      const url = safeUrl(entry.url)
      if (!url) continue
      const method = safeUrl(entry.method) || 'GET'
      const key = `${method} ${url}`
      const existing = byKey.get(key)
      if (existing) {
        if (!existing.sourceSteps.includes(step)) existing.sourceSteps.push(step)
        continue
      }
      byKey.set(key, {
        url,
        method,
        requestBodyPreview: safeUrl(entry.requestBodyPreview),
        sourceSteps: [step],
      })
    }
  }

  if (byKey.size === 0) {
    for (const entry of result.network?.entries || []) {
      if (!isLikelyListApiEntry(entry)) continue
      const url = safeUrl(entry.url)
      if (!url) continue
      const method = safeUrl(entry.method) || 'GET'
      const key = `${method} ${url}`
      if (!byKey.has(key)) {
        byKey.set(key, {
          url,
          method,
          requestBodyPreview: safeUrl(entry.requestBodyPreview),
          sourceSteps: ['final_network'],
        })
      }
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const aCanonical = /getcilist|getcigroup/i.test(a.url) ? 1 : 0
    const bCanonical = /getcilist|getcigroup/i.test(b.url) ? 1 : 0
    if (aCanonical !== bCanonical) return bCanonical - aCanonical
    return a.url.localeCompare(b.url)
  }).slice(0, 8)
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function deriveSiteMemoryFromWorkflow(result: Record<string, unknown>): SiteMemoryRecord | null {
  const workflowResult = result as WorkflowResult
  const identity = toSiteIdentity(workflowResult)
  if (!identity) return null

  const actions = Array.isArray(workflowResult.actions) ? workflowResult.actions : []
  const searchAction = actions.find((item) => item?.step === 'search')
  const paginationAction = actions.find((item) => item?.step === 'pagination')
  const detailAction = actions.find((item) => item?.step === 'detail')
  const now = new Date().toISOString()

  return {
    siteKey: identity.siteKey,
    siteHost: identity.siteHost,
    siteOrigin: identity.siteOrigin,
    updatedAt: now,
    firstCapturedAt: now,
    captureCount: 1,
    workflowVersion: asString(workflowResult.workflow?.version),
    workflowVersionsSeen: asString(workflowResult.workflow?.version) ? [asString(workflowResult.workflow?.version)] : [],
    lastSourceUrl: identity.sourceUrl,
    canonicalEntryUrl: safeUrl(workflowResult.pageStateBefore?.url),
    canonicalResultUrl: safeUrl(workflowResult.resultPageState?.url) || safeUrl(workflowResult.pageStateAfter?.url),
    verdictPattern: asString(workflowResult.verdict?.pattern),
    recommendedStrategy: asString(workflowResult.verdict?.recommendedStrategy),
    verdictReason: asString(workflowResult.verdict?.reason),
    search: {
      executed: Boolean(searchAction?.result?.executed),
      action: asString(searchAction?.result?.action),
      keywordSeed: asString(searchAction?.result?.value),
    },
    resultSignals: {
      listCandidates: Number(workflowResult.resultPageState?.listCandidates || 0),
      paginationCandidates: Number(workflowResult.resultPageState?.paginationCandidates || 0),
    },
    listApiCandidates: extractListApiCandidates(workflowResult),
    actionApiCandidates: [],
    detailHints: {
      mode: asString(detailAction?.result?.mode),
      bestCandidateHref: asString((detailAction?.result as Record<string, unknown> | undefined)?.bestCandidate && (detailAction?.result as Record<string, unknown>).bestCandidate && ((detailAction?.result as Record<string, unknown>).bestCandidate as Record<string, unknown>).href),
      bestCandidateText: asString((detailAction?.result as Record<string, unknown> | undefined)?.bestCandidate && ((detailAction?.result as Record<string, unknown>).bestCandidate as Record<string, unknown>).text),
      networkDetailCandidates: Array.isArray((detailAction?.result as Record<string, unknown> | undefined)?.networkDetailCandidates)
        ? ((detailAction?.result as Record<string, unknown>).networkDetailCandidates as unknown[]).map(asString).filter(Boolean)
        : [],
    },
    pagination: {
      attempted: Boolean(paginationAction?.result?.executed),
      verified: Boolean(paginationAction?.result?.verified),
      mode: asString(paginationAction?.result?.mode),
      targetPage: asNumber(paginationAction?.result?.targetPage),
      activePageBefore: asNumber(paginationAction?.result?.activePageBefore),
      activePageAfter: asNumber(paginationAction?.result?.activePageAfter),
      reason: asString(paginationAction?.result?.reason),
    },
    rawSummary: {
      tabId: asNumber(workflowResult.tabId),
      resultPageUrl: safeUrl(workflowResult.resultPageState?.url),
      finalPageUrl: safeUrl(workflowResult.pageStateAfter?.url),
    },
  }
}

export function saveSiteMemoryFromWorkflow(result: Record<string, unknown>): SiteMemoryRecord | null {
  const derived = deriveSiteMemoryFromWorkflow(result)
  if (!derived) return null

  const store = readStore()
  const existing = store.sites[derived.siteKey]
  const workflowVersionsSeen = new Set<string>(existing?.workflowVersionsSeen || [])
  if (derived.workflowVersion) workflowVersionsSeen.add(derived.workflowVersion)

  const merged: SiteMemoryRecord = {
    ...derived,
    firstCapturedAt: existing?.firstCapturedAt || derived.firstCapturedAt,
    captureCount: Number(existing?.captureCount || 0) + 1,
    workflowVersionsSeen: [...workflowVersionsSeen],
    actionApiCandidates: existing?.actionApiCandidates || derived.actionApiCandidates || [],
    actionCaptureHistory: existing?.actionCaptureHistory || existing?.actionApiCandidates || derived.actionApiCandidates || [],
    actionEvidenceSummary: existing?.actionEvidenceSummary,
  }

  store.sites[derived.siteKey] = merged
  writeStore(store)
  log.info('site memory updated', { siteKey: merged.siteKey, workflowVersion: merged.workflowVersion })
  return merged
}

export function saveSiteMemoryFromActionCapture(result: Record<string, unknown>): SiteMemoryRecord | null {
  const capture = result as ActionCaptureResult
  const siteKey = normalizeSiteLookup(asString(capture.site))
  if (!siteKey) return null

  const store = readStore()
  const existing = store.sites[siteKey]
  const now = new Date().toISOString()
  const actionName = asString(capture.actionName) || 'captured_action'
  const mode = asString(capture.mode) || 'intercept'
  const workflowVersion = asString(capture.workflow?.version)
  const toolName = asString(capture.recommendation?.toolName) || `${siteKey}.${actionName}_draft`
  const capturedEntries = Array.isArray(capture.capturedActions) ? capture.capturedActions : []
  const candidate = selectBestActionCaptureEntry(capturedEntries, actionName)
  if (!candidate) return existing || null

  const nextActionCandidate: StoredActionCandidate = {
    actionName,
    mode,
    toolName,
    url: safeUrl(candidate.url),
    method: asString(candidate.method) || 'GET',
    requestBodyPreview: safeUrl(candidate.requestBodyPreview),
    responsePreview: safeUrl(candidate.responsePreview),
    responseContentType: asString(candidate.responseContentType),
    responseHints: extractActionResponseHints(candidate.responsePreview),
    intercepted: Boolean(candidate.intercepted),
    blockedReason: asString(candidate.blockedReason),
    aiIsPrimary: Boolean(candidate.aiIsPrimary),
    aiPurpose: asString(candidate.aiPurpose),
    aiWhy: asString(candidate.aiWhy),
    primarySelection: candidate.userSelectedPrimary ? 'user' : (candidate.aiIsPrimary ? 'ai' : 'heuristic'),
    capturedAt: now,
    sourceWorkflowVersion: workflowVersion,
  }

  const base: SiteMemoryRecord = existing || {
    siteKey,
    siteHost: siteKey,
    siteOrigin: '',
    updatedAt: now,
    firstCapturedAt: now,
    captureCount: 0,
    workflowVersion,
    workflowVersionsSeen: workflowVersion ? [workflowVersion] : [],
    lastSourceUrl: '',
    canonicalEntryUrl: '',
    canonicalResultUrl: '',
    verdictPattern: '',
    recommendedStrategy: '',
    verdictReason: '',
    search: {
      executed: false,
      action: '',
      keywordSeed: '',
    },
    resultSignals: {
      listCandidates: 0,
      paginationCandidates: 0,
    },
    listApiCandidates: [],
    actionApiCandidates: [],
    detailHints: {
      mode: '',
      bestCandidateHref: '',
      bestCandidateText: '',
      networkDetailCandidates: [],
    },
    pagination: {
      attempted: false,
      verified: false,
      mode: '',
      targetPage: null,
      activePageBefore: null,
      activePageAfter: null,
      reason: '',
    },
    rawSummary: {
      tabId: null,
      resultPageUrl: '',
      finalPageUrl: '',
    },
  }

  const existingHistory = Array.isArray(base.actionCaptureHistory) && base.actionCaptureHistory.length > 0
    ? base.actionCaptureHistory
    : (Array.isArray(base.actionApiCandidates) ? base.actionApiCandidates : [])
  const mergedExact = existingHistory.find((item) => isSameStoredActionCandidate(item, nextActionCandidate))
  const canonicalNextCandidate = mergedExact ? mergeStoredActionCandidate(mergedExact, nextActionCandidate) : nextActionCandidate
  const dedupedHistory = existingHistory.filter((item) => !isSameStoredActionCandidate(item, nextActionCandidate))
  const nextHistory = sortActionCaptureHistory([canonicalNextCandidate, ...dedupedHistory]).slice(0, 60)
  const workflowVersionsSeen = new Set<string>(base.workflowVersionsSeen || [])
  if (workflowVersion) workflowVersionsSeen.add(workflowVersion)

  const merged: SiteMemoryRecord = {
    ...base,
    updatedAt: now,
    captureCount: Number(base.captureCount || 0) + 1,
    workflowVersion: workflowVersion || base.workflowVersion,
    workflowVersionsSeen: [...workflowVersionsSeen],
    actionCaptureHistory: nextHistory,
    actionApiCandidates: deriveBestActionCandidates(nextHistory, base.actionApiCandidates),
  }
  merged.actionEvidenceSummary = buildActionEvidenceSummary(merged.actionCaptureHistory || [], merged.actionApiCandidates)

  store.sites[siteKey] = merged
  writeStore(store)
  log.info('site memory action capture updated', { siteKey, actionName, workflowVersion })
  return merged
}

export function listSiteMemories(): SiteMemoryRecord[] {
  const store = readStore()
  let changed = false
  const records = Object.values(store.sites).map((record) => {
    const enriched = enrichSiteMemoryRecord(record)
    if (enriched !== record) changed = true
    return enriched
  })
  if (changed) {
    store.sites = Object.fromEntries(records.map((record) => [record.siteKey, record]))
    writeStore(store)
  }
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getSiteMemory(siteOrUrl: string): SiteMemoryRecord | null {
  const key = normalizeSiteLookup(siteOrUrl)
  if (!key) return null
  const store = readStore()
  const record = store.sites[key]
  if (!record) return null

  const enriched = enrichSiteMemoryRecord(record)
  if (enriched !== record) {
    store.sites[key] = enriched
    writeStore(store)
  }
  return enriched
}

function normalizeSiteLookup(siteOrUrl: string): string {
  const trimmed = siteOrUrl.trim()
  if (!trimmed) return ''
  const parsed = parseUrl(trimmed)
  if (parsed) return parsed.hostname
  return trimmed
}

function selectBestActionCaptureEntry(entries: ActionCaptureEntry[], actionName: string): ActionCaptureEntry | null {
  const usable = entries.filter((entry) => safeUrl(entry.url))
  if (usable.length === 0) return null

  const userSelected = usable.find((entry) => Boolean(entry.userSelectedPrimary))
  if (userSelected) return userSelected
  const aiPrimary = usable.filter((entry) => Boolean(entry.aiIsPrimary))
  if (aiPrimary.length === 1) return aiPrimary[0]

  const tokens = normalizeActionTokens(actionName)
  return [...usable]
    .sort((left, right) => scoreActionCaptureEntry(right, tokens) - scoreActionCaptureEntry(left, tokens))[0] || null
}

function scoreActionCaptureEntry(entry: ActionCaptureEntry, tokens: string[]): number {
  const url = safeUrl(entry.url).toLowerCase()
  const method = asString(entry.method).toUpperCase() || 'GET'
  const requestBody = safeUrl(entry.requestBodyPreview).toLowerCase()
  const responsePreview = safeUrl(entry.responsePreview).toLowerCase()

  let score = 0
  if (entry.userSelectedPrimary) score += 100
  if (entry.aiIsPrimary) score += 30
  if (Boolean(entry.intercepted)) score += 6
  if (method !== 'GET') score += 4
  if (requestBody) score += 3
  if (responsePreview) score += 2
  if (hasQueryParams(url)) score += 2
  if (url.includes('/api/') || url.includes('/meeting/') || url.includes('/list') || url.includes('/query') || url.includes('/search') || url.includes('/get')) score += 2
  if (url.endsWith('/') || /https?:\/\/[^/]+\/?$/.test(url)) score -= 5
  if (/staff|orgstaff|avatar|static|favicon|login|logout/.test(url)) score -= 3
  if (hasWriteActionIntent(tokens) && isReadLikeActionUrl(url)) score -= 12
  if (/approve|agree|reject|audit|submit|commit|complete|deal|process|handle/.test(url)) score += 10

  for (const token of tokens) {
    if (token.length < 2) continue
    if (url.includes(token)) score += 3
    if (requestBody.includes(token)) score += 1
    if (responsePreview.includes(token)) score += 1
  }

  return score
}

function normalizeActionTokens(actionName: string): string[] {
  const raw = actionName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

  const expanded = new Set<string>()
  for (const token of raw) {
    expanded.add(token)
    if (token.endsWith('s') && token.length > 3) expanded.add(token.slice(0, -1))
  }
  const semanticAliases: Array<[RegExp, string[]]> = [
    [/批阅|审批|审核|同意|通过/, ['approve', 'agree', 'audit', 'myapprove']],
    [/驳回|拒绝|退回/, ['reject', 'return']],
    [/提交|确认/, ['submit', 'commit', 'confirm']],
    [/保存/, ['save']],
    [/取消|撤销/, ['cancel', 'revoke']],
    [/转交|转发/, ['transfer', 'forward']],
    [/完成|办结/, ['complete', 'finish']],
  ]
  for (const [pattern, aliases] of semanticAliases) {
    if (!pattern.test(actionName)) continue
    for (const alias of aliases) expanded.add(alias)
  }
  return [...expanded]
}

function hasWriteActionIntent(tokens: string[]): boolean {
  return tokens.some((token) => /approve|agree|audit|reject|return|submit|commit|confirm|save|cancel|revoke|transfer|forward|complete|finish|create|update|delete|book|reserve/.test(token))
}

function isReadLikeActionUrl(input: string | undefined): boolean {
  const url = safeUrl(input).toLowerCase()
  return /(?:^|[\/_-])(info|detail|summary|list|query|search|get|history|count)(?:[\/_?&=-]|$)/.test(url)
}

function hasQueryParams(input: string): boolean {
  try {
    const parsed = new URL(input)
    return [...parsed.searchParams.keys()].length > 0
  } catch {
    return false
  }
}

function enrichSiteMemoryRecord(record: SiteMemoryRecord): SiteMemoryRecord {
  const legacyCandidates = Array.isArray(record.actionApiCandidates) ? record.actionApiCandidates : []
  const history = Array.isArray(record.actionCaptureHistory) && record.actionCaptureHistory.length > 0
    ? record.actionCaptureHistory
    : legacyCandidates
  let changed = false
  const firstPassHistory = history.map((candidate) => {
    const responseHints = enrichActionResponseHints(candidate.responseHints, candidate.responsePreview)
    if (responseHints === candidate.responseHints) return candidate
    changed = true
    return {
      ...candidate,
      responseHints,
    }
  })
  const bestHintsByToolName = new Map<string, StoredActionCandidate['responseHints']>()
  for (const candidate of firstPassHistory) {
    if (!candidate.toolName) continue
    bestHintsByToolName.set(
      candidate.toolName,
      mergeActionResponseHints(bestHintsByToolName.get(candidate.toolName), candidate.responseHints),
    )
  }
  const enrichedHistory = firstPassHistory.map((candidate) => {
    const merged = candidate.toolName ? mergeActionResponseHints(candidate.responseHints, bestHintsByToolName.get(candidate.toolName)) : candidate.responseHints
    if (merged === candidate.responseHints) return candidate
    changed = true
    return {
      ...candidate,
      responseHints: merged,
    }
  })
  const sortedHistory = sortActionCaptureHistory(enrichedHistory)
  if (sortedHistory.some((candidate, index) => candidate !== enrichedHistory[index])) {
    changed = true
  }
  const derivedCandidates = deriveBestActionCandidates(sortedHistory, legacyCandidates)
  const actionEvidenceSummary = buildActionEvidenceSummary(sortedHistory, derivedCandidates)
  if (
    !Array.isArray(record.actionCaptureHistory)
    || record.actionCaptureHistory.length !== sortedHistory.length
    || sortedHistory.some((candidate, index) => candidate !== record.actionCaptureHistory?.[index])
  ) {
    changed = true
  }
  if (
    derivedCandidates.length !== legacyCandidates.length
    || derivedCandidates.some((candidate, index) => candidate !== legacyCandidates[index])
  ) {
    changed = true
  }
  if (JSON.stringify(record.actionEvidenceSummary || null) !== JSON.stringify(actionEvidenceSummary)) {
    changed = true
  }

  if (!changed) return record
  return {
    ...record,
    actionApiCandidates: derivedCandidates,
    actionCaptureHistory: sortedHistory,
    actionEvidenceSummary,
  }
}

function isSameStoredActionCandidate(
  left: SiteMemoryRecord['actionApiCandidates'][number],
  right: SiteMemoryRecord['actionApiCandidates'][number],
): boolean {
  return left.actionName === right.actionName
    && left.url === right.url
    && left.method === right.method
}

function sortStoredActionCandidates(
  candidates: SiteMemoryRecord['actionApiCandidates'],
): SiteMemoryRecord['actionApiCandidates'] {
  return [...candidates].sort((left, right) => {
    const leftScore = scoreStoredActionCandidate(left)
    const rightScore = scoreStoredActionCandidate(right)
    if (leftScore !== rightScore) return rightScore - leftScore
    return compareIsoTimestamps(right.capturedAt, left.capturedAt)
  })
}

function sortActionCaptureHistory(candidates: StoredActionCandidate[]): StoredActionCandidate[] {
  return [...candidates].sort((left, right) => compareIsoTimestamps(right.capturedAt, left.capturedAt))
}

function deriveBestActionCandidates(
  history: StoredActionCandidate[],
  legacyBestView: StoredActionCandidate[] = [],
): StoredActionCandidate[] {
  const seeded = [...history]
  for (const candidate of legacyBestView) {
    if (!seeded.some((item) => isSameStoredActionCandidate(item, candidate))) {
      seeded.push(candidate)
    }
  }

  const bestByToolName = new Map<string, StoredActionCandidate>()
  for (const candidate of sortStoredActionCandidates(seeded)) {
    const key = candidate.toolName || `${candidate.actionName} ${(candidate.method || '').toUpperCase()}`
    const current = bestByToolName.get(key)
    if (!current) {
      bestByToolName.set(key, candidate)
      continue
    }
    bestByToolName.set(key, mergeStoredActionCandidate(current, candidate))
  }

  return sortStoredActionCandidates([...bestByToolName.values()]).slice(0, 20)
}

function scoreStoredActionCandidate(candidate: SiteMemoryRecord['actionApiCandidates'][number]): number {
  return describeStoredActionCandidateQuality(candidate).score
}

function describeStoredActionCandidateQuality(candidate: StoredActionCandidate): ActionCandidateQuality {
  let score = 0
  const signals: string[] = []

  if (candidate.primarySelection === 'user') {
    score += 100
    signals.push('user_selected_primary')
  } else if (candidate.primarySelection === 'ai' || candidate.aiIsPrimary) {
    score += 30
    signals.push('ai_selected_primary')
  }
  if (candidate.intercepted) {
    score += 6
    signals.push('intercepted')
  }
  if ((candidate.method || '').toUpperCase() !== 'GET') {
    score += 4
    signals.push('write_method')
  }
  if ((candidate.blockedReason || '') === 'side-effect-safe-capture') {
    score += 2
    signals.push('side_effect_safe_capture')
  }
  if (safeUrl(candidate.requestBodyPreview)) {
    score += 1
    signals.push('has_request_body')
  }
  if (safeUrl(candidate.responsePreview)) {
    score += 1
    signals.push('has_response_preview')
  }
  if ((candidate.responseContentType || '').toLowerCase().includes('json')) {
    score += 1
    signals.push('json_response')
  }
  if (hasQueryParams(candidate.url)) {
    score += 2
    signals.push('has_query_params')
  }

  const requestFieldCount = countPreviewFields(candidate.requestBodyPreview)
  if (requestFieldCount > 0) {
    const contribution = Math.min(requestFieldCount, 8)
    score += contribution
    signals.push(`request_fields:${requestFieldCount}`)
  }

  const hintScore = responseHintScore(candidate.responseHints)
  if (hintScore > 0) {
    score += hintScore
    signals.push(`response_hints:${hintScore}`)
  }

  if (/staff|orgstaff|avatar|static|favicon|login|logout/i.test(candidate.url)) {
    score -= 4
    signals.push('noise_penalty')
  }
  if (candidate.url.endsWith('/') || /https?:\/\/[^/]+\/?$/i.test(candidate.url)) {
    score -= 5
    signals.push('root_url_penalty')
  }

  return {
    score,
    signals,
  }
}

function responseHintScore(hints: SiteMemoryRecord['actionApiCandidates'][number]['responseHints']): number {
  if (!hints) return 0
  let score = 0
  if (hints.listPath) score += 2
  if (hints.itemKeys.length > 0) score += Math.min(hints.itemKeys.length, 6)
  if (hints.idLikeKeys.length > 0) score += 1
  if (hints.displayLikeKeys.length > 0) score += 1
  if (hints.availabilityLikeKeys.length > 0) score += 2
  if (hints.preferredIdKey) score += 1
  if (hints.preferredDisplayKey) score += 1
  if (hints.preferredAvailabilityKey) score += 2
  return score
}

function countPreviewFields(preview: unknown): number {
  const normalized = safeUrl(preview)
  if (!normalized) return 0
  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.keys(parsed as Record<string, unknown>).length
      }
    } catch {
      return 0
    }
  }
  return [...new Set([...normalized.matchAll(/([A-Za-z0-9_]+)=/g)].map((match) => match[1]).filter(Boolean))].length
}

function compareIsoTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime
  return left.localeCompare(right)
}

function mergeStoredActionCandidate(
  primary: SiteMemoryRecord['actionApiCandidates'][number],
  secondary: SiteMemoryRecord['actionApiCandidates'][number],
): SiteMemoryRecord['actionApiCandidates'][number] {
  const primaryEnriched = {
    ...primary,
    responseHints: enrichActionResponseHints(primary.responseHints, primary.responsePreview),
  }
  const secondaryEnriched = {
    ...secondary,
    responseHints: enrichActionResponseHints(secondary.responseHints, secondary.responsePreview),
  }
  const primaryScore = scoreStoredActionCandidate(primaryEnriched)
  const secondaryScore = scoreStoredActionCandidate(secondaryEnriched)
  const winner = secondaryScore > primaryScore ? secondaryEnriched : primaryEnriched
  const loser = winner === secondaryEnriched ? primaryEnriched : secondaryEnriched
  const preserveExplicitSelection = ['user', 'ai'].includes(winner.primarySelection || '') && winner.url !== loser.url

  return {
    ...winner,
    mode: winner.mode || loser.mode,
    toolName: winner.toolName || loser.toolName,
    requestBodyPreview: preserveExplicitSelection ? winner.requestBodyPreview : pickRicherPreview(winner.requestBodyPreview, loser.requestBodyPreview),
    responsePreview: preserveExplicitSelection ? winner.responsePreview : pickRicherPreview(winner.responsePreview, loser.responsePreview),
    responseContentType: winner.responseContentType || loser.responseContentType,
    responseHints: preserveExplicitSelection ? winner.responseHints : mergeActionResponseHints(winner.responseHints, loser.responseHints),
    intercepted: winner.intercepted || loser.intercepted,
    blockedReason: winner.blockedReason || loser.blockedReason,
    aiIsPrimary: winner.aiIsPrimary || loser.aiIsPrimary,
    aiPurpose: winner.aiPurpose || loser.aiPurpose,
    aiWhy: winner.aiWhy || loser.aiWhy,
    primarySelection: winner.primarySelection || loser.primarySelection,
    capturedAt: compareIsoTimestamps(winner.capturedAt, loser.capturedAt) >= 0 ? winner.capturedAt : loser.capturedAt,
    sourceWorkflowVersion: winner.sourceWorkflowVersion || loser.sourceWorkflowVersion,
  }
}

function buildActionEvidenceSummary(
  history: StoredActionCandidate[],
  bestView: StoredActionCandidate[],
): ActionEvidenceSummary {
  const selectedByToolName = new Map<string, StoredActionCandidate>()
  for (const candidate of bestView) {
    const key = actionToolKey(candidate)
    if (!selectedByToolName.has(key)) selectedByToolName.set(key, candidate)
  }

  const grouped = new Map<string, StoredActionCandidate[]>()
  for (const candidate of history) {
    const key = actionToolKey(candidate)
    grouped.set(key, [...(grouped.get(key) || []), candidate])
  }

  const toolSummaries = [...grouped.entries()].map(([toolName, candidates]) => {
    const selected = selectedByToolName.get(toolName) || sortStoredActionCandidates(candidates)[0]
    const selectedQuality = describeStoredActionCandidateQuality(selected)
    return {
      toolName,
      actionName: selected.actionName,
      historyCount: candidates.length,
      selectedUrl: selected.url,
      selectedMethod: selected.method,
      selectedScore: selectedQuality.score,
      selectedSignals: selectedQuality.signals,
      candidates: sortStoredActionCandidates(candidates).map((candidate) => {
        const quality = describeStoredActionCandidateQuality(candidate)
        return {
          url: candidate.url,
          method: candidate.method,
          capturedAt: candidate.capturedAt,
          score: quality.score,
          signals: quality.signals,
          selected: isSameStoredActionCandidate(candidate, selected),
        }
      }),
    }
  }).sort((left, right) => right.selectedScore - left.selectedScore)

  return {
    historyCount: history.length,
    bestViewCount: bestView.length,
    toolSummaries,
  }
}

function actionToolKey(candidate: StoredActionCandidate): string {
  return candidate.toolName || `${candidate.actionName} ${(candidate.method || '').toUpperCase()}`
}

function pickRicherPreview(primary: string | undefined, secondary: string | undefined): string | undefined {
  const left = safeUrl(primary)
  const right = safeUrl(secondary)
  if (!left) return right || undefined
  if (!right) return left
  const leftScore = left.length + countPreviewFields(left) * 20
  const rightScore = right.length + countPreviewFields(right) * 20
  return leftScore >= rightScore ? left : right
}

function mergeActionResponseHints(
  primary: SiteMemoryRecord['actionApiCandidates'][number]['responseHints'],
  secondary: SiteMemoryRecord['actionApiCandidates'][number]['responseHints'],
): SiteMemoryRecord['actionApiCandidates'][number]['responseHints'] {
  if (!primary) return secondary
  if (!secondary) return primary

  const idLikeKeys = nonEmptyArray(primary.idLikeKeys) ? primary.idLikeKeys : secondary.idLikeKeys
  const displayLikeKeys = nonEmptyArray(primary.displayLikeKeys) ? primary.displayLikeKeys : secondary.displayLikeKeys
  const availabilityLikeKeys = nonEmptyArray(primary.availabilityLikeKeys) ? primary.availabilityLikeKeys : secondary.availabilityLikeKeys
  const merged = {
    topLevelKeys: nonEmptyArray(primary.topLevelKeys) ? primary.topLevelKeys : secondary.topLevelKeys,
    listPath: primary.listPath || secondary.listPath,
    itemKeys: nonEmptyArray(primary.itemKeys) ? primary.itemKeys : secondary.itemKeys,
    idLikeKeys,
    displayLikeKeys,
    availabilityLikeKeys,
    preferredIdKey: primary.preferredIdKey || secondary.preferredIdKey || pickPreferredIdKey(idLikeKeys),
    preferredDisplayKey: primary.preferredDisplayKey || secondary.preferredDisplayKey || pickPreferredDisplayKey(displayLikeKeys),
    preferredAvailabilityKey: primary.preferredAvailabilityKey || secondary.preferredAvailabilityKey || pickPreferredAvailabilityKey(availabilityLikeKeys),
  }

  if (JSON.stringify(primary) === JSON.stringify(merged)) return primary
  return merged
}

function enrichActionResponseHints(
  hints: SiteMemoryRecord['actionApiCandidates'][number]['responseHints'],
  responsePreview: unknown,
): SiteMemoryRecord['actionApiCandidates'][number]['responseHints'] {
  const fallback = extractActionResponseHints(responsePreview)
  if (!hints) return fallback

  const idLikeKeys = nonEmptyArray(hints.idLikeKeys) ? hints.idLikeKeys : (fallback?.idLikeKeys || [])
  const displayLikeKeys = nonEmptyArray(hints.displayLikeKeys) ? hints.displayLikeKeys : (fallback?.displayLikeKeys || [])
  const availabilityLikeKeys = nonEmptyArray(hints.availabilityLikeKeys)
    ? hints.availabilityLikeKeys
    : (fallback?.availabilityLikeKeys || [])
  const preferredIdKey = hints.preferredIdKey || fallback?.preferredIdKey || pickPreferredIdKey(idLikeKeys)
  const preferredDisplayKey = hints.preferredDisplayKey || fallback?.preferredDisplayKey || pickPreferredDisplayKey(displayLikeKeys)
  const preferredAvailabilityKey = hints.preferredAvailabilityKey
    || fallback?.preferredAvailabilityKey
    || pickPreferredAvailabilityKey(availabilityLikeKeys)

  if (
    hints.preferredIdKey === preferredIdKey
    && hints.preferredDisplayKey === preferredDisplayKey
    && hints.preferredAvailabilityKey === preferredAvailabilityKey
    && hints.listPath
  ) {
    return hints
  }

  return {
    topLevelKeys: hints.topLevelKeys?.length ? hints.topLevelKeys : (fallback?.topLevelKeys || []),
    listPath: hints.listPath || fallback?.listPath || '',
    itemKeys: hints.itemKeys?.length ? hints.itemKeys : (fallback?.itemKeys || []),
    idLikeKeys,
    displayLikeKeys,
    availabilityLikeKeys,
    preferredIdKey,
    preferredDisplayKey,
    preferredAvailabilityKey,
  }
}

function nonEmptyArray<T>(value: T[] | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0
}

function extractActionResponseHints(responsePreview: unknown): {
  topLevelKeys: string[]
  listPath: string
  itemKeys: string[]
  idLikeKeys: string[]
  displayLikeKeys: string[]
  availabilityLikeKeys: string[]
  preferredIdKey: string
  preferredDisplayKey: string
  preferredAvailabilityKey: string
} | undefined {
  const text = safeUrl(responsePreview)
  if (!text) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const sanitized = sanitizePreviewForJsonParse(text)
    if (!sanitized) return extractActionResponseHintsByPattern(text)
    try {
      parsed = JSON.parse(sanitized)
    } catch {
      return extractActionResponseHintsByPattern(text)
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined

  const topLevelKeys = Object.keys(parsed as Record<string, unknown>)
  const listHit = findFirstObjectList(parsed, '')
  const itemKeys = listHit?.item && typeof listHit.item === 'object' && !Array.isArray(listHit.item)
    ? Object.keys(listHit.item as Record<string, unknown>)
    : []
  const patternFallback = (!listHit || itemKeys.length === 0) ? extractActionResponseHintsByPattern(text) : undefined

  const idLikeKeys = itemKeys.filter((key) => /(^id$|id$|code$|key$|uuid$)/i.test(key))
  const displayLikeKeys = itemKeys.filter((key) => /(name|title|label|code|display|desc|room)/i.test(key))
  const availabilityLikeKeys = itemKeys.filter((key) => /(availability|schedule|calendar|slot|time|map)/i.test(key))
  const mergedIdLikeKeys = idLikeKeys.length > 0 ? idLikeKeys : (patternFallback?.idLikeKeys || [])
  const mergedDisplayLikeKeys = displayLikeKeys.length > 0 ? displayLikeKeys : (patternFallback?.displayLikeKeys || [])
  const mergedAvailabilityLikeKeys = availabilityLikeKeys.length > 0
    ? availabilityLikeKeys
    : (patternFallback?.availabilityLikeKeys || [])

  return {
    topLevelKeys: topLevelKeys.length > 0 ? topLevelKeys : (patternFallback?.topLevelKeys || []),
    listPath: listHit?.path || patternFallback?.listPath || '',
    itemKeys: itemKeys.length > 0 ? itemKeys : (patternFallback?.itemKeys || []),
    idLikeKeys: mergedIdLikeKeys,
    displayLikeKeys: mergedDisplayLikeKeys,
    availabilityLikeKeys: mergedAvailabilityLikeKeys,
    preferredIdKey: pickPreferredIdKey(mergedIdLikeKeys),
    preferredDisplayKey: pickPreferredDisplayKey(mergedDisplayLikeKeys),
    preferredAvailabilityKey: pickPreferredAvailabilityKey(mergedAvailabilityLikeKeys),
  }
}

function sanitizePreviewForJsonParse(text: string): string {
  const normalized = text.trim()
  if (!normalized) return ''
  return normalized
    .replace(/\[\s*\.\.\.\s*\]/g, '[]')
    .replace(/\{\s*\.\.\.\s*\}/g, '{}')
    .replace(/:\s*\.\.\.(?=[,\]}])/g, ': null')
}

function extractActionResponseHintsByPattern(text: string): {
  topLevelKeys: string[]
  listPath: string
  itemKeys: string[]
  idLikeKeys: string[]
  displayLikeKeys: string[]
  availabilityLikeKeys: string[]
  preferredIdKey: string
  preferredDisplayKey: string
  preferredAvailabilityKey: string
} | undefined {
  const normalized = text.trim()
  if (!normalized) return undefined

  const topLevelKeys = collectObjectKeys(normalized)
  const listPath = inferListPathFromPreview(normalized)
  const itemKeys = collectLikelyItemKeys(normalized)
  if (topLevelKeys.length === 0 && !listPath && itemKeys.length === 0) return undefined

  const idLikeKeys = itemKeys.filter((key) => /(^id$|id$|code$|key$|uuid$)/i.test(key))
  const displayLikeKeys = itemKeys.filter((key) => /(name|title|label|code|display|desc|room)/i.test(key))
  const availabilityLikeKeys = itemKeys.filter((key) => /(availability|schedule|calendar|slot|time|map)/i.test(key))

  return {
    topLevelKeys,
    listPath,
    itemKeys,
    idLikeKeys,
    displayLikeKeys,
    availabilityLikeKeys,
    preferredIdKey: pickPreferredIdKey(idLikeKeys),
    preferredDisplayKey: pickPreferredDisplayKey(displayLikeKeys),
    preferredAvailabilityKey: pickPreferredAvailabilityKey(availabilityLikeKeys),
  }
}

function collectObjectKeys(text: string): string[] {
  const matches = [...text.matchAll(/"([A-Za-z0-9_]+)"\s*:/g)].map((match) => match[1]).filter(Boolean)
  return [...new Set(matches)].slice(0, 30)
}

function inferListPathFromPreview(text: string): string {
  if (/"data"\s*:\s*\{[\s\S]*?"list"\s*:/i.test(text)) return 'data.list'
  if (/"data"\s*:\s*\{[\s\S]*?"rows"\s*:/i.test(text)) return 'data.rows'
  if (/"list"\s*:/i.test(text)) return 'list'
  if (/"rows"\s*:/i.test(text)) return 'rows'
  if (/"records"\s*:/i.test(text)) return 'records'
  if (/"items"\s*:/i.test(text)) return 'items'
  return ''
}

function collectLikelyItemKeys(text: string): string[] {
  const preferred = ['id', 'roomId', 'roomcode', 'roomCode', 'name', 'title', 'meetingType', 'equipment', 'capacity', 'meetingInfoMaps']
  const found = preferred.filter((key) => new RegExp(`"${key}"\\s*:`, 'i').test(text))
  return [...new Set(found)]
}

function pickPreferredIdKey(keys: string[]): string {
  const ordered = ['id', 'roomId', 'roomcode', 'roomCode', 'code']
  return ordered.find((key) => keys.includes(key)) || keys[0] || ''
}

function pickPreferredDisplayKey(keys: string[]): string {
  const ordered = ['roomcode', 'roomCode', 'name', 'title', 'label', 'code']
  return ordered.find((key) => keys.includes(key)) || keys[0] || ''
}

function pickPreferredAvailabilityKey(keys: string[]): string {
  const ordered = ['meetingInfoMaps', 'availability', 'schedule', 'calendar', 'slotMap']
  return ordered.find((key) => keys.includes(key)) || keys[0] || ''
}

function findFirstObjectList(value: unknown, path: string): { path: string; item: unknown } | null {
  if (Array.isArray(value)) {
    const firstObject = value.find((item) => item && typeof item === 'object' && !Array.isArray(item))
    if (firstObject) {
      return {
        path,
        item: firstObject,
      }
    }
    return null
  }

  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const preferredKeys = ['list', 'rows', 'records', 'items', 'data']
  for (const key of preferredKeys) {
    if (!(key in record)) continue
    const hit = findFirstObjectList(record[key], path ? `${path}.${key}` : key)
    if (hit) return hit
  }

  for (const [key, nested] of Object.entries(record)) {
    if (preferredKeys.includes(key)) continue
    const hit = findFirstObjectList(nested, path ? `${path}.${key}` : key)
    if (hit) return hit
  }

  return null
}
