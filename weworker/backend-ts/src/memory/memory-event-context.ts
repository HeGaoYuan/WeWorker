import type { MemoryScope } from './memory-types.js'

export interface MemoryAdapterIdentity {
  id: string
  name?: string
  match?: string[]
}

export interface MemoryToolCall {
  name: string
  args?: unknown
  status?: string
}

function searchableToolInput(tool: MemoryToolCall): string {
  let args = ''
  try {
    args = JSON.stringify(tool.args ?? {})
  } catch {}
  return `${tool.name}\n${args}`.toLocaleLowerCase()
}

function matchesAdapter(value: string, adapter: MemoryAdapterIdentity): boolean {
  const tokens = [adapter.id, adapter.name, ...(adapter.match ?? [])]
    .map((token) => String(token || '').trim().toLocaleLowerCase())
    .filter((token) => token.length >= 3 || /^[\u3400-\u9fff]{2,}$/u.test(token))
  return tokens.some((token) => value.includes(token))
}

export function buildMemoryEventContext(input: {
  baseScope: MemoryScope
  userMessage: string
  adapters: MemoryAdapterIdentity[]
  toolCalls: MemoryToolCall[]
}): { scope: MemoryScope } {
  const message = String(input.userMessage || '').toLocaleLowerCase()
  const referenced = new Set<string>()
  for (const adapter of input.adapters) {
    if (matchesAdapter(message, adapter)) referenced.add(adapter.id)
  }
  for (const tool of input.toolCalls) {
    const value = searchableToolInput(tool)
    for (const adapter of input.adapters) {
      if (matchesAdapter(value, adapter)) referenced.add(adapter.id)
    }
  }
  const site = referenced.size === 1 ? [...referenced][0] : undefined
  return {
    scope: { ...input.baseScope, ...(site ? { site } : {}) },
  }
}
