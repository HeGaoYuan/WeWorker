import type { MemoryScope, MemoryUpdateCandidate } from './memory-types.js'
import type { MemoryStore } from './memory-store.js'
import { assertSafeMemoryCandidate } from './memory-safety.js'

export type MemoryApplyResult =
  | { status: 'saved'; memoryId: string }
  | { status: 'ignored' }

export function applyMemoryUpdate(
  store: MemoryStore,
  eventId: string,
  candidate: MemoryUpdateCandidate,
  eventScope: MemoryScope,
): MemoryApplyResult {
  if (candidate.action === 'ignore') return { status: 'ignored' }
  assertSafeMemoryCandidate(candidate)
  const related = candidate.related_memory_ids ?? []
  const values = {
    type: candidate.memory_type,
    key: candidate.key.trim().slice(0, 160),
    content: candidate.content.trim().slice(0, 2_000),
    facts: candidate.facts ?? {},
    scope: eventScope,
    confidence: candidate.confidence,
  }
  if (!values.key || !values.content) throw new Error('memory key and content are required')

  if (candidate.action === 'update' || candidate.action === 'merge') {
    const targetId = related[0]
    if (!targetId) throw new Error(`${candidate.action} requires a related memory`)
    for (const relatedId of related) assertSameScope(store, relatedId, eventScope)
    const updated = store.update(targetId, values)
    if (!updated) throw new Error('related memory does not exist')
    if (candidate.action === 'merge') {
      for (const duplicateId of related.slice(1)) store.setStatus(duplicateId, 'superseded')
    }
    return { status: 'saved', memoryId: updated.id }
  }

  // Validate every superseded record before creating the replacement so a
  // scope error cannot leave a partially applied memory update.
  if (candidate.action === 'supersede') {
    for (const oldId of related) assertSameScope(store, oldId, eventScope)
  }

  const created = store.create({
    ...values,
    sourceEventId: eventId,
  })
  if (candidate.action === 'supersede') {
    for (const oldId of related) {
      store.setStatus(oldId, 'superseded')
    }
  }
  return { status: 'saved', memoryId: created.id }
}

function assertSameScope(store: MemoryStore, memoryId: string, scope: MemoryScope): void {
  const memory = store.get(memoryId)
  if (!memory) throw new Error('related memory does not exist')
  const keys: Array<keyof MemoryScope> = ['user', 'project', 'site', 'extension']
  if (keys.some((key) => (memory.scope[key] ?? '') !== (scope[key] ?? ''))) {
    throw new Error('related memory is outside the current scope')
  }
}
