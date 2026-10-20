import { describe, expect, it } from 'vitest'
import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { ChatSession, PromptQueue } from '../chat-session.js'

const steeringId = '11111111-1111-4111-8111-111111111111'
const lateId = '22222222-2222-4222-8222-222222222222'
const input = (text: string, uuid?: SDKUserMessage['uuid']): SDKUserMessage => ({ type: 'user', uuid, session_id: '', parent_tool_use_id: null, message: { role: 'user', content: text } })
const result = (error = false) => ({ type: 'result', is_error: error, subtype: error ? 'error_during_execution' : 'success' } as SDKMessage)

describe('streaming session steering boundaries', () => {
  it('fails if the CLI exits with an unconsumed steering message', async () => {
    const session = new ChatSession({ workId: 'fixture-work', fingerprint: 'fixture', queue: new PromptQueue(),
      query: { close() {}, async *[Symbol.asyncIterator]() { yield { type: 'system', subtype: 'init' } as SDKMessage; yield result() } },
      bindings: { workIdRef: { current: 'fixture-work' }, onAskUser: null, memory: { userPromptInjections: 0, postToolBatchInjections: 0 } },
    })
    const turn = session.runTurn(input('first'))
    await turn.next()
    session.steer(input('correction', steeringId), { id: 'steer', role: 'user' })
    await turn.next()
    await expect(turn.next()).rejects.toThrow('补充指令')
    expect(session.canSteer).toBe(false)
    session.close('test')
  })

  it('waits for a late submitted message after the original turn result', async () => {
    const queue = new PromptQueue()
    let session: ChatSession
    const query = {
      close() {},
      async *[Symbol.asyncIterator]() {
        yield { type: 'system', subtype: 'init' } as SDKMessage
        yield result()
        yield input('correction', steeringId) as SDKMessage
        yield result()
      },
    }
    session = new ChatSession({ workId: 'fixture-work', fingerprint: 'fixture', queue, query,
      bindings: { workIdRef: { current: 'fixture-work' }, onAskUser: null, memory: { userPromptInjections: 0, postToolBatchInjections: 0 } },
    })
    expect(session.canSteer).toBe(false)
    const turn = session.runTurn(input('first'))
    await turn.next()
    expect(session.steer(input('correction', steeringId), { id: 'steer', role: 'user', digest: 'fixture' })).toBe(true)
    expect((await turn.next()).value?.type).toBe('result')
    expect((await turn.next()).value?.type).toBe('user')
    expect((await turn.next()).value?.type).toBe('result')
    expect(session.canSteer).toBe(false)
    expect(session.steer(input('too late', lateId), { id: 'late', role: 'user' })).toBe(false)
    expect((await turn.next()).done).toBe(true)
    session.complete([{ id: 'first', role: 'user' }])
    expect(session.continues([{ id: 'first', role: 'user' }, { id: 'steer', role: 'user', digest: 'fixture' }, { id: 'reply', role: 'assistant' }, { id: 'next', role: 'user' }])).toBe(true)
    session.close('test')
  })

  it('terminates on an error even when steering has not been echoed', async () => {
    const session = new ChatSession({ workId: 'fixture-work', fingerprint: 'fixture', queue: new PromptQueue(),
      query: { close() {}, async *[Symbol.asyncIterator]() { yield { type: 'system', subtype: 'init' } as SDKMessage; yield result(true) } },
      bindings: { workIdRef: { current: 'fixture-work' }, onAskUser: null, memory: { userPromptInjections: 0, postToolBatchInjections: 0 } },
    })
    const turn = session.runTurn(input('first'))
    await turn.next()
    session.steer(input('correction', steeringId), { id: 'steer', role: 'user' })
    await turn.next()
    expect(session.canSteer).toBe(false)
    expect((await turn.next()).done).toBe(true)
    session.close('test')
  })
})
