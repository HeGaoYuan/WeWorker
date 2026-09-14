/**
 * P0.5: usage-metrics — token totals + cache-hit rate extraction.
 */
import { describe, it, expect } from 'vitest'
import { computeUsageMetrics } from '../usage-metrics.js'

describe('P0.5: computeUsageMetrics', () => {
  it('sums fresh input + cache read + cache create into total_input_tokens', () => {
    const m = computeUsageMetrics({
      input_tokens: 1000,
      cache_read_input_tokens: 4000,
      cache_creation_input_tokens: 500,
      output_tokens: 300,
    })
    expect(m.total_input_tokens).toBe(5500)
    expect(m.output_tokens).toBe(300)
  })

  it('computes cache_hit_rate = cache_read / total_input', () => {
    const m = computeUsageMetrics({
      input_tokens: 1000,
      cache_read_input_tokens: 4000,
      cache_creation_input_tokens: 1000,
      output_tokens: 0,
    })
    // 4000 / (1000 + 4000 + 1000) = 4000/6000 = 0.666...
    expect(m.cache_hit_rate).toBeCloseTo(4000 / 6000, 5)
  })

  it('cache_hit_rate is 1.0 when the whole prefix was read from cache', () => {
    const m = computeUsageMetrics({
      input_tokens: 0,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 0,
      output_tokens: 10,
    })
    expect(m.cache_hit_rate).toBe(1)
  })

  it('cache_hit_rate is 0 when nothing was cached (cold prompt)', () => {
    const m = computeUsageMetrics({
      input_tokens: 5000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 5000,
      output_tokens: 10,
    })
    expect(m.cache_hit_rate).toBe(0)
  })

  it('treats missing/undefined usage as all-zero (no division by zero)', () => {
    const m = computeUsageMetrics(undefined)
    expect(m.total_input_tokens).toBe(0)
    expect(m.cache_hit_rate).toBe(0)
    expect(m.input_tokens).toBe(0)
  })

  it('treats partially-missing fields as zero', () => {
    const m = computeUsageMetrics({ input_tokens: 200, output_tokens: 5 })
    expect(m.cache_read_input_tokens).toBe(0)
    expect(m.cache_creation_input_tokens).toBe(0)
    expect(m.total_input_tokens).toBe(200)
    expect(m.cache_hit_rate).toBe(0)
  })
})
