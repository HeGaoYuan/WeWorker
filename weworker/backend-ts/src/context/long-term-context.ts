import type { LongTermMemoryContext } from './context-types.js'
import type { MemoryScope } from '../memory/memory-types.js'
import { formatRecalledMemories, retrieveMemories } from '../memory/memory-retriever.js'
import { getMemoryStore, type MemoryStore } from '../memory/memory-store.js'

export function createLongTermMemoryContext(
  input: { recalledMemory?: string } = {},
): LongTermMemoryContext {
  return { recalled: input.recalledMemory ?? '' }
}

export interface LongTermMemoryRecallInput {
  query: string
  scope?: MemoryScope
  limit?: number
  store?: MemoryStore
}

/** Read-only recall. Memory availability must not block the current AI turn. */
export function recallLongTermMemory(input: LongTermMemoryRecallInput): LongTermMemoryContext {
  if (!input.query?.trim()) return createLongTermMemoryContext()
  try {
    const memories = retrieveMemories(input.store ?? getMemoryStore(), {
      query: input.query,
      scope: input.scope,
      limit: input.limit,
    })
    return createLongTermMemoryContext({ recalledMemory: formatRecalledMemories(memories) })
  } catch {
    return createLongTermMemoryContext()
  }
}
