import { randomUUID } from 'node:crypto'
import type { Settings } from './config.js'
import { getProvider } from './provider-registry.js'
import { DEFAULT_CONTEXT_LIMIT, parseContextLimit } from './context-window.js'
import { isAnthropicAuthType, type AnthropicAuthType } from './anthropic-auth.js'
import { normalizeLlmUrlInput } from './llm-egress.js'

export interface ModelConfiguration {
  provider_id: string
  model: string
  api_key: string
  context_limit: number
  base_url: string
  base_url_is_full?: boolean
  openai_base_url: string
  openai_base_url_is_full?: boolean
  auth_type: AnthropicAuthType
}

export function createModelConfiguration(settings: Settings, providerId: string) {
  const provider = getProvider(providerId)
  if (!provider) throw new Error('请选择预置或自定义供应商')
  const id = `model-${randomUUID()}`
  const active = Object.values(settings.model_configurations || {})
    .find(configuration => configuration.provider_id === providerId && configuration.api_key)
  const legacyKey = providerId === 'anthropic' ? settings.api_key_anthropic
    : providerId === 'glm' ? settings.api_key_glm
      : providerId === 'deepseek' ? settings.api_key_deepseek
        : settings.api_key_custom
  const legacyBaseUrl = providerId === 'custom' ? settings.base_url_custom : provider.weworker.baseUrl
  const legacyOpenAiBaseUrl = providerId === 'custom' ? settings.openai_base_url_custom : provider.webwright.baseUrl
  const configuration: ModelConfiguration = {
    provider_id: providerId,
    model: provider.defaultModel,
    api_key: active?.api_key || legacyKey || '',
    context_limit: DEFAULT_CONTEXT_LIMIT,
    base_url: active?.base_url || legacyBaseUrl,
    base_url_is_full: providerId === 'custom' && (active ? active.base_url_is_full === true : settings.base_url_is_full_custom === true),
    openai_base_url: active?.openai_base_url ?? legacyOpenAiBaseUrl,
    openai_base_url_is_full: providerId === 'custom' && (active ? active.openai_base_url_is_full === true : settings.openai_base_url_is_full_custom === true),
    auth_type: active?.auth_type || (providerId === 'custom' ? settings.custom_auth_type : 'api_key'),
  }
  return { id, updates: { model_configurations: { ...settings.model_configurations, [id]: configuration } } }
}

export function getModelConfiguration(settings: Settings, id: string | undefined): ModelConfiguration | undefined {
  const configuration = id && Object.hasOwn(settings.model_configurations || {}, id)
    ? settings.model_configurations?.[id]
    : undefined
  return configuration && getProvider(configuration.provider_id) ? configuration : undefined
}

export function activateModelConfiguration(settings: Settings, id: string): Partial<Settings> {
  const configuration = getModelConfiguration(settings, id)
  if (!configuration || !getProvider(configuration.provider_id)) throw new Error('模型配置不存在')
  if (!configuration.api_key || !configuration.model || !configuration.base_url) throw new Error('请先保存 API Key、模型和 Claude Code 接口地址')
  return {
    active_model_configuration: id,
    active_provider: configuration.provider_id,
    api_key: configuration.api_key,
    model: configuration.model,
    base_url: configuration.base_url,
    base_url_is_full: configuration.base_url_is_full === true,
    context_limit: configuration.context_limit,
    active_auth_type: configuration.auth_type,
  }
}

export function updateModelConfiguration(settings: Settings, id: string, input: Record<string, unknown>): Partial<Settings> {
  const current = getModelConfiguration(settings, id)
  if (!current) throw new Error('模型配置不存在')
  const next = { ...current }
  if (current.provider_id === 'custom' && input.base_url_is_full !== undefined) {
    if (typeof input.base_url_is_full !== 'boolean') throw new Error('使用完整 URL 必须为布尔值')
    next.base_url_is_full = input.base_url_is_full
  }
  if (current.provider_id === 'custom' && input.openai_base_url_is_full !== undefined) {
    if (typeof input.openai_base_url_is_full !== 'boolean') throw new Error('使用完整 URL 必须为布尔值')
    next.openai_base_url_is_full = input.openai_base_url_is_full
  }
  for (const field of ['api_key', 'model', 'base_url', 'openai_base_url'] as const) {
    if (input[field] === undefined) continue
    if (typeof input[field] !== 'string') throw new Error(`${field} must be a string`)
    const value = input[field].trim()
    if (field === 'api_key') {
      if (value) next.api_key = value
    } else if (field === 'model') {
      if (!value) throw new Error('请输入模型名称')
      next.model = value
    } else if (current.provider_id === 'custom') {
      next[field] = field === 'base_url'
        ? normalizeLlmUrlInput(value, next.base_url_is_full ?? false)
        : !value ? '' : normalizeLlmUrlInput(value, next.openai_base_url_is_full ?? false)
    }
  }
  if (input.context_limit !== undefined) {
    const limit = parseContextLimit(input.context_limit)
    if (limit === null) throw new Error('上下文窗口请输入 1K 到 100M 之间的整数，可使用 K/M 单位')
    next.context_limit = limit
  }
  if (current.provider_id === 'custom' && input.base_url_is_full !== undefined && input.base_url === undefined && next.base_url) {
    normalizeLlmUrlInput(next.base_url, next.base_url_is_full ?? false)
  }
  if (current.provider_id === 'custom' && input.openai_base_url_is_full !== undefined && input.openai_base_url === undefined && next.openai_base_url) {
    normalizeLlmUrlInput(next.openai_base_url, next.openai_base_url_is_full ?? false)
  }
  if (input.auth_type !== undefined && current.provider_id === 'custom') {
    if (!isAnthropicAuthType(input.auth_type)) throw new Error('API Key 类型无效')
    next.auth_type = input.auth_type
  }
  const model_configurations = { ...settings.model_configurations, [id]: next }
  return {
    model_configurations,
    ...(settings.active_model_configuration === id
      ? activateModelConfiguration({ ...settings, model_configurations }, id)
      : {}),
  }
}

export function publicModelConfigurations(settings: Settings) {
  return Object.fromEntries(Object.entries(settings.model_configurations || {}).filter(([, configuration]) =>
    configuration && getProvider(configuration.provider_id),
  ).map(([id, configuration]) => {
    const { api_key, ...publicFields } = configuration
    return [id, { ...publicFields, has_key: Boolean(api_key), added: true, visible: true }]
  }))
}
