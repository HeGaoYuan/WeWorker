/**
 * Memory protocol observability (Phase P).
 * Detects malformed or missing hidden memory output — does NOT synthesize
 * content, admit candidates, or trigger a second model request.
 */
import type { MemoryToolCall } from './memory-event-context.js'
import type { MemoryParseOutcome } from './memory-extractor.js'

export type MemoryProtocolViolation =
  | 'shell_missing_block'
  | 'shell_parse_error'
  | 'memory_block_parse_error'

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
  if (input.aborted) {
    return { violated: false, hasTerminalShell }
  }
  if (input.parseOutcome === 'present_parse_error') {
    return {
      violated: true,
      code: hasTerminalShell ? 'shell_parse_error' : 'memory_block_parse_error',
      hasTerminalShell,
    }
  }
  if (!hasTerminalShell) return { violated: false, hasTerminalShell }
  if (input.parseOutcome === 'missing') {
    return { violated: true, code: 'shell_missing_block', hasTerminalShell }
  }
  return { violated: false, hasTerminalShell }
}
