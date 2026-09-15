import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { contextUsagePercent, formatContextTokens, normalizeContextSnapshot } from '../utils/context-snapshot.js'
import { formatContextLimitInput, parseContextLimitInput } from '../utils/context-window.js'

describe('context snapshot display helpers', () => {
  it('normalizes categories and clamps usage to the context limit', () => {
    const snapshot = normalizeContextSnapshot({
      phase: 'turn_end',
      estimated_total_tokens: 300000,
      context_limit: 200000,
      actual_input_tokens: 4200,
      categories: [
        { id: 'conversation', scope: 'work', estimated_tokens: 1200 },
        { id: 'unknown', estimated_tokens: 999 },
      ],
    })

    assert.equal(snapshot.categories.length, 1)
    assert.equal(snapshot.phase, 'turn_end')
    assert.equal(snapshot.actual_input_tokens, 4200)
    assert.equal(contextUsagePercent(snapshot), 100)
  })

  it('formats token counts for compact UI labels', () => {
    assert.equal(formatContextTokens(456), '456')
    assert.equal(formatContextTokens(8600), '8.60K')
    assert.equal(formatContextTokens(17100), '17.1K')
    assert.equal(formatContextTokens(1000000), '1M')
    assert.equal(formatContextTokens(1500000), '1.5M')
  })

  it('parses preset and custom context window values', () => {
    assert.equal(parseContextLimitInput('128K'), 128000)
    assert.equal(parseContextLimitInput('1M'), 1000000)
    assert.equal(parseContextLimitInput('1.5M'), 1500000)
    assert.equal(parseContextLimitInput('nope'), null)
    assert.equal(formatContextLimitInput(1000000), '1M')
  })
})
