import { timingSafeEqual } from 'node:crypto'
import type { Settings } from './config.js'
import { assertAllowedLlmBaseUrl } from './llm-egress.js'
import { buildRuntimeAllowedLlmBaseUrls, getProvider } from './provider-registry.js'

export function isAuthorizedModelConfigRequest(authorization: string | undefined, expectedToken: string): boolean {
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!actual || !expectedToken) return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expectedToken)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function resolveWebwrightModelConfig(settings: Settings) {
  const provider = getProvider(settings.active_provider)
  if (!provider || !settings.api_key || !settings.model) throw new Error('当前模型配置不完整')
  const baseUrl = settings.active_provider === 'custom'
    ? settings.openai_base_url_custom
    : provider.webwright.baseUrl
  if (!baseUrl) throw new Error('OpenAI Chat Completions 兼容接口未配置')
  return {
    provider_id: settings.active_provider,
    protocol: provider.webwright.protocol,
    model_class: provider.webwright.modelClass,
    base_url: assertAllowedLlmBaseUrl(
      baseUrl,
      buildRuntimeAllowedLlmBaseUrls(settings.base_url_custom, settings.openai_base_url_custom),
    ),
    model: settings.model,
    api_key: settings.api_key,
    structured_output: provider.webwright.structuredOutput,
  }
}
