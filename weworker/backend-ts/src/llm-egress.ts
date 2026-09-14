export interface ProviderEntry {
  id: string
  name: string
  models: string[]
  defaultModel: string
  weworker: { protocol: 'anthropic_messages'; baseUrl: string }
  webwright: {
    protocol: 'anthropic_messages' | 'openai_chat_completions'
    modelClass: 'anthropic' | 'zhipu' | 'openai_chat'
    baseUrl: string
    structuredOutput: 'anthropic_json_schema' | 'openai_json_object'
  }
}

export function normalizeLlmBaseUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('LLM base URL must use HTTP or HTTPS')
  if (url.username || url.password || url.search || url.hash) throw new Error('LLM base URL must not include credentials, query, or fragment')
  url.pathname = url.pathname.replace(/\/+$/, '')
  if (/(?:\/v1\/messages|\/chat\/completions|\/responses)$/i.test(url.pathname)) {
    throw new Error('LLM base URL must not include the request endpoint')
  }
  return url.toString().replace(/\/$/, '')
}

export function buildAllowedLlmBaseUrls(providers: ProviderEntry[], extraCsv = process.env.WEWORKER_ALLOWED_LLM_BASE_URLS || ''): Set<string> {
  const urls = new Set<string>()
  for (const provider of providers) {
    for (const baseUrl of [provider.weworker?.baseUrl, provider.webwright?.baseUrl]) {
      if (baseUrl?.trim()) urls.add(normalizeLlmBaseUrl(baseUrl))
    }
  }
  for (const raw of extraCsv.split(',')) {
    const value = raw.trim()
    if (!value) continue
    urls.add(normalizeLlmBaseUrl(value))
  }
  return urls
}

export function assertAllowedLlmBaseUrl(raw: string | undefined, allowedBaseUrls: Set<string>): string {
  const value = raw?.trim() || 'https://api.anthropic.com'
  let normalized: string
  try {
    normalized = normalizeLlmBaseUrl(value)
  } catch {
    throw new Error('LLM base URL is invalid')
  }
  if (!allowedBaseUrls.has(normalized)) {
    throw new Error(`LLM base URL is not allowed: ${normalized}`)
  }
  return normalized
}
