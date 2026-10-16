import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { AssistantCheckpoint, ClaudeConversationSessions, ClaudeSession, AsyncQueue } from '../claude-session.js'
import type { Message } from '../works-store.js'

const sessions: ClaudeSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.close() })

const message = (id: string, role: string, text: string): Message => ({ id, work_id: 'test-work', role, content: [{ type: 'text', text }], created_at: '' })

function runtime() {
  const output = new AsyncQueue<SDKMessage>()
  const prompts: string[] = []
  const close = vi.fn(() => output.end())
  const factory = vi.fn((input: AsyncIterable<SDKUserMessage>) => {
    void (async () => {
      for await (const message of input) {
        prompts.push(message.message.content as string)
        output.push({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: prompts.length * 0.01 } as SDKMessage)
      }
    })()
    return { [Symbol.asyncIterator]: () => output[Symbol.asyncIterator](), close, setMcpServers: async () => ({ added: [], removed: [], errors: {} }) } as unknown as Query
  })
  const session = new ClaudeSession(factory)
  sessions.push(session)
  return { session, factory, prompts, close, output }
}

async function collect(session: ClaudeSession, prompt: string) {
  const result = []
  for await (const message of session.turn(prompt, { type: 'sdk', name: 'test', instance: {} } as any)) result.push(message)
  return result
}

describe('persistent Claude sessions', () => {
  it('only reuses the matching conversation history and current configuration', async () => {
    const pool = new ClaudeConversationSessions()
    const { session } = runtime()
    const input = [message('u1', 'user', 'first')]
    const checkpoint = new AssistantCheckpoint()
    checkpoint.observe({ type: 'text_delta', content: 'answer' })
    const next = [...input, message('a1', 'assistant', 'answer'), message('u2', 'user', 'next')]
    pool.put('test-work', 'config-a', input, session)
    pool.complete('test-work', session, input, checkpoint)
    expect(pool.get('other-work', 'config-a', next)).toBeUndefined()
    expect(pool.get('test-work', 'config-a', next)).toBe(session)
    expect(pool.get('test-work', 'config-b', next)).toBeUndefined()
    expect(session.alive).toBe(false)
    pool.closeAll()
  })

  it.each(['history', 'assistant', 'truncate'])('rebuilds after %s edits', kind => {
    const pool = new ClaudeConversationSessions()
    const { session } = runtime()
    const input = [message('u1', 'user', 'first')]
    const checkpoint = new AssistantCheckpoint()
    checkpoint.observe({ type: 'text_delta', content: 'answer' })
    const next = [...input, message('a1', 'assistant', 'answer'), message('u2', 'user', 'next')]
    pool.put('test-work', 'config', input, session)
    pool.complete('test-work', session, input, checkpoint)
    if (kind === 'history') next[0] = message('u1', 'user', 'edited')
    if (kind === 'assistant') next[1] = message('a1', 'assistant', 'edited')
    if (kind === 'truncate') next.splice(0, 1)
    expect(pool.get('test-work', 'config', next)).toBeUndefined()
    expect(session.alive).toBe(false)
    pool.closeAll()
  })

  it('matches persisted tool content while excluding display timings', () => {
    const checkpoint = new AssistantCheckpoint()
    checkpoint.observe({ type: 'text_delta', content: 'start' })
    checkpoint.observe({ type: 'tool_call_start', id: 't1', name: 'mcp__weworker__list_files', args: { directory: '.' } })
    checkpoint.observe({ type: 'tool_call_result', id: 't1', result: '[]', isError: false })
    checkpoint.observe({ type: 'text_delta', content: 'done' })
    const saved = message('a1', 'assistant', 'start')
    saved.content.push({ type: 'tool_use', id: 't1', name: 'list_files', args: { directory: '.' }, result: '[]', status: 'done', thinkMs: 1 })
    saved.content.push({ type: 'text', text: 'done' }, { type: 'timing', totalMs: 3, llmMs: 2, execMs: 1, steps: 1 })
    expect(checkpoint.matches(saved)).toBe(true)
    ;(saved.content[1] as any).result = 'edited'
    expect(checkpoint.matches(saved)).toBe(false)
  })

  it('releases idle sessions after ten minutes and cleans everything at shutdown', () => {
    vi.useFakeTimers()
    const pool = new ClaudeConversationSessions()
    const a = runtime(), b = runtime()
    const input = [message('u1', 'user', 'first')]
    pool.put('a', 'config', input, a.session)
    pool.complete('a', a.session, input, new AssistantCheckpoint())
    pool.put('b', 'config', input, b.session)
    vi.advanceTimersByTime(10 * 60_000)
    expect(a.session.alive).toBe(false)
    expect(b.session.alive).toBe(true)
    pool.closeAll()
    expect(b.session.alive).toBe(false)
    vi.useRealTimers()
  })

  it('refreshes the MCP server instance before a reused turn', async () => {
    const { session, factory } = runtime()
    const handle = factory.mock.results[0].value
    const change = vi.spyOn(handle, 'setMcpServers')
    await collect(session, 'first')
    expect(change.mock.calls[0][0]).toEqual({})
    expect(change.mock.calls[1][0]).toHaveProperty('weworker')
  })
  it('uses one query for multiple turns and sends only supplied incremental prompts', async () => {
    const { session, factory, prompts } = runtime()
    expect(await collect(session, 'first')).toHaveLength(1)
    expect(await collect(session, 'second')).toHaveLength(1)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(prompts).toEqual(['first', 'second'])
    expect(session.alive).toBe(true)
  })
  it('keeps concurrent conversations isolated', async () => {
    const a = runtime(), b = runtime()
    await Promise.all([collect(a.session, 'conversation A'), collect(b.session, 'conversation B')])
    expect(a.prompts).toEqual(['conversation A'])
    expect(b.prompts).toEqual(['conversation B'])
  })
  it('closes an abandoned turn without leaving its process running', async () => {
    const { session, close } = runtime()
    for await (const _ of session.turn('cancel', { type: 'sdk', name: 'test', instance: {} } as any)) break
    expect(close).toHaveBeenCalledOnce()
    expect(session.alive).toBe(false)
  })
  it('detects an idle process exit and rejects reuse', async () => {
    const { session, output } = runtime()
    await collect(session, 'first')
    output.end()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(session.alive).toBe(false)
    await expect(collect(session, 'second')).rejects.toThrow()
  })

  it('unblocks a pending request when aborted and releases its resources once', async () => {
    const output = new AsyncQueue<SDKMessage>()
    const release = vi.fn()
    const close = vi.fn(() => output.end())
    const session = new ClaudeSession(() => ({
      [Symbol.asyncIterator]: () => output[Symbol.asyncIterator](), close,
    }) as unknown as Query, release)
    sessions.push(session)
    const controller = new AbortController()
    const iterator = session.turn('pending', {} as any, controller.signal, false)
    const pending = iterator.next()
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
    expect(close).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    session.close()
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects a second active turn without terminating the first', async () => {
    const output = new AsyncQueue<SDKMessage>()
    const session = new ClaudeSession(() => ({
      [Symbol.asyncIterator]: () => output[Symbol.asyncIterator](), close: () => output.end(),
    }) as unknown as Query)
    sessions.push(session)
    const first = session.turn('first', {} as any, undefined, false)
    const pending = first.next()
    await expect(collect(session, 'second')).rejects.toThrow('active request')
    expect(session.alive).toBe(true)
    output.push({ type: 'result', subtype: 'success', total_cost_usd: 0 } as SDKMessage)
    expect((await pending).done).toBe(false)
    await first.next()
  })
  it('does not double count cumulative session cost', async () => {
    const { session } = runtime()
    const first = await collect(session, 'first'), second = await collect(session, 'second')
    expect((first[0] as any).total_cost_usd).toBeCloseTo(0.01)
    expect((second[0] as any).total_cost_usd).toBeCloseTo(0.01)
  })
})
