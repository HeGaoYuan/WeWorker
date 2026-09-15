import { describe, expect, it } from 'vitest'
import {
  assembleContext,
  buildTurnEndContextSnapshot,
  createTurnContextCollector,
} from '../context/context-assembler.js'
import { createLongTermMemoryContext } from '../context/long-term-context.js'
import { createRuntimeContext } from '../context/runtime-context.js'
import { createWorkContext } from '../context/work-context.js'

describe('context providers', () => {
  it('assembles three independent providers without changing the SDK request', () => {
    const runtime = createRuntimeContext({
      systemPrompt: 'rules\nYou are WeWorker.',
      identityPrompt: 'You are WeWorker.',
      toolDefinitions: 'Read\nWrite',
      skillIndex: 'webcli: website operations',
      mcpDynamicTools: 'ask_user: request a choice',
    })
    const work = createWorkContext({ conversation: 'User: continue' })
    const longTerm = createLongTermMemoryContext({ recalledMemory: '' })

    const result = assembleContext({
      runtime,
      work,
      longTerm,
      sdkSystemPrompt: 'rules\nYou are WeWorker.',
      sdkPrompt: 'User: continue',
      contextLimit: 200_000,
    })

    expect(result.sdk).toEqual({
      system_prompt: 'rules\nYou are WeWorker.',
      prompt: 'User: continue',
    })
    expect(result.snapshot.phase).toBe('request_start')
    expect(result.snapshot.categories.map((category) => category.scope)).toContain('runtime')
    expect(result.snapshot.categories.map((category) => category.scope)).toContain('work')
    expect(result.snapshot.categories.map((category) => category.scope)).toContain('long_term')
  })

  it('creates a turn-end snapshot that includes this turn assistant context', () => {
    const start = assembleContext({
      runtime: createRuntimeContext({ systemPrompt: 'rules', identityPrompt: '' }),
      work: createWorkContext({ conversation: '你好' }),
      longTerm: createLongTermMemoryContext(),
      sdkSystemPrompt: 'rules',
      sdkPrompt: '你好',
      contextLimit: 1_000_000,
    }).snapshot
    const startConversation = start.categories.find((category) => category.id === 'conversation')!

    const end = buildTurnEndContextSnapshot(start, '你好，我已经完成当前回复。', 128)
    const endConversation = end.categories.find((category) => category.id === 'conversation')!

    expect(end.phase).toBe('turn_end')
    expect(end.actual_input_tokens).toBe(128)
    expect(endConversation.estimated_tokens).toBeGreaterThan(startConversation.estimated_tokens)
    expect(end.estimated_total_tokens).toBeGreaterThan(start.estimated_total_tokens)
    expect(start.phase).toBe('request_start')
  })

  it('collects one assistant turn and emits its end snapshot before done', () => {
    const start = assembleContext({
      runtime: createRuntimeContext({ systemPrompt: 'rules', identityPrompt: '' }),
      work: createWorkContext({ conversation: '执行查询' }),
      longTerm: createLongTermMemoryContext(),
      sdkSystemPrompt: 'rules',
      sdkPrompt: '执行查询',
    }).snapshot
    const collector = createTurnContextCollector(start)

    collector.observe({ type: 'text_delta', content: '正在处理。' })
    collector.observe({ type: 'tool_call_start', id: 'tool-1', name: 'Read', args: {} })
    collector.observe({ type: 'tool_call_start', id: 'tool-1', name: 'Read', args: { path: 'a.txt' } })
    collector.observe({ type: 'tool_call_result', id: 'tool-1', result: '完成' })
    collector.observe({ type: 'usage', usage: { total_input_tokens: 256 } })

    const events = collector.finish()

    expect(events.map((event) => event.type)).toEqual(['context_snapshot', 'done'])
    expect(events[0].context?.phase).toBe('turn_end')
    expect(events[0].context?.actual_input_tokens).toBe(256)
    expect(events[0].context?.estimated_total_tokens).toBeGreaterThan(start.estimated_total_tokens)
  })

  it('finishes an empty turn without mutating the request snapshot', () => {
    const start = assembleContext({
      runtime: createRuntimeContext({ systemPrompt: 'rules', identityPrompt: '' }),
      work: createWorkContext({ conversation: '停止' }),
      longTerm: createLongTermMemoryContext(),
      sdkSystemPrompt: 'rules',
      sdkPrompt: '停止',
    }).snapshot
    const startJson = JSON.stringify(start)

    const [end, done] = createTurnContextCollector(start).finish()

    expect(end.context.phase).toBe('turn_end')
    expect(end.context.actual_input_tokens).toBeUndefined()
    expect(end.context.estimated_total_tokens).toBe(start.estimated_total_tokens)
    expect(done.type).toBe('done')
    expect(JSON.stringify(start)).toBe(startJson)
  })
})
