import { buildAllowedLlmBaseUrls, normalizeLlmBaseUrl, type ProviderEntry } from './llm-egress.js'
import { resolveBankCodingProvider } from './builtin-provider.js'
import { CONFIGURED_PROVIDERS } from './provider-config.js'

export const PROVIDERS: ProviderEntry[] = CONFIGURED_PROVIDERS

export const PROVIDER_BASE_URLS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p.weworker.baseUrl])
)

export function getProvider(providerId: string): ProviderEntry | undefined {
  const provider = PROVIDERS.find(provider => provider.id === providerId)
  return provider ? resolveBankCodingProvider(provider) : undefined
}

export function findProviderByWeWorkerBaseUrl(baseUrl: string | undefined): ProviderEntry | undefined {
  if (!baseUrl?.trim()) return undefined
  let normalized: string
  try {
    normalized = normalizeLlmBaseUrl(baseUrl)
  } catch {
    return undefined
  }
  return PROVIDERS.find(provider => {
    if (provider.id === 'custom' || !provider.weworker.baseUrl?.trim()) return false
    try {
      return normalizeLlmBaseUrl(provider.weworker.baseUrl) === normalized
    } catch {
      return false
    }
  })
}

export const ALLOWED_PROVIDER_IDS = new Set(PROVIDERS.map(p => p.id))
export const ALLOWED_LLM_BASE_URLS = buildAllowedLlmBaseUrls(PROVIDERS)

export function buildRuntimeAllowedLlmBaseUrls(...extraBaseUrls: Array<string | undefined>): Set<string> {
  return buildAllowedLlmBaseUrls(PROVIDERS.map(p => resolveBankCodingProvider(p)), extraBaseUrls.filter(Boolean).join(','))
}
