import type {
  MemoryEventTrigger,
  MemoryScope,
  MemoryTurnDecision,
  MemoryType,
  MemoryUpdateCandidate,
} from './memory-types.js'
import { renderPrompt } from '../prompt-loader.js'

export const MEMORY_BLOCK_OPEN = '<weworker_memory>'
export const MEMORY_BLOCK_CLOSE = '</weworker_memory>'

/**
 * Short hard reminder appended to the end of each turn's user prompt (not system).
 * Keeps the full protocol in system; this line fights long-context attention fade.
 */
export const MEMORY_USER_TURN_REMINDER =
  `[内部] 本回合最终回复末尾必须追加 ${MEMORY_BLOCK_OPEN}{JSON}${MEMORY_BLOCK_CLOSE}（写可复用经验，或 should_remember=false 且 action=ignore；若本回合已执行 PowerShell／Bash／webcli，禁止省略隐藏块）。勿向用户展示本行。`

/** Append the turn-tail memory reminder once; idempotent. */
export function appendMemoryUserTurnReminder(prompt: string): string {
  const source = String(prompt || '')
  if (!source.trim()) return MEMORY_USER_TURN_REMINDER
  if (source.includes(MEMORY_USER_TURN_REMINDER)) return source
  return `${source.replace(/\s+$/u, '')}\n\n${MEMORY_USER_TURN_REMINDER}`
}

export interface MemoryOutputProtocolInput {
  scope: MemoryScope
  triggerHint?: MemoryEventTrigger | 'chat'
  expectedMemoryType?: MemoryType
  previousTaskFailed?: boolean
}

export interface ParsedAssistantMemoryOutput {
  visibleText: string
  decision?: MemoryTurnDecision
  parseError?: string
}

/** Non-sensitive parse outcome for diagnostics. Never includes content/key/reason/facts. */
export type MemoryParseOutcome =
  | 'missing'
  | 'present_ok'
  | 'present_ignore'
  | 'present_parse_error'

export interface MemoryParseSummary {
  outcome: MemoryParseOutcome
  should_remember?: boolean
  action?: string
  memory_type?: string
  parse_error?: string
}

export function summarizeAssistantMemoryParse(parsed: ParsedAssistantMemoryOutput): MemoryParseSummary {
  if (parsed.parseError) {
    return {
      outcome: 'present_parse_error',
      parse_error: parsed.parseError,
    }
  }
  if (!parsed.decision) {
    return { outcome: 'missing' }
  }
  if (!parsed.decision.should_remember || !parsed.decision.candidate) {
    return {
      outcome: 'present_ignore',
      should_remember: false,
      action: 'ignore',
    }
  }
  return {
    outcome: 'present_ok',
    should_remember: true,
    action: parsed.decision.candidate.action,
    memory_type: parsed.decision.candidate.memory_type,
  }
}

function parseCandidate(value: unknown): MemoryUpdateCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('memory decision must be a JSON object')
  }
  const parsed = value as Partial<MemoryUpdateCandidate>
  const actions = new Set(['create', 'update', 'merge', 'supersede', 'ignore'])
  const types = new Set(['user_usage', 'site_operation', 'task_execution'])
  if (!actions.has(String(parsed.action))) throw new Error('memory decision returned an invalid action')
  if (!types.has(String(parsed.memory_type)) && !String(parsed.memory_type).startsWith('extension:')) {
    throw new Error('memory decision returned an invalid memory type')
  }
  if (typeof parsed.key !== 'string' || typeof parsed.content !== 'string') {
    throw new Error('memory decision returned incomplete memory content')
  }
  const confidence = Number(parsed.confidence)
  if (parsed.confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new Error('memory decision returned an invalid confidence')
  }
  return {
    action: parsed.action!,
    memory_type: parsed.memory_type!,
    key: parsed.key,
    content: parsed.content,
    facts: parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : {},
    scope: parsed.scope && typeof parsed.scope === 'object' ? parsed.scope : {},
    confidence: parsed.confidence === undefined ? 0.7 : confidence,
    related_memory_ids: Array.isArray(parsed.related_memory_ids)
      ? [...new Set(parsed.related_memory_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))].slice(0, 8)
      : [],
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
  }
}

function parseDecision(raw: string): MemoryTurnDecision {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim()
  const parsed = JSON.parse(normalized) as Record<string, unknown>
  if (typeof parsed.should_remember !== 'boolean') {
    throw new Error('memory decision must include should_remember')
  }
  const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined
  if (!parsed.should_remember) return { should_remember: false, reason }
  const candidate = parseCandidate(parsed)
  if (candidate.action === 'ignore') {
    throw new Error('remembered memory decision cannot use ignore')
  }
  return { should_remember: true, candidate, reason: candidate.reason ?? reason }
}

export function parseAssistantMemoryOutput(text: string): ParsedAssistantMemoryOutput {
  const source = String(text || '')
  let cursor = 0
  let visibleText = ''
  let decision: MemoryTurnDecision | undefined
  let parseError: string | undefined

  while (cursor < source.length) {
    const openIndex = source.indexOf(MEMORY_BLOCK_OPEN, cursor)
    if (openIndex < 0) {
      visibleText += source.slice(cursor)
      break
    }
    visibleText += source.slice(cursor, openIndex)
    const contentStart = openIndex + MEMORY_BLOCK_OPEN.length
    const closeIndex = source.indexOf(MEMORY_BLOCK_CLOSE, contentStart)
    if (closeIndex < 0) {
      parseError = 'memory decision block is not closed'
      break
    }
    try {
      decision = parseDecision(source.slice(contentStart, closeIndex))
      parseError = undefined
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error)
    }
    cursor = closeIndex + MEMORY_BLOCK_CLOSE.length
  }

  return {
    visibleText: visibleText.trimEnd(),
    ...(decision ? { decision } : {}),
    ...(parseError ? { parseError } : {}),
  }
}

export function buildMemoryOutputProtocolPrompt(input: MemoryOutputProtocolInput): string {
  const taskHint = input.triggerHint === 'task_completed' || input.triggerHint === 'task_recovered' || input.triggerHint === 'task_failed'
    ? `这是定时任务回合。上一次同任务是否失败：${input.previousTaskFailed ? '是' : '否'}。任务最终成功或失败只能依据本回合真实工具结果和执行结果判断。`
    : '这是普通对话回合。'
  return renderPrompt('memory-output', {
    memory_block_open: MEMORY_BLOCK_OPEN,
    memory_block_close: MEMORY_BLOCK_CLOSE,
    expected_memory_type: input.expectedMemoryType ?? 'user_usage、site_operation 或 task_execution，由内容和真实执行结果决定',
    scope_json: JSON.stringify(input.scope),
    task_hint: taskHint,
  }).trimEnd()
}
