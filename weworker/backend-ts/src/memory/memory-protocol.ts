/**
 * Memory protocol observability (Phase P).
 * Detects "shell executed but hidden block missing/broken" — does NOT synthesize
 * content, admit candidates, or trigger a second model request.
 */
import type { MemoryToolCall } from './memory-event-context.js'
import type { MemoryParseOutcome } from './memory-extractor.js'

export type MemoryProtocolViolation =
  | 'shell_missing_block'
  | 'shell_parse_error'

export interface MemoryProtocolCheckInput {
  toolCalls: MemoryToolCall[]
  parseOutcome?: MemoryParseOutcome
  aborted?: boolean
}

export interface MemoryProtocolCheckResult {
  violated: boolean
  code?: MemoryProtocolViolation
  hasTerminalShell: boolean
}

/** PowerShell/Bash that finished (success or failure). Running tools do not count. */
export function hasTerminalShellTool(toolCalls: MemoryToolCall[]): boolean {
  return toolCalls.some((tool) => {
    const name = String(tool.name || '')
    if (!/^(PowerShell|Bash)$/i.test(name)) return false
    return tool.status === 'done' || tool.status === 'failed'
  })
}

/**
 * Protocol failure: real terminal shell completed, but the model omitted or
 * broke the required trailing memory block. Explicit ignore is NOT a failure.
 */
export function isMemoryProtocolFailure(input: MemoryProtocolCheckInput): MemoryProtocolCheckResult {
  const hasTerminalShell = hasTerminalShellTool(input.toolCalls)
  if (!hasTerminalShell || input.aborted) {
    return { violated: false, hasTerminalShell }
  }
  if (input.parseOutcome === 'missing') {
    return { violated: true, code: 'shell_missing_block', hasTerminalShell }
  }
  if (input.parseOutcome === 'present_parse_error') {
    return { violated: true, code: 'shell_parse_error', hasTerminalShell }
  }
  return { violated: false, hasTerminalShell }
}
