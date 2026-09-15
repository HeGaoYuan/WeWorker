import { describe, expect, it } from 'vitest'
import {
  hasTerminalShellTool,
  isMemoryProtocolFailure,
} from '../memory/memory-protocol.js'

describe('memory protocol observability', () => {
  it('detects finished PowerShell/Bash tools only', () => {
    expect(hasTerminalShellTool([{ name: 'PowerShell', status: 'done' }])).toBe(true)
    expect(hasTerminalShellTool([{ name: 'Bash', status: 'failed' }])).toBe(true)
    expect(hasTerminalShellTool([{ name: 'PowerShell', status: 'running' }])).toBe(false)
    expect(hasTerminalShellTool([{ name: 'Read', status: 'done' }])).toBe(false)
    expect(hasTerminalShellTool([])).toBe(false)
  })

  it('flags missing or parse_error after shell execution', () => {
    const tools = [{ name: 'PowerShell', status: 'done' as const }]
    expect(isMemoryProtocolFailure({ toolCalls: tools, parseOutcome: 'missing' })).toEqual({
      violated: true,
      code: 'shell_missing_block',
      hasTerminalShell: true,
    })
    expect(isMemoryProtocolFailure({
      toolCalls: tools,
      parseOutcome: 'present_parse_error',
    })).toEqual({
      violated: true,
      code: 'shell_parse_error',
      hasTerminalShell: true,
    })
  })

  it('flags a malformed remembered candidate even without shell execution', () => {
    expect(isMemoryProtocolFailure({
      toolCalls: [],
      parseOutcome: 'present_parse_error',
    })).toEqual({
      violated: true,
      code: 'memory_block_parse_error',
      hasTerminalShell: false,
    })
  })

  it('does not treat ignore or successful parse as protocol failure', () => {
    const tools = [{ name: 'PowerShell', status: 'failed' as const }]
    expect(isMemoryProtocolFailure({
      toolCalls: tools,
      parseOutcome: 'present_ignore',
    }).violated).toBe(false)
    expect(isMemoryProtocolFailure({
      toolCalls: tools,
      parseOutcome: 'present_ok',
    }).violated).toBe(false)
  })

  it('skips abort and non-shell turns', () => {
    expect(isMemoryProtocolFailure({
      toolCalls: [{ name: 'PowerShell', status: 'done' }],
      parseOutcome: 'missing',
      aborted: true,
    }).violated).toBe(false)
    expect(isMemoryProtocolFailure({
      toolCalls: [{ name: 'Read', status: 'done' }],
      parseOutcome: 'missing',
    }).violated).toBe(false)
  })
})
