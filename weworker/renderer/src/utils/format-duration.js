/**
 * Format a millisecond duration into a compact human-readable string.
 *   320      -> "320ms"
 *   2300     -> "2.3s"
 *   83999    -> "1m24s"
 *   null/NaN -> ""
 */
export function formatDuration(ms) {
  if (ms == null || typeof ms !== 'number' || isNaN(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s - m * 60)
  return `${m}m${rest}s`
}
