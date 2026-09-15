import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assembleContext } from '../context/context-assembler.js'
import { createLongTermMemoryContext, recallLongTermMemory } from '../context/long-term-context.js'
import { createRuntimeContext } from '../context/runtime-context.js'
import { createWorkContext } from '../context/work-context.js'
import { formatRecalledMemories, retrieveMemories } from '../memory/memory-retriever.js'
import { processMemoryEvent } from '../memory/memory-lifecycle.js'
import { MemoryStore } from '../memory/memory-store.js'

const stores: MemoryStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function createStore(): MemoryStore {
  const store = new MemoryStore(new DatabaseSync(':memory:'))
  stores.push(store)
  return store
}

describe('long-term memory retrieval', () => {
  it('persists memory from one conversation and injects it into a separate conversation', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-memory-cross-session-'))
    const databaseFile = path.join(directory, 'memory.db')
    const firstSession = new MemoryStore(new DatabaseSync(databaseFile))

    const firstResult = await processMemoryEvent(
      {
        eventId: 'cross-session-event-1',
        scope: { user: 'cross-session-user' },
        store: firstSession,
        candidate: {
          action: 'create' as const,
          memory_type: 'user_usage' as const,
          key: 'response_language',
          content: '用户默认使用中文回复',
          facts: { language: 'zh-CN' },
          scope: { user: 'cross-session-user' },
          confidence: 0.95,
        },
      },
    )
    firstSession.close()

    const secondSession = new MemoryStore(new DatabaseSync(databaseFile))
    const recalled = recallLongTermMemory({
      query: '请继续处理这项工作',
      scope: { user: 'cross-session-user' },
      store: secondSession,
    })
    const assembled = assembleContext({
      runtime: createRuntimeContext({ systemPrompt: 'rules', identityPrompt: '' }),
      work: createWorkContext({ conversation: '请继续处理这项工作' }),
      longTerm: recalled,
      sdkSystemPrompt: 'rules',
      sdkPrompt: '请继续处理这项工作',
    })

    expect(firstResult.status).toBe('saved')
    expect(recalled.recalled).toContain('用户默认使用中文回复')
    expect(assembled.sdk.prompt).toContain('[相关长期记忆]')
    expect(assembled.sdk.prompt).toContain('用户默认使用中文回复')
    secondSession.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('retrieves only active memories from the matching scope', () => {
    const store = createStore()
    store.create({
      type: 'user_usage',
      key: 'response_language',
      content: '用户默认使用中文回复',
      scope: { user: 'user-a' },
      sourceEventId: 'event-1',
    })
    const other = store.create({
      type: 'user_usage',
      key: 'response_language',
      content: '用户默认使用英文回复',
      scope: { user: 'user-b' },
      sourceEventId: 'event-2',
    })
    store.invalidate(other.id)

    const result = retrieveMemories(store, {
      query: '中文回复',
      scope: { user: 'user-a' },
      limit: 5,
    })

    expect(result.map((memory) => memory.content)).toEqual(['用户默认使用中文回复'])
  })

  it('formats recalled memory and injects it into the actual SDK prompt', () => {
    const recalled = formatRecalledMemories([
      {
        id: 'memory-1',
        type: 'user_usage',
        key: 'response_language',
        content: '用户默认使用中文回复',
      },
    ])
    const longTerm = createLongTermMemoryContext({ recalledMemory: recalled })
    const result = assembleContext({
      runtime: createRuntimeContext({ systemPrompt: 'rules', identityPrompt: '' }),
      work: createWorkContext({ conversation: '请继续' }),
      longTerm,
      sdkSystemPrompt: 'rules',
      sdkPrompt: '请继续',
    })

    expect(result.sdk.prompt).toContain('用户默认使用中文回复')
    expect(result.sdk.prompt).toContain('id=memory-1')
    expect(result.snapshot.categories.find((item) => item.id === 'long_term_memory')?.estimated_tokens).toBeGreaterThan(0)
  })

  it('degrades to an empty context when recall has no match', () => {
    const store = createStore()
    store.create({
      type: 'site_operation',
      key: 'invoice_submit',
      content: '提交发票前需要确认费用归属',
      scope: { user: 'user-a', site: 'costplus' },
      sourceEventId: 'event-3',
    })

    expect(recallLongTermMemory({
      query: '查询会议室',
      scope: { user: 'user-a', site: 'costplus' },
      store,
    }).recalled).toBe('')
  })
})
