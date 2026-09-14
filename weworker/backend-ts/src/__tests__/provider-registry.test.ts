import { describe, expect, it, vi } from 'vitest'
import { getProvider } from '../provider-registry.js'
import { listProviderModels, probeProviderProtocol } from '../provider-model-services.js'

function provider(id: string) {
  const value = getProvider(id)
  if (!value) throw new Error(`missing provider ${id}`)
  return value
}

describe('provider model catalog', () => {
  it('uses only the official response when the remote catalog succeeds', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'deepseek-remote-a' }, { id: 'deepseek-remote-b' }],
    }), { status: 200 })) as typeof fetch
    const result = await listProviderModels({
      provider: provider('deepseek'), apiKey: 'secret',
    }, fetchImpl)
    expect(result).toEqual({ models: ['deepseek-remote-a', 'deepseek-remote-b'], source: 'remote' })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.anything())
  })

  it('falls back to built-in choices only when the remote catalog fails', async () => {
    const remoteBody = JSON.stringify({ error: { message: 'offline' }, request_id: 'req-catalog' })
    const fetchImpl = vi.fn(async () => new Response(remoteBody, { status: 503, statusText: 'Service Unavailable' })) as typeof fetch
    const result = await listProviderModels({
      provider: provider('deepseek'), apiKey: 'secret',
    }, fetchImpl)
    expect(result.source).toBe('fallback')
    expect(result.models).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    expect(result.warning).toBe(`OpenAI 接口：HTTP 503 Service Unavailable\n${remoteBody}`)
  })

  it('keeps the failed remote response when another custom catalog succeeds', async () => {
    const remoteBody = '<html>upstream unavailable</html>'
    const fetchImpl = vi.fn(async (input: string | URL | Request) => String(input).includes('/anthropic/')
      ? new Response(remoteBody, { status: 502, statusText: 'Bad Gateway' })
      : new Response(JSON.stringify({ data: [{ id: 'openai-model' }] }), { status: 200 })) as typeof fetch
    const result = await listProviderModels({
      provider: provider('custom'),
      apiKey: 'secret',
      anthropicBaseUrl: 'https://gateway.example/anthropic',
      openaiBaseUrl: 'https://gateway.example/openai/v1',
    }, fetchImpl)
    expect(result).toEqual({
      models: ['openai-model'],
      source: 'remote',
      warning: `Anthropic 接口：HTTP 502 Bad Gateway\n${remoteBody}`,
    })
  })

  it('treats an empty successful response as authoritative', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch
    await expect(listProviderModels({
      provider: provider('deepseek'), apiKey: 'secret',
    }, fetchImpl)).resolves.toEqual({ models: [], source: 'remote' })
  })

  it('merges successful custom Anthropic and OpenAI catalogs', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify({
      data: String(input).includes('/anthropic/v1/models')
        ? [{ id: 'shared' }, { id: 'anthropic-only' }]
        : [{ id: 'shared' }, { id: 'openai-only' }],
    }), { status: 200 })) as typeof fetch
    const result = await listProviderModels({
      provider: provider('custom'),
      apiKey: 'secret',
      anthropicBaseUrl: 'https://gateway.example/anthropic',
      openaiBaseUrl: 'https://gateway.example/openai/v1',
    }, fetchImpl)
    expect(result).toEqual({ models: ['shared', 'anthropic-only', 'openai-only'], source: 'remote' })
  })
})

describe('provider protocol probe', () => {
  it('probes the selected model through the Webwright protocol without catalog validation', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response('{}', { status: 200 }))
    const fetchImpl = fetchMock as typeof fetch
    const result = await probeProviderProtocol({
      provider: provider('deepseek'),
      apiKey: 'secret',
      model: 'deepseek-chat',
      target: 'webwright',
    }, fetchImpl)
    expect(result).toEqual({
      ok: true,
      target: 'webwright',
      protocol: 'openai_chat_completions',
      model: 'deepseek-chat',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
    })
  })

  it('returns a stable authentication error without changing configuration', async () => {
    const remoteBody = JSON.stringify({ error: { message: 'bad key' }, request_id: 'req-probe' })
    const fetchImpl = vi.fn(async () => new Response(remoteBody, { status: 401, statusText: 'Unauthorized' })) as typeof fetch
    const result = await probeProviderProtocol({
      provider: provider('anthropic'),
      apiKey: 'bad',
      model: 'claude-current',
      target: 'weworker',
    }, fetchImpl)
    expect(result).toMatchObject({
      ok: false,
      error: 'auth_failed',
      model: 'claude-current',
      detail: `HTTP 401 Unauthorized\n${remoteBody}`,
    })
  })
})
