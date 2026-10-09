import type { Settings } from './config.js'
import { DEFAULT_CONTEXT_LIMIT } from './context-window.js'
import { normalizeLlmBaseUrl, type ProviderEntry } from './llm-egress.js'

// Public metadata only. Deployment credentials are resolved at runtime, never bundled.
export const BUILTIN_PROVIDER: ProviderEntry = {
  id: 'builtin',
  name: '内置模型',
  models: ['ark-code-latest'],
  defaultModel: 'ark-code-latest',
  weworker: { protocol: 'anthropic_messages', baseUrl: 'https://ark.cn-beijing.volces.com/api/plan' },
  webwright: { protocol: 'openai_chat_completions', modelClass: 'zhipu', baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', structuredOutput: 'openai_json_object' },
}

// Deployment supplies this model's endpoint and credential at runtime. Keeping
// its bundled metadata address-free avoids placing private service details in
// a distributed application.
export const BUILTIN_DEV_PROVIDER: ProviderEntry = {
  id: 'builtin_dev',
  name: '内置模型（开发）',
  models: ['deepseek-v4-flash'],
  defaultModel: 'deepseek-v4-flash',
  weworker: { protocol: 'anthropic_messages', baseUrl: '' },
  webwright: { protocol: 'anthropic_messages', modelClass: 'anthropic', baseUrl: '', structuredOutput: 'anthropic_json_schema' },
}

export const BUILTIN_PROVIDERS: ProviderEntry[] = [BUILTIN_PROVIDER, BUILTIN_DEV_PROVIDER]

export function isBuiltinProvider(id: string | undefined): boolean {
  return id === 'builtin' || id === 'builtin_dev'
}

export function getBuiltinApiKey(id: string, env: NodeJS.ProcessEnv = process.env): string {
  const variable = id === 'builtin' ? 'WEWORKER_BUILTIN_API_KEY'
    : id === 'builtin_dev' ? 'WEWORKER_BUILTIN_DEV_API_KEY' : ''
  return variable ? (env[variable] || '').trim() : ''
}

function getBuiltinRuntimeProvider(provider: ProviderEntry, env: NodeJS.ProcessEnv = process.env): ProviderEntry {
  if (provider.id !== 'builtin_dev') return provider
  const baseUrl = (env.WEWORKER_BUILTIN_DEV_BASE_URL || '').trim()
  if (!baseUrl) throw new Error('内置模型服务尚未配置，请联系应用提供方或使用其他模型')
  const normalized = normalizeLlmBaseUrl(baseUrl)
  return {
    ...provider,
    weworker: { ...provider.weworker, baseUrl: normalized },
    webwright: { ...provider.webwright, baseUrl: normalized },
  }
}

export function isBuiltinProviderConfigured(provider: ProviderEntry, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!getBuiltinApiKey(provider.id, env)) return false
  try {
    getBuiltinRuntimeProvider(provider, env)
    return true
  } catch {
    return false
  }
}

export function publicBuiltinProviders(providers: ProviderEntry[], env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(providers.filter(p => isBuiltinProvider(p.id)).map(p => [p.id, {
    has_key: isBuiltinProviderConfigured(p, env),
    model: p.defaultModel,
    context_limit: DEFAULT_CONTEXT_LIMIT,
    readonly: true,
  }]))
}

export function builtinProviderAccess(provider: ProviderEntry, env: NodeJS.ProcessEnv = process.env) {
  if (!isBuiltinProvider(provider.id)) throw new Error('不是内置模型')
  const apiKey = getBuiltinApiKey(provider.id, env)
  if (!apiKey) throw new Error('内置模型服务尚未配置，请联系应用提供方或使用其他模型')
  const runtimeProvider = getBuiltinRuntimeProvider(provider, env)
  return {
    provider: runtimeProvider,
    apiKey,
    model: runtimeProvider.defaultModel,
    anthropicBaseUrl: runtimeProvider.weworker.baseUrl,
    openaiBaseUrl: runtimeProvider.webwright.baseUrl,
    anthropicAuthType: runtimeProvider.id === 'builtin' ? 'auth_token' as const : 'api_key' as const,
  }
}

export function activateBuiltinProvider(provider: ProviderEntry, env: NodeJS.ProcessEnv = process.env): Partial<Settings> {
  const access = builtinProviderAccess(provider, env)
  return {
    active_provider: access.provider.id,
    active_model_configuration: '',
    active_auth_type: access.anthropicAuthType,
    // Only the selection is persisted. The deployment credential stays in memory.
    api_key: '',
    base_url: '',
    base_url_is_full: false,
    model: access.provider.defaultModel,
    context_limit: DEFAULT_CONTEXT_LIMIT,
  }
}

export function resolveBuiltinSettings(settings: Settings, providers: ProviderEntry[], env: NodeJS.ProcessEnv = process.env): Settings {
  if (!isBuiltinProvider(settings.active_provider)) return settings
  const provider = providers.find(p => p.id === settings.active_provider)
  let access: ReturnType<typeof builtinProviderAccess> | undefined
  try {
    if (provider) access = builtinProviderAccess(provider, env)
  } catch {
    access = undefined
  }
  return {
    ...settings,
    // Never reuse a stale saved key or address, especially when a profile excludes the provider.
    api_key: access?.apiKey || '',
    base_url: access?.provider.weworker.baseUrl || '',
    base_url_is_full: false,
    model: access?.provider.defaultModel || '',
    active_auth_type: access?.anthropicAuthType || settings.active_auth_type,
    context_limit: DEFAULT_CONTEXT_LIMIT,
  }
}
