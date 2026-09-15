import type { MemoryRecord, MemorySearchInput } from './memory-types.js'
import type { MemoryStore } from './memory-store.js'

function relevanceTerms(value: string): Set<string> {
  const normalized = String(value || '').toLocaleLowerCase()
  const terms = new Set<string>()
  for (const match of normalized.matchAll(/[a-z0-9_.-]{3,}/gu)) terms.add(match[0])
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/gu) ?? []
  for (const run of cjkRuns) {
    for (let index = 0; index < run.length - 1; index += 1) {
      terms.add(run.slice(index, index + 2))
    }
  }
  return terms
}

function isRelevantScopedMemory(query: string, memory: MemoryRecord): boolean {
  const queryTerms = relevanceTerms(query)
  if (!queryTerms.size) return false
  const memoryTerms = relevanceTerms(`${memory.key} ${memory.content} ${JSON.stringify(memory.facts)}`)
  let matches = 0
  for (const term of queryTerms) {
    if (memoryTerms.has(term)) matches += 1
    if (matches >= 2) return true
  }
  return false
}

export function retrieveMemories(store: MemoryStore, input: MemorySearchInput): MemoryRecord[] {
  const recalled = store.search(input)
  const scopedTypes = input.scope?.site
    ? ['site_operation', 'task_execution'] as const
    : []

  // User preferences are applicable across tasks even when the new request
  // contains none of the words used when the preference was saved.
  const stableMemories = input.scope?.user
    ? [
        ...store.listActive({ scope: input.scope, type: 'user_usage', limit: input.limit }),
        ...scopedTypes.flatMap((type) => store.listActive({ scope: input.scope, type, limit: input.limit }))
          .filter((memory) => isRelevantScopedMemory(input.query, memory)),
      ]
    : []
  const seen = new Set(recalled.map((memory) => memory.id))
  return [...recalled, ...stableMemories.filter((memory) => !seen.has(memory.id))]
    .slice(0, Math.min(20, Math.max(1, input.limit ?? 8)))
}

export function formatRecalledMemories(
  memories: Array<Pick<MemoryRecord, 'id' | 'type' | 'key' | 'content'>>,
): string {
  if (!memories.length) return ''
  return memories
    .map((memory) => `- [id=${memory.id} type=${memory.type} key=${memory.key}] ${memory.content}`)
    .join('\n')
}
