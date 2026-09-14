import { buildAllowedLlmBaseUrls, type ProviderEntry } from './llm-egress.js'

declare const __BUILD_PROVIDERS__: ProviderEntry[]

const DEV_PROVIDERS: ProviderEntry[] = [
  { id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'], defaultModel: 'claude-sonnet-4-6', weworker: { protocol: 'anthropic_messages', baseUrl: 'https://api.anthropic.com' }, webwright: { protocol: 'anthropic_messages', modelClass: 'anthropic', baseUrl: 'https://api.anthropic.com', structuredOutput: 'anthropic_json_schema' } },
  { id: 'glm', name: '智谱 coding plan', models: ['glm-5.2', 'glm-4.7'], defaultModel: 'glm-5.2', weworker: { protocol: 'anthropic_messages', baseUrl: 'https://open.bigmodel.cn/api/anthropic' }, webwright: { protocol: 'openai_chat_completions', modelClass: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', structuredOutput: 'openai_json_object' } },
  { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro'], defaultModel: 'deepseek-v4-flash', weworker: { protocol: 'anthropic_messages', baseUrl: 'https://api.deepseek.com/anthropic' }, webwright: { protocol: 'openai_chat_completions', modelClass: 'openai_chat', baseUrl: 'https://api.deepseek.com', structuredOutput: 'openai_json_object' } },
  { id: 'custom', name: '自定义', models: [], defaultModel: '', weworker: { protocol: 'anthropic_messages', baseUrl: '' }, webwright: { protocol: 'openai_chat_completions', modelClass: 'openai_chat', baseUrl: '', structuredOutput: 'openai_json_object' } },
]

export const PROVIDERS: ProviderEntry[] = typeof __BUILD_PROVIDERS__ !== 'undefined' ? __BUILD_PROVIDERS__ : DEV_PROVIDERS

export const PROVIDER_BASE_URLS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p.weworker.baseUrl])
)

export function getProvider(providerId: string): ProviderEntry | undefined {
  return PROVIDERS.find(provider => provider.id === providerId)
}

export const ALLOWED_PROVIDER_IDS = new Set(PROVIDERS.map(p => p.id))
export const ALLOWED_LLM_BASE_URLS = buildAllowedLlmBaseUrls(PROVIDERS)

export function buildRuntimeAllowedLlmBaseUrls(...extraBaseUrls: Array<string | undefined>): Set<string> {
  return buildAllowedLlmBaseUrls(PROVIDERS, extraBaseUrls.filter(Boolean).join(','))
}
