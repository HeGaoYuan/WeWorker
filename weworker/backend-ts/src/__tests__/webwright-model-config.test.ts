import { describe, expect, it } from 'vitest'
import type { Settings } from '../config.js'
import { isAuthorizedModelConfigRequest, resolveWebwrightModelConfig } from '../webwright-model-config.js'

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    active_provider: 'glm',
    api_key: 'secret',
    model: 'glm-5.2',
    base_url_custom: '',
    openai_base_url_custom: '',
    ...overrides,
  } as Settings
}

describe('Webwright managed model config', () => {
  it('uses the provider-native Chat Completions base URL', () => {
    expect(resolveWebwrightModelConfig(settings())).toEqual({
      provider_id: 'glm',
      protocol: 'openai_chat_completions',
      model_class: 'zhipu',
      base_url: 'https://open.bigmodel.cn/api/coding/paas/v4',
      model: 'glm-5.2',
      api_key: 'secret',
      structured_output: 'openai_json_object',
    })
  })

  it('requires the custom Chat Completions base URL', () => {
    expect(() => resolveWebwrightModelConfig(settings({ active_provider: 'custom' }))).toThrow(/Chat Completions/)
    expect(resolveWebwrightModelConfig(settings({
      active_provider: 'custom',
      model: 'custom-model',
      openai_base_url_custom: 'https://gateway.example/openai/v1',
    })).base_url).toBe('https://gateway.example/openai/v1')
    expect(resolveWebwrightModelConfig(settings({
      active_provider: 'custom',
      model: 'custom-model',
      openai_base_url_custom: 'https://gateway.example/openai/v1',
    })).model_class).toBe('openai_chat')
  })

  it('passes through an unlisted configured model without catalog validation', () => {
    expect(resolveWebwrightModelConfig(settings({
      active_provider: 'deepseek',
      model: 'deepseek-chat',
    })).model).toBe('deepseek-chat')
  })

  it('accepts only the per-launch bearer token', () => {
    expect(isAuthorizedModelConfigRequest('Bearer launch-token', 'launch-token')).toBe(true)
    expect(isAuthorizedModelConfigRequest('Bearer wrong', 'launch-token')).toBe(false)
    expect(isAuthorizedModelConfigRequest(undefined, 'launch-token')).toBe(false)
    expect(isAuthorizedModelConfigRequest('Bearer launch-token', '')).toBe(false)
  })
})
