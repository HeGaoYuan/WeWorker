import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createChatWarmupScheduler, shouldWarmupOnTextChange } from '../utils/chat-warmup.js'
import { warmupChat } from '../api/backend.js'

const originalFetch = global.fetch
const originalWindow = global.window

afterEach(() => {
  global.fetch = originalFetch
  global.window = originalWindow
})

describe('chat warm-up', () => {
  it('triggers only when an empty composer starts a model message', () => {
    assert.equal(shouldWarmupOnTextChange('', '查'), true)
    assert.equal(shouldWarmupOnTextChange('  ', '查询订单'), true)
    assert.equal(shouldWarmupOnTextChange('查', '查询'), false)
    assert.equal(shouldWarmupOnTextChange('', '   '), false)
    assert.equal(shouldWarmupOnTextChange('', '!dir'), false)
  })

  it('throttles warm-ups per conversation target', async () => {
    let clock = 0
    const sent = []
    const request = createChatWarmupScheduler({ send: async (...args) => { sent.push(args) }, now: () => clock, intervalMs: 1000 })
    assert.equal(request('work-a', { thinkingEffort: 'low' }), true)
    assert.equal(request('work-a', { thinkingEffort: 'low' }), false)
    assert.equal(request(null, { thinkingEffort: 'medium' }), true)
    clock = 1500
    assert.equal(request('work-a', { thinkingEffort: 'high' }), true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(sent, [
      ['work-a', { thinkingEffort: 'low' }],
      [null, { thinkingEffort: 'medium' }],
      ['work-a', { thinkingEffort: 'high' }],
    ])
  })

  it('ignores send failures', async () => {
    const request = createChatWarmupScheduler({ send: async () => { throw new Error('offline') } })
    assert.equal(request('work-a'), true)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('posts to the work or welcome warm-up endpoint', async () => {
    global.window = {}
    const calls = []
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) })
      return { ok: true, json: async () => ({ status: 'starting' }) }
    }
    assert.deepEqual(await warmupChat('work-a', { thinkingEffort: 'low', zcfRole: 'ignored' }), { status: 'starting' })
    await warmupChat(null, { thinkingEffort: 'medium', zcfRole: 'role-a', zcfMode: 'direct' })
    assert.equal(calls[0].url, 'http://127.0.0.1:8765/works/work-a/warmup')
    assert.deepEqual(calls[0].body, { thinkingEffort: 'low' })
    assert.equal(calls[1].url, 'http://127.0.0.1:8765/chat/warmup')
    assert.deepEqual(calls[1].body, { thinkingEffort: 'medium', zcfRole: 'role-a', zcfMode: 'direct' })
  })
})
