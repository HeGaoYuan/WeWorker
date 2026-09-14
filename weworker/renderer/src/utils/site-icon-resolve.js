/** Built-in silhouette keys (registry `icon` must use these English words for SVG). */
export const BUILTIN_SITE_ICON_KEYS = new Set([
  'globe', 'mail', 'mailbox', 'cart', 'social', 'lock', 'doc', 'ticket',
  'pipeline', 'wallet', 'product', 'version', 'invoice', 'budget',
])

const ENGLISH_ICON_KEY = /^[a-z][a-z0-9_-]*$/i

export function isEnglishIconKey(value) {
  return ENGLISH_ICON_KEY.test((value || '').trim())
}

/**
 * Resolve registry/API `icon` for rendering.
 * - English word: match built-in SVG key, else default `globe`
 * - Otherwise: show literal (emoji / single char)
 * @param {{ icon?: string } | null | undefined} site
 * @returns {{ mode: 'svg', key: string } | { mode: 'literal', text: string }}
 */
export function resolveSiteIcon(site) {
  const raw = (site?.icon ?? '').trim()
  if (!raw) return { mode: 'svg', key: 'globe' }
  if (isEnglishIconKey(raw)) {
    const key = raw.toLowerCase()
    return { mode: 'svg', key: BUILTIN_SITE_ICON_KEYS.has(key) ? key : 'globe' }
  }
  return { mode: 'literal', text: raw }
}
