/**
 * Per-turn token & prompt-cache metrics, extracted from the SDK result message.
 *
 * Serves the P0.5 baseline needed to evaluate B1 (input-token growth across
 * conversation turns) and the cache-hit rate that tells us whether the SDK's
 * automatic prompt caching is actually landing.
 */

export interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface UsageMetrics {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  /** Fresh input + cache writes + cache reads — the full input context fed to the model. */
  total_input_tokens: number
  /** cache_read_input_tokens / total_input_tokens, clamped to [0, 1]. */
  cache_hit_rate: number
}

export function computeUsageMetrics(usage: RawUsage | undefined | null): UsageMetrics {
  const input_tokens = usage?.input_tokens ?? 0
  const output_tokens = usage?.output_tokens ?? 0
  const cache_read_input_tokens = usage?.cache_read_input_tokens ?? 0
  const cache_creation_input_tokens = usage?.cache_creation_input_tokens ?? 0
  const total_input_tokens = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
  const cache_hit_rate = total_input_tokens > 0 ? cache_read_input_tokens / total_input_tokens : 0
  return {
    input_tokens,
    output_tokens,
    cache_read_input_tokens,
    cache_creation_input_tokens,
    total_input_tokens,
    cache_hit_rate,
  }
}
