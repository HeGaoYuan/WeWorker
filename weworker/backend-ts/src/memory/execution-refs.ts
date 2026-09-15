/**
 * facts.execution_refs 与本回合 ExecutionRecord 的对表校验。
 * 见 docs/memory_gate_execution_refs_design.md Phase 0.5。
 */

export type ExecutionKind = 'webcli' | 'local_shell' | 'api_route' | 'skill'

export interface ExecutionRef {
  kind: ExecutionKind
  tool?: string
  required: 'success' | 'failed' | 'any'
}

export interface ExecutionRecordRow {
  id: string
  kind: ExecutionKind
  tool?: string | null
  ok: boolean
}

export type ExecutionRefsRejectReason =
  | 'execution_refs_mismatch'
  | 'site_operation_refs_required'
  | 'declarative_site_invalid'
  | 'user_usage_refs_ignored'

function asRef(raw: unknown): ExecutionRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const kind = obj.kind
  const required = obj.required
  if (kind !== 'webcli' && kind !== 'local_shell' && kind !== 'api_route' && kind !== 'skill') return null
  if (required !== 'success' && required !== 'failed' && required !== 'any') return null
  const tool = typeof obj.tool === 'string' && obj.tool.trim() ? obj.tool.trim() : undefined
  if ((kind === 'webcli' || kind === 'api_route') && !tool) return null
  return { kind, tool, required }
}

export function parseExecutionRefs(facts: Record<string, unknown> | undefined): ExecutionRef[] {
  const raw = facts?.execution_refs
  if (!Array.isArray(raw)) return []
  return raw.map(asRef).filter((ref): ref is ExecutionRef => Boolean(ref))
}

function recordSatisfies(record: ExecutionRecordRow, ref: ExecutionRef): boolean {
  if (record.kind !== ref.kind) return false
  if (ref.required === 'success' && !record.ok) return false
  if (ref.required === 'failed' && record.ok) return false
  if (ref.kind === 'webcli' || ref.kind === 'api_route') {
    return Boolean(ref.tool) && record.tool === ref.tool
  }
  return true
}

/** Consume matching records in append order; each record used at most once. */
export function matchExecutionRefs(
  refs: ExecutionRef[],
  records: ExecutionRecordRow[],
): { ok: boolean; matchedIds: string[] } {
  const remaining = [...records]
  const matchedIds: string[] = []
  for (const ref of refs) {
    const idx = remaining.findIndex((record) => recordSatisfies(record, ref))
    if (idx < 0) return { ok: false, matchedIds }
    matchedIds.push(remaining[idx].id)
    remaining.splice(idx, 1)
  }
  return { ok: true, matchedIds }
}

export function isDeclarativeSiteOperation(input: {
  memoryType: string
  facts?: Record<string, unknown>
  confidence?: number
  site?: string
}): boolean {
  if (input.memoryType !== 'site_operation') return false
  if (input.facts?.declarative !== true) return false
  if ((input.confidence ?? 1) > 0.6) return false
  return Boolean(input.site)
}

export type ValidateExecutionRefsResult =
  | { ok: true; matchedIds: string[]; reason?: undefined }
  | { ok: false; reason: ExecutionRefsRejectReason; matchedIds?: string[] }

/**
 * Gate candidate against turn ExecutionRecords.
 * - user_usage: skip refs (ok)
 * - declarative site_operation: no refs required; must pass §3.5 shape
 * - verified site_operation: ≥1 webcli ref and all refs match
 * - task_execution: if turn has shell/webcli records, refs required and must match
 * - when refs present on any type (except user_usage): must match
 */
export function validateExecutionRefs(input: {
  memoryType: string
  facts?: Record<string, unknown>
  confidence?: number
  site?: string
  records: ExecutionRecordRow[]
}): ValidateExecutionRefsResult {
  const refs = parseExecutionRefs(input.facts)
  const hasShellOrWebcli = input.records.some(
    (r) => r.kind === 'local_shell' || r.kind === 'webcli',
  )

  if (input.memoryType === 'user_usage') {
    return { ok: true, matchedIds: [] }
  }

  if (input.memoryType === 'site_operation') {
    if (input.facts?.declarative === true) {
      if (!isDeclarativeSiteOperation(input) || refs.length > 0) {
        return { ok: false, reason: 'declarative_site_invalid' }
      }
      return { ok: true, matchedIds: [] }
    }
    const webcliRefs = refs.filter((r) => r.kind === 'webcli')
    if (webcliRefs.length === 0) {
      // Phase 0.5 transitional: allow empty refs when no ExecutionRecords yet
      // (Agent main-path webcli gap until Phase 2). Callers may still use
      // toolCalls workflow gate. When records exist, verified requires refs.
      if (input.records.some((r) => r.kind === 'webcli')) {
        return { ok: false, reason: 'site_operation_refs_required' }
      }
      return { ok: true, matchedIds: [] }
    }
    const matched = matchExecutionRefs(refs, input.records)
    if (!matched.ok) return { ok: false, reason: 'execution_refs_mismatch', matchedIds: matched.matchedIds }
    return { ok: true, matchedIds: matched.matchedIds }
  }

  if (input.memoryType === 'task_execution') {
    if (hasShellOrWebcli && refs.length === 0) {
      // Transitional: no hard reject until shell-runner writes records widely.
      return { ok: true, matchedIds: [] }
    }
    if (refs.length === 0) return { ok: true, matchedIds: [] }
    const matched = matchExecutionRefs(refs, input.records)
    if (!matched.ok) return { ok: false, reason: 'execution_refs_mismatch', matchedIds: matched.matchedIds }
    return { ok: true, matchedIds: matched.matchedIds }
  }

  if (refs.length === 0) return { ok: true, matchedIds: [] }
  const matched = matchExecutionRefs(refs, input.records)
  if (!matched.ok) return { ok: false, reason: 'execution_refs_mismatch', matchedIds: matched.matchedIds }
  return { ok: true, matchedIds: matched.matchedIds }
}
