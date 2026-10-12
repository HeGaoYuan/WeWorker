import express from 'express'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '../config.js'
import { getProvider } from '../provider-registry.js'
import { probeMainConnection } from '../provider-model-services.js'
import { createExplorationModelService, explorationSettingsPatch, registerExplorationModelRoutes } from '../exploration-model-settings.js'

const settings = (patch: Partial<Settings> = {}) => ({
  active_provider: 'custom', api_key: 'fixture-main-key', model: 'fixture-model',
  base_url_custom: 'https://example.com/proxy', openai_base_url_custom: '',
  exploration_base_url: '', exploration_api_key: '', exploration_model: '', exploration_use_main_key: true,
  ...patch,
} as Settings)
const chatResponse = () => Response.json({ choices: [{ message: { content: '{"ok":true}' } }] })
const toolResponse = () => Response.json({ content: [{ type: 'tool_use', name: 'connection_check', input: { ok: true } }] })
const anthropicTextResponse = () => Response.json({ content: [{ type: 'text', text: '{"ok":true}' }] })
const mainInput = () => ({ provider: getProvider('custom')!, apiKey: 'fixture-main-key', model: 'fixture-model', anthropicBaseUrl: 'https://example.com/proxy', autoAuth: true })

describe('main model onboarding', () => {
  it('verifies a tool call using only the Claude Code address', async () => {
    const fetchMock = vi.fn(async () => toolResponse())
    expect(await probeMainConnection(mainInput(), fetchMock)).toMatchObject({ ok: true, auth_type: 'auth_token' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.com/proxy/v1/messages')
    expect(JSON.parse(options.body as string).tool_choice).toEqual({ type: 'tool', name: 'connection_check' })
    expect(options.redirect).toBe('error')
  })

  it('retries the other auth header only after an authentication failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('invalid key', { status: 401 })).mockResolvedValueOnce(toolResponse())
    expect(await probeMainConnection(mainInput(), fetchMock)).toMatchObject({ ok: true, auth_type: 'api_key' })
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('x-api-key')).toBe('fixture-main-key')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).has('authorization')).toBe(false)
  })

  it.each([404, 429, 500])('does not rotate auth on HTTP %s', async status => {
    const fetchMock = vi.fn(async () => new Response('failure', { status }))
    expect((await probeMainConnection(mainInput(), fetchMock)).ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('honors an explicit auth choice and redacts reflected keys', async () => {
    const fetchMock = vi.fn(async () => new Response('invalid fixture-main-key', { status: 401 }))
    const result = await probeMainConnection({ ...mainInput(), autoAuth: false }, fetchMock)
    expect(result.detail).not.toContain('fixture-main-key')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['{}', '<html>OK</html>', '{"content":[{"type":"text","text":"hello"}]}'])('rejects false positive HTTP success: %s', async body => {
    expect(await probeMainConnection(mainInput(), vi.fn(async () => new Response(body)))).toMatchObject({ ok: false, error: 'protocol_mismatch' })
  })

  it('probes DeepSeek main models without forced tool_choice', async () => {
    const fetchMock = vi.fn(async () => anthropicTextResponse())
    expect(await probeMainConnection({
      provider: getProvider('deepseek')!,
      apiKey: 'fixture-deepseek-key',
      model: 'deepseek-v4-flash',
    }, fetchMock)).toMatchObject({ ok: true, protocol: 'anthropic_messages', model: 'deepseek-v4-flash' })
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/anthropic/v1/messages')
    const body = JSON.parse(options.body as string)
    expect(body).toMatchObject({ model: 'deepseek-v4-flash' })
    expect(body).not.toHaveProperty('tool_choice')
    expect(body).not.toHaveProperty('tools')
  })

  it('falls back to a text probe when a custom Anthropic endpoint rejects tool_choice', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        error: {
          message: 'Thinking mode does not support this tool_choice',
          type: 'invalid_request_error',
        },
      }, { status: 400 }))
      .mockResolvedValueOnce(anthropicTextResponse())

    expect(await probeMainConnection(mainInput(), fetchMock)).toMatchObject({ ok: true, auth_type: 'auth_token' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(firstBody.tool_choice).toEqual({ type: 'tool', name: 'connection_check' })
    expect(secondBody).not.toHaveProperty('tool_choice')
    expect(secondBody).not.toHaveProperty('tools')
  })
})

describe('exploration connection preparation', () => {
  it('reuses the exact address, deduplicates checks and invalidates success after model or key changes', async () => {
    const fetchMock = vi.fn(async () => chatResponse())
    const service = createExplorationModelService(fetchMock)
    await Promise.all([service.check(settings()), service.check(settings())])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://example.com/proxy/chat/completions')
    await service.check(settings())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await service.check(settings({ model: 'other-model' }))
    await service.check(settings({ api_key: 'fixture-changed-key' }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(service.status(settings()))).not.toContain('fixture-main-key')
  })

  it.each(['{}', '<html>OK</html>', '{"choices":[{"message":{"content":"{}"}}]}'])('rejects invalid structured responses: %s', async body => {
    const service = createExplorationModelService(vi.fn(async () => new Response(body)))
    expect(await service.check(settings())).toMatchObject({ ok: false, error: 'protocol_mismatch' })
    expect(service.status(settings()).status).toBe('pending')
  })

  it.each([['TimeoutError', 'timeout'], ['TypeError', 'network_error']])('keeps %s distinct from protocol errors and allows retry', async (name, error) => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(Object.assign(new Error('fixture connection failed'), { name })).mockResolvedValueOnce(chatResponse())
    const service = createExplorationModelService(fetchMock)
    expect(await service.check(settings())).toMatchObject({ ok: false, error })
    expect(await service.check(settings())).toMatchObject({ ok: true })
  })

  it('saves an explicit address without a connection mode or changing the main configuration', () => {
    const patch = explorationSettingsPatch({ base_url: 'https://example.org/v1/', use_main_key: true, model: '' })
    expect(patch).toMatchObject({ exploration_base_url: 'https://example.org/v1', exploration_use_main_key: true, exploration_api_key: '' })
    expect(patch).not.toHaveProperty('api_key')
    expect(patch).not.toHaveProperty('base_url_custom')
  })

  it.each(['https://example.com/v1/chat/completions', 'https://example.com/?token=fixture', 'file:///tmp/fixture'])('rejects invalid exploration addresses: %s', base_url => {
    expect(() => explorationSettingsPatch({ base_url, use_main_key: true, model: '' })).toThrow()
  })
})

async function withRoutes(upstream: typeof fetch, run: (url: string, get: () => Settings, set: (patch: Partial<Settings>) => void) => Promise<void>) {
  let current = settings()
  const app = express()
  app.use(express.json())
  registerExplorationModelRoutes(app, { getSettings: () => current, updateSettings: patch => (current = { ...current, ...patch }), fetchImpl: upstream })
  const server = app.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/settings/exploration-model`, () => current, patch => { current = { ...current, ...patch } })
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('exploration settings API', () => {
  it('returns an editable suggestion without persisting it or requiring main credentials', async () => {
    const upstream = vi.fn(async () => chatResponse())
    await withRoutes(upstream, async (url, get, set) => {
      set({ api_key: '', model: '' })
      const before = { ...get() }
      const data = await (await fetch(url)).json()
      expect(data).toMatchObject({ base_url: '', candidate_url: 'https://example.com/proxy/v1', suggested: true })
      expect(data).not.toHaveProperty('mode')
      expect(get()).toEqual(before)
      expect(upstream).not.toHaveBeenCalled()
    })
  })

  it('saves an independently verified service and never returns a plaintext key', async () => {
    await withRoutes(vi.fn(async () => chatResponse()), async (url, get) => {
      const response = await post(url, { base_url: 'https://example.org/v1/', api_key: 'fixture-independent-key', use_main_key: false, model: 'other-model' })
      const data = await response.json()
      expect(data).toMatchObject({ ok: true, status: 'independent', has_key: true, configured_model: 'other-model', base_url: 'https://example.org/v1' })
      expect(JSON.stringify(data)).not.toContain('fixture-independent-key')
      expect(get()).toMatchObject({ api_key: 'fixture-main-key', model: 'fixture-model', exploration_api_key: 'fixture-independent-key' })
    })
  })

  it('does not save failed checks', async () => {
    await withRoutes(vi.fn(async () => new Response('invalid key', { status: 401 })), async (url, get, set) => {
      set({ exploration_base_url: 'https://example.com/saved' })
      const before = { ...get() }
      const response = await post(url, { base_url: 'https://example.org/v1', use_main_key: true, model: '' })
      expect(await response.json()).toMatchObject({ ok: false, error: 'auth_failed' })
      expect(get()).toEqual(before)
    })
  })

  it('rejects stale verification when the main configuration changes during a request', async () => {
    let release!: (value: Response) => void
    let started!: () => void
    const start = new Promise<void>(resolve => { started = resolve })
    const upstream = vi.fn(() => { started(); return new Promise<Response>(resolve => { release = resolve }) })
    await withRoutes(upstream, async (url, get, set) => {
      const response = post(url, { base_url: 'https://example.org/v1', use_main_key: true, model: '' })
      await start
      set({ model: 'changed-model' })
      release(chatResponse())
      expect((await response).status).toBe(409)
      expect(get().exploration_base_url).toBe('')
    })
  })
})
