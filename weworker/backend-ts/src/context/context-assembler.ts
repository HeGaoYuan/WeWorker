import { DEFAULT_CONTEXT_LIMIT } from '../context-window.js'
import type {
  ContextAssembly,
  ContextCategoryId,
  ContextCategorySnapshot,
  ContextSnapshot,
  LongTermMemoryContext,
  RuntimeContext,
  WorkContext,
} from './context-types.js'

const CJK_OR_FULL_WIDTH = /[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60]/u
const WHITESPACE = /\s/u

/** Deterministic local estimate for UI composition only; provider usage remains authoritative. */
export function estimateContextTokens(value: string): number {
  const text = String(value || '')
  if (!text) return 0

  let tokens = 0
  let latinRun = 0
  const flushLatin = () => {
    if (!latinRun) return
    tokens += Math.ceil(latinRun / 4)
    latinRun = 0
  }

  for (const char of text) {
    if (CJK_OR_FULL_WIDTH.test(char)) {
      flushLatin()
      tokens += 1
    } else if (WHITESPACE.test(char)) {
      flushLatin()
    } else if (/^[\p{L}\p{N}_-]$/u.test(char)) {
      latinRun += 1
    } else {
      flushLatin()
      tokens += 0.5
    }
  }
  flushLatin()
  return Math.ceil(tokens)
}

function category(id: ContextCategoryId, scope: ContextCategorySnapshot['scope'], text: string): ContextCategorySnapshot {
  return { id, scope, estimated_tokens: estimateContextTokens(text) }
}

function createSnapshot(
  runtime: RuntimeContext,
  work: WorkContext,
  longTerm: LongTermMemoryContext,
  contextLimit: number,
): ContextSnapshot {
  const categories = [
    category('system_prompt', 'runtime', runtime.system_prompt),
    category('tool_definitions', 'runtime', runtime.tool_definitions),
    category('rules', 'runtime', runtime.rules),
    category('skills', 'runtime', runtime.skills),
    category('mcp_dynamic_tools', 'runtime', runtime.mcp_dynamic_tools),
    category('subagent_definitions', 'runtime', runtime.subagent_definitions),
    category('conversation', 'work', work.conversation),
    category('long_term_memory', 'long_term', longTerm.recalled),
  ]

  return {
    version: 1,
    phase: 'request_start',
    estimated_total_tokens: categories.reduce((sum, item) => sum + item.estimated_tokens, 0),
    context_limit: contextLimit,
    categories,
  }
}

export function assembleContext(input: {
  runtime: RuntimeContext
  work: WorkContext
  longTerm: LongTermMemoryContext
  sdkSystemPrompt: string
  sdkPrompt: string
  contextLimit?: number
}): ContextAssembly {
  const sdkPrompt = input.longTerm.recalled
    ? `[相关长期记忆]\n${input.longTerm.recalled}\n\n[当前任务上下文]\n${input.sdkPrompt}`
    : input.sdkPrompt
  return {
    runtime: input.runtime,
    work: input.work,
    long_term: input.longTerm,
    sdk: {
      system_prompt: input.sdkSystemPrompt,
      prompt: sdkPrompt,
    },
    snapshot: createSnapshot(
      input.runtime,
      input.work,
      input.longTerm,
      input.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
    ),
  }
}

export function buildTurnEndContextSnapshot(
  requestSnapshot: ContextSnapshot,
  assistantTurnContext: string,
  actualInputTokens?: number,
): ContextSnapshot {
  const assistantTokens = estimateContextTokens(
    assistantTurnContext ? `\n\nAssistant: ${assistantTurnContext}` : '',
  )
  const categories = requestSnapshot.categories.map((item) => (
    item.id === 'conversation'
      ? { ...item, estimated_tokens: item.estimated_tokens + assistantTokens }
      : { ...item }
  ))
  return {
    ...requestSnapshot,
    phase: 'turn_end',
    estimated_total_tokens: categories.reduce((sum, item) => sum + item.estimated_tokens, 0),
    categories,
    ...(Number.isFinite(actualInputTokens) ? { actual_input_tokens: Math.max(0, Number(actualInputTokens)) } : {}),
  }
}

export interface TurnContextEvent {
  type: string
  content?: string
  id?: string
  name?: string
  args?: unknown
  result?: string
  usage?: { total_input_tokens?: number }
}

export function createTurnContextCollector(requestSnapshot: ContextSnapshot) {
  let assistantText = ''
  let actualInputTokens: number | undefined
  const toolCalls = new Map<string, { name: string; result?: string }>()

  return {
    observe(event: TurnContextEvent): void {
      if (event.type === 'text_delta' && event.content) {
        assistantText += event.content
      } else if (event.type === 'tool_call_start' && event.id) {
        const existing = toolCalls.get(event.id)
        toolCalls.set(event.id, { name: event.name || existing?.name || 'tool', result: existing?.result })
      } else if (event.type === 'tool_call_result' && event.id) {
        const existing = toolCalls.get(event.id) ?? { name: 'tool' }
        toolCalls.set(event.id, { ...existing, result: event.result })
      } else if (event.type === 'usage') {
        const inputTokens = Number(event.usage?.total_input_tokens)
        if (Number.isFinite(inputTokens)) actualInputTokens = Math.max(0, inputTokens)
      }
    },
    finish(): [
      { type: 'context_snapshot'; context: ContextSnapshot },
      { type: 'done' },
    ] {
      const toolText = [...toolCalls.values()]
        .map((tool) => `\n[Tool] ${tool.name}${tool.result ? `\n${tool.result}` : ''}`)
        .join('')
      const context = buildTurnEndContextSnapshot(
        requestSnapshot,
        `${assistantText}${toolText}`,
        actualInputTokens,
      )
      return [
        { type: 'context_snapshot', context },
        { type: 'done' },
      ]
    },
  }
}
