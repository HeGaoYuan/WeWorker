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
    .filter((token) => token.length >= 3)
  return tokens.some((token) => value.includes(token))
}

function isAdapterToolInvocation(tool: MemoryToolCall, adapter: MemoryAdapterIdentity): boolean {
  const escapedId = adapter.id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`${escapedId}\\.[a-z0-9_.-]+`, 'iu').test(searchableToolInput(tool))
}

export function buildMemoryEventContext(input: {
  baseScope: MemoryScope
  userMessage: string
  adapters: MemoryAdapterIdentity[]
  toolCalls: MemoryToolCall[]
}): { scope: MemoryScope; hasSuccessfulSiteWorkflow: boolean } {
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
  const successfulSiteTools = input.toolCalls.filter((tool) => (
    tool.status === 'done'
    && !!site
    && isAdapterToolInvocation(tool, input.adapters.find((adapter) => adapter.id === site)!)
  ))
  return {
    scope: { ...input.baseScope, ...(site ? { site } : {}) },
    // A single successful call is an observation, not a reusable workflow.
    hasSuccessfulSiteWorkflow: successfulSiteTools.length >= 2,
  }
}
