/**
 * Candidate-first memory admission.
 * Contract: prefer miss over wrong memory; never use NL fuzzy match to admit/deny.
 * Evidence tiers: provisional (declarative) | ledger (tool_use webcli extract) | verified (Bridge — not this phase).
 */
import type { MemoryAdapterIdentity, MemoryToolCall } from './memory-event-context.js'
import {
  isDeclarativeSiteOperation,
  parseExecutionRefs,
  type ExecutionRecordView,
} from './execution-refs.js'
import type { MemoryScope, MemoryUpdateCandidate } from './memory-types.js'

export type MemoryVerification = 'provisional' | 'ledger' | 'verified'

export type MemoryAdmitReason =
  | 'admitted'
  | 'no_candidate'
  | 'ignore'
  | 'missing_site'
  | 'unknown_site'
  | 'disabled_site'
  | 'declarative_invalid'
  | 'site_evidence_insufficient'
  | 'turn_failed'

export interface LedgerWebcliHit {
  tool: string
  adapterId: string
  ok: boolean
}

export interface MemoryAdmissionResult {
  ok: boolean
  reason: MemoryAdmitReason
  scope: MemoryScope
  verification?: MemoryVerification
  /** Candidate facts to merge before persist (adds verification). */
  factsPatch?: Record<string, unknown>
  confidenceCap?: number
}

const WEBCLI_CALL_RE = /webcli\s+call\s+([a-z0-9][a-z0-9_.-]*\.[a-z0-9_.-]+)/giu

function toolCommand(tool: MemoryToolCall): string {
  const args = tool.args
  if (!args || typeof args !== 'object' || Array.isArray(args)) return ''
  const command = (args as Record<string, unknown>).command
  return typeof command === 'string' ? command : ''
}

/** Extract adapter.id.tool tokens from shell tool_use; ok follows shell status only. */
export function extractLedgerWebcliHits(toolCalls: MemoryToolCall[]): LedgerWebcliHit[] {
  const hits: LedgerWebcliHit[] = []
  for (const tool of toolCalls) {
    const name = String(tool.name || '')
    if (!/^(PowerShell|Bash)$/i.test(name)) continue
    const command = toolCommand(tool)
    if (!command) continue
    const ok = tool.status === 'done'
    WEBCLI_CALL_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WEBCLI_CALL_RE.exec(command)) !== null) {
      const toolId = match[1]
      // support.example.com.my_todo → adapter support.example.com
      const parts = toolId.split('.')
      const adapterId = parts.length >= 3 ? parts.slice(0, -1).join('.') : toolId
      hits.push({ tool: toolId, adapterId, ok })
    }
  }
  return hits
}

function isKnownAdapter(site: string, adapters: MemoryAdapterIdentity[]): boolean {
  return adapters.some((a) => a.id === site)
}

function hasFailedTool(toolCalls: MemoryToolCall[]): boolean {
  return toolCalls.some((tool) => tool.status === 'failed' || tool.status === 'error')
}

/**
 * Admit a model memory candidate for persistence planning.
 * @param enabledAdapterIds when provided, site must be in this set (disabled → reject)
 */
export function admitMemoryCandidate(input: {
  candidate?: MemoryUpdateCandidate
  baseScope: MemoryScope
  adapters: MemoryAdapterIdentity[]
  enabledAdapterIds?: Set<string> | string[]
  toolCalls: MemoryToolCall[]
  turnSucceeded: boolean
  /** Optional ExecutionRecords; unused for verified until Bridge. */
  records?: ExecutionRecordView[]
}): MemoryAdmissionResult {
  const candidate = input.candidate
  if (!candidate) return { ok: false, reason: 'no_candidate', scope: input.baseScope }
  if (candidate.action === 'ignore') return { ok: false, reason: 'ignore', scope: input.baseScope }

  const enabled = input.enabledAdapterIds
    ? (input.enabledAdapterIds instanceof Set
      ? input.enabledAdapterIds
      : new Set(input.enabledAdapterIds))
    : null

  if (candidate.memory_type === 'user_usage') {
    return {
      ok: true,
      reason: 'admitted',
      scope: { ...input.baseScope, ...(candidate.scope || {}) },
      verification: 'ledger',
      factsPatch: { verification: 'ledger' },
    }
  }

  if (candidate.memory_type === 'task_execution') {
    if (!input.turnSucceeded && input.toolCalls.length === 0) {
      return { ok: false, reason: 'turn_failed', scope: input.baseScope }
    }
    return {
      ok: true,
      reason: 'admitted',
      scope: { ...input.baseScope, ...(candidate.scope || {}) },
      verification: 'ledger',
      factsPatch: { verification: 'ledger' },
    }
  }

  if (candidate.memory_type === 'site_operation') {
    const site = String(candidate.scope?.site || '').trim()
    if (!site) {
      // Fallback: unique successful ledger adapter (evidence), not NL fuzzy.
      const hits = extractLedgerWebcliHits(input.toolCalls).filter((h) => h.ok)
      const adapters = [...new Set(hits.map((h) => h.adapterId))]
      if (adapters.length === 1 && isKnownAdapter(adapters[0], input.adapters)) {
        if (enabled && !enabled.has(adapters[0])) {
          return { ok: false, reason: 'disabled_site', scope: { ...input.baseScope, site: adapters[0] } }
        }
        return admitSiteWithEvidence({
          candidate,
          baseScope: input.baseScope,
          site: adapters[0],
          toolCalls: input.toolCalls,
          turnSucceeded: input.turnSucceeded,
          enabled,
        })
      }
      return { ok: false, reason: 'missing_site', scope: input.baseScope }
    }
    if (!isKnownAdapter(site, input.adapters)) {
      return { ok: false, reason: 'unknown_site', scope: input.baseScope }
    }
    if (enabled && !enabled.has(site)) {
      return { ok: false, reason: 'disabled_site', scope: { ...input.baseScope, site } }
    }
    return admitSiteWithEvidence({
      candidate,
      baseScope: input.baseScope,
      site,
      toolCalls: input.toolCalls,
      turnSucceeded: input.turnSucceeded,
      enabled,
    })
  }

  if (candidate.memory_type.startsWith('extension:')) {
    const extension = candidate.scope?.extension || input.baseScope.extension
    if (!extension) return { ok: false, reason: 'missing_site', scope: input.baseScope }
    return {
      ok: true,
      reason: 'admitted',
      scope: { ...input.baseScope, extension },
      verification: 'provisional',
      factsPatch: { verification: 'provisional' },
      confidenceCap: 0.6,
    }
  }

  return { ok: false, reason: 'no_candidate', scope: input.baseScope }
}

function admitSiteWithEvidence(input: {
  candidate: MemoryUpdateCandidate
  baseScope: MemoryScope
  site: string
  toolCalls: MemoryToolCall[]
  turnSucceeded: boolean
  enabled: Set<string> | null
}): MemoryAdmissionResult {
  const scope: MemoryScope = { ...input.baseScope, site: input.site }
  const refs = parseExecutionRefs(input.candidate.facts)
  const declarative = isDeclarativeSiteOperation({
    memoryType: 'site_operation',
    facts: input.candidate.facts,
    confidence: input.candidate.confidence,
    site: input.site,
  })

  const noTools = input.toolCalls.length === 0
  const conf = input.candidate.confidence ?? 1

  // Declarative / no-execution remember: provisional only (never verified).
  if (noTools || input.candidate.facts?.declarative === true) {
    if (refs.length > 0) {
      return { ok: false, reason: 'declarative_invalid', scope }
    }
    if (!input.turnSucceeded) {
      return { ok: false, reason: 'turn_failed', scope }
    }
    // Explicit declarative flag, or low-confidence remember-without-tools.
    if (input.candidate.facts?.declarative === true) {
      if (!declarative) {
        return { ok: false, reason: 'declarative_invalid', scope }
      }
    } else if (conf > 0.6) {
      // High confidence without tools = fake verified → reject
      return { ok: false, reason: 'site_evidence_insufficient', scope }
    }
    return {
      ok: true,
      reason: 'admitted',
      scope,
      verification: 'provisional',
      factsPatch: { verification: 'provisional', declarative: true },
      confidenceCap: 0.6,
    }
  }

  // Ledger evidence from tool_use (shell status + webcli call extract). Not Bridge verified.
  if (!input.turnSucceeded || hasFailedTool(input.toolCalls)) {
    return { ok: false, reason: 'site_evidence_insufficient', scope }
  }
  const hits = extractLedgerWebcliHits(input.toolCalls).filter(
    (h) => h.adapterId === input.site || h.tool.startsWith(`${input.site}.`),
  )
  const okHits = hits.filter((h) => h.ok)
  // ≥2 distinct successful tool ids = reusable workflow; ≥1 alone is observation — reject.
  const distinctOk = new Set(okHits.map((h) => h.tool))
  if (distinctOk.size < 2) {
    return { ok: false, reason: 'site_evidence_insufficient', scope }
  }
  return {
    ok: true,
    reason: 'admitted',
    scope,
    verification: 'ledger',
    factsPatch: { verification: 'ledger' },
  }
}
