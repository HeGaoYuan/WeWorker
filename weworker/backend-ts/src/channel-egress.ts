export const DEFAULT_WEIXIN_BASE_URL = 'https://ilinkai.weixin.qq.com'

function normalizeHttpBaseUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:') {
    throw new Error('Channel base URL must use https')
  }
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

export function buildAllowedWeixinBaseUrls(extraCsv = process.env.WEWORKER_ALLOWED_WEIXIN_BASE_URLS || ''): Set<string> {
  const urls = new Set<string>([normalizeHttpBaseUrl(DEFAULT_WEIXIN_BASE_URL)])
  for (const raw of extraCsv.split(',')) {
    const value = raw.trim()
    if (!value) continue
    urls.add(normalizeHttpBaseUrl(value))
  }
  return urls
}

export function assertAllowedWeixinBaseUrl(raw: string | undefined, allowedBaseUrls = buildAllowedWeixinBaseUrls()): string {
  const value = raw?.trim() || DEFAULT_WEIXIN_BASE_URL
  let normalized: string
  try {
    normalized = normalizeHttpBaseUrl(value)
  } catch {
    throw new Error('Weixin base URL is invalid')
  }
  if (!allowedBaseUrls.has(normalized)) {
    throw new Error(`Weixin base URL is not allowed: ${normalized}`)
  }
  return normalized
}
