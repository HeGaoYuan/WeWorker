import { describe, expect, it } from 'vitest'
import {
  buildAllowedLlmBaseUrls,
  assertAllowedLlmBaseUrl,
  normalizeLlmBaseUrl,
} from '../llm-egress.js'

const provider = (id: string, anthropicBaseUrl: string, webwrightBaseUrl = anthropicBaseUrl) => ({
  id,
  name: id,
  models: ['model'],
  defaultModel: 'model',
  weworker: { protocol: 'anthropic_messages' as const, baseUrl: anthropicBaseUrl },
  webwright: { protocol: 'openai_chat_completions' as const, modelClass: 'openai_chat' as const, baseUrl: webwrightBaseUrl, structuredOutput: 'openai_json_object' as const },
})

describe('LLM egress allowlist', () => {
  it('normalizes base URLs without changing the path prefix', () => {
    expect(normalizeLlmBaseUrl('https://open.bigmodel.cn/api/anthropic/')).toBe('https://open.bigmodel.cn/api/anthropic')
    expect(normalizeLlmBaseUrl('http://127.0.0.1:11434/anthropic/')).toBe('http://127.0.0.1:11434/anthropic')
  })

  it('allows configured provider base URLs', () => {
    const allowed = buildAllowedLlmBaseUrls([
      provider('anthropic', 'https://api.anthropic.com'),
      provider('glm', 'https://open.bigmodel.cn/api/anthropic'),
    ])

    expect(assertAllowedLlmBaseUrl('https://api.anthropic.com', allowed)).toBe('https://api.anthropic.com')
    expect(assertAllowedLlmBaseUrl('https://open.bigmodel.cn/api/anthropic/', allowed)).toBe('https://open.bigmodel.cn/api/anthropic')
  })

  it('rejects endpoints that are not in the runtime allowlist', () => {
    const allowed = buildAllowedLlmBaseUrls([
      provider('anthropic', 'https://api.anthropic.com'),
    ])

    expect(() => assertAllowedLlmBaseUrl('https://attacker.example/collect', allowed)).toThrow(/not allowed/i)
    expect(() => assertAllowedLlmBaseUrl('http://127.0.0.1:9999', allowed)).toThrow(/not allowed/i)
    expect(() => assertAllowedLlmBaseUrl('http://127.0.0.1:8080', allowed)).toThrow(/not allowed/i)
  })

  it('allows HTTP and HTTPS custom endpoints when explicitly listed', () => {
    const allowed = buildAllowedLlmBaseUrls([], 'https://llm.example.com/anthropic, http://127.0.0.1:11434')

    expect(assertAllowedLlmBaseUrl('https://llm.example.com/anthropic', allowed)).toBe('https://llm.example.com/anthropic')
    expect(assertAllowedLlmBaseUrl('http://127.0.0.1:11434/', allowed)).toBe('http://127.0.0.1:11434')
    expect(() => assertAllowedLlmBaseUrl('https://not-listed.example.com', allowed)).toThrow(/not allowed/i)
  })

  it('rejects non-HTTP URL schemes', () => {
    expect(() => normalizeLlmBaseUrl('file:///tmp/model')).toThrow(/HTTP or HTTPS/)
  })
})
