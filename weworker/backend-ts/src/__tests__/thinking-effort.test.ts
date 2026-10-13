import { describe, expect, it } from 'vitest'
import { resolveThinkingEffort } from '../thinking-effort.js'

describe('thinking effort compatibility', () => {
  it('keeps the portable three levels for unknown and preset providers', () => {
    expect(resolveThinkingEffort('glm', 'glm-5.2', 'xhigh')).toBe('high')
    expect(resolveThinkingEffort('builtin', 'ark-code-latest', 'max')).toBe('high')
    expect(resolveThinkingEffort('custom', 'unknown-model', 'medium')).toBe('medium')
  })

  it('allows extended levels only for recognized Claude models', () => {
    expect(resolveThinkingEffort('anthropic', 'claude-sonnet-4-6', 'max')).toBe('max')
    expect(resolveThinkingEffort('anthropic', 'claude-opus-4.6', 'xhigh')).toBe('xhigh')
    expect(resolveThinkingEffort('anthropic', 'claude-haiku-4-5-20251001', 'max')).toBe('high')
  })
})
