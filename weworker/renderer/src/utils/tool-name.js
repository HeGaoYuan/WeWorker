/**
 * Unified tool name display utilities.
 *
 * Tool names go through multiple transformations:
 *   adapter: "jd.com.search_products"
 *   MCP:     "jd-com-search_products" (dots → hyphens)
 *   SDK:     "mcp__weworker__jd-com-search_products" (prefix added)
 *
 * This module provides a single function to convert any format back to
 * the human-readable original: "jd.com.search_products"
 */

/**
 * Convert any tool name format to human-readable display name.
 * Handles both clean names from DB and raw SDK names from SSE events.
 *
 * Examples:
 *   "jd.com.search_products"               → "jd.com.search_products" (clean DB)
 *   "mcp__weworker__jd-com-search_products" → "jd.com.search_products" (SSE event)
 *   "open_browser"                          → "open_browser"
 */
export function displayToolName(raw) {
  if (!raw) return '(tool)'
  // Strip MCP SDK prefix
  let name = raw.replace(/^mcp__weworker__/, '')
  // Restore dots from sanitization formats
  name = name.replace(/__/g, '.').replace(/-/g, '.')
  return name
}

/**
 * Get the short name (without domain prefix) for compact display.
 * If siteId is provided, strips that exact prefix.
 * Otherwise takes everything after the last domain-like prefix.
 * e.g. shortToolName("jd.com.search_products", "jd.com") → "search_products"
 *      shortToolName("mail.163.com.search_emails", "mail.163.com") → "search_emails"
 */
export function shortToolName(raw, siteId) {
  const full = displayToolName(raw)
  if (siteId && full.startsWith(siteId + '.')) {
    return full.slice(siteId.length + 1)
  }
  // Fallback: find the last segment that looks like a function name (contains _)
  const parts = full.split('.')
  // Walk from the end to find where the "action" part starts
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].includes('_') || i === parts.length - 1) {
      return parts.slice(i).join('.')
    }
  }
  return full
}
