import { PROVIDERS, getProvider } from './provider-registry.js'

// Provider visibility / "added" state for the model picker.
// Registered providers stay hidden until the
// user explicitly adds them through settings. Existing installs that already
// carry credentials/config stay visible (backward compatibility), and the
// currently active provider is always shown as a safety fallback.

// Preset provider ids offered in the "add provider" dialog.
export const PRESET_PROVIDER_IDS = PROVIDERS.filter(provider => provider.id !== 'custom').map(provider => provider.id)
export const CUSTOM_PROVIDER_ID = 'custom'
export const ADDABLE_PROVIDER_IDS = PROVIDERS.map(provider => provider.id)

export interface ProviderLegacyConfig {
  hasKey: boolean
  model: string
  // Non-empty model values shipped as defaults by older versions; these alone
  // do not prove the user ever configured the provider.
  defaultModels?: string[]
  baseUrl?: string
  openaiBaseUrl?: string
}

export function normalizeAddedProviders(
  raw: unknown,
  allowedIds: Iterable<string> = ADDABLE_PROVIDER_IDS,
): string[] {
  if (!Array.isArray(raw)) return []
  const allowed = new Set(allowedIds)
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of raw) {
    const id = typeof value === 'string' ? value.trim() : ''
    if (!id || !allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export function hasLegacyProviderConfig(config: ProviderLegacyConfig): boolean {
  if (config.hasKey) return true
  const model = (config.model || '').trim()
  if (model && !(config.defaultModels || []).includes(model)) return true
  if ((config.baseUrl || '').trim() || (config.openaiBaseUrl || '').trim()) return true
  return false
}

export interface ProviderVisibilityInput {
  addedProviders: Iterable<string>
  activeProvider: string
  legacy: Record<string, ProviderLegacyConfig | undefined>
}

export function isProviderVisible(id: string, input: ProviderVisibilityInput): boolean {
  if (!getProvider(id)) return false
  if (input.activeProvider === id) return true
  for (const added of input.addedProviders) {
    if (added === id) return true
  }
  const legacy = input.legacy[id]
  return legacy ? hasLegacyProviderConfig(legacy) : false
}
