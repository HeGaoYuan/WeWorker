import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../memory/memory-store.js'
import { processMemoryEvent } from '../memory/memory-lifecycle.js'

const stores: MemoryStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function createStore(): MemoryStore {
  const store = new MemoryStore(new DatabaseSync(':memory:'))
  stores.push(store)
  return store
}

describe('memory lifecycle', () => {
  it('allows implicit and site workflow events to enter AI analysis without explicit memory words', async () => {
    const store = createStore()
    const implicit = await processMemoryEvent({
      eventId: 'event-implicit-user',
      expectedMemoryType: 'user_usage',
      scope: { user: 'local' },
      store,
      candidate: {
        action: 'create',
        memory_type: 'user_usage',
        key: 'response_order',
        content: '用户希望先看结论，再看必要步骤。',
      },
    })
    const workflow = await processMemoryEvent({
      eventId: 'event-site-workflow',
      expectedMemoryType: 'site_operation',
      scope: { user: 'local', site: 'billing.example.com' },
      store,
      candidate: {
        action: 'create',
        memory_type: 'site_operation',
        key: 'expense_workflow',
        content: '团建报销使用固定提交流程。',
      },
    })

    expect(implicit.status).toBe('saved')
    expect(workflow.status).toBe('saved')
  })

  it('rejects an AI candidate whose type does not match the planned memory analysis', async () => {
    const store = createStore()
    const result = await processMemoryEvent({
      eventId: 'event-wrong-memory-type',
      expectedMemoryType: 'user_usage',
      scope: { user: 'local' },
      store,
      candidate: {
        action: 'create',
        memory_type: 'site_operation',
        key: 'wrong_type',
        content: '错误类型',
      },
    })

    expect(result.status).toBe('failed')
    expect(store.search({ query: '错误类型', scope: { user: 'local' } })).toHaveLength(0)
  })

  it('allows stable task outcomes to enter memory processing without treating ordinary chat as a memory request', async () => {
    const store = createStore()
    const candidate = {
      action: 'create' as const,
      memory_type: 'task_execution' as const,
      key: 'invoice_query_success',
      content: '发票查询任务已成功完成',
    }

    const taskResult = await processMemoryEvent({
      eventId: 'event-task-completed',
      scope: { user: 'local' },
      store,
      candidate,
    })
    const ordinaryChat = await processMemoryEvent({
      eventId: 'event-ordinary-chat',
      scope: { user: 'local' },
      store,
    })

    expect(taskResult.status).toBe('saved')
    expect(ordinaryChat.status).toBe('not_applicable')
  })

  it('extracts and applies a structured memory update once per event', async () => {
    const store = createStore()
    const candidate = {
      action: 'create' as const,
      memory_type: 'user_usage' as const,
      key: 'response_language',
      content: '用户默认使用中文回复',
      facts: { language: 'zh-CN' },
      confidence: 0.95,
    }

    const first = await processMemoryEvent({
      eventId: 'event-memory-1',
      scope: { user: 'local' },
      store,
      candidate,
    })
    const second = await processMemoryEvent({
      eventId: 'event-memory-1',
      scope: { user: 'local' },
      store,
      candidate,
    })

    expect(first.status).toBe('saved')
    expect(second.status).toBe('duplicate')
    expect(store.search({ query: '中文回复', scope: { user: 'local' } })).toHaveLength(1)
  })

  it('supports a failed event retry without duplicating the stored memory', async () => {
    const store = createStore()
    const first = await processMemoryEvent({
      eventId: 'event-memory-retry',
      scope: { user: 'local' },
      store,
      candidate: {
        action: 'create',
        memory_type: 'user_usage',
        key: 'api_key',
        content: 'api_key=temporary-invalid-value',
      },
    })
    const second = await processMemoryEvent({
      eventId: 'event-memory-retry',
      scope: { user: 'local' },
      store,
      candidate: {
        action: 'create',
        memory_type: 'user_usage',
        key: 'confirmation',
        content: '提交前需要确认',
      },
    })

    expect(first.status).toBe('failed')
    expect(second.status).toBe('saved')
    expect(store.search({ query: '确认', scope: { user: 'local' } })).toHaveLength(1)
  })

  it('does not allow an update to cross user scopes', async () => {
    const store = createStore()
    const existing = store.create({
      type: 'user_usage',
      key: 'language',
      content: '使用中文',
      scope: { user: 'user-a' },
      sourceEventId: 'event-scope-a',
    })
    const result = await processMemoryEvent({
      eventId: 'event-scope-b',
      scope: { user: 'user-b' },
      store,
      candidate: {
        action: 'update' as const,
        memory_type: 'user_usage' as const,
        key: 'language',
        content: '使用英文',
        related_memory_ids: [existing.id],
        scope: { user: 'user-a' },
      },
    })

    expect(result.status).toBe('failed')
    expect(store.get(existing.id)?.content).toBe('使用中文')
  })

  it('does not create a replacement when supersede scope validation fails', async () => {
    const store = createStore()
    const existing = store.create({
      type: 'user_usage',
      key: 'language',
      content: '使用中文',
      scope: { user: 'user-a' },
      sourceEventId: 'event-supersede-a',
    })
    const result = await processMemoryEvent({
      eventId: 'event-supersede-b',
      scope: { user: 'user-b' },
      store,
      candidate: {
        action: 'supersede' as const,
        memory_type: 'user_usage' as const,
        key: 'language',
        content: '使用英文',
        related_memory_ids: [existing.id],
        scope: { user: 'user-a' },
      },
    })

    expect(result.status).toBe('failed')
    expect(store.get(existing.id)?.status).toBe('active')
    expect(store.search({ query: '英文', scope: { user: 'user-b' } })).toHaveLength(0)
  })

  it('rejects sensitive candidates before writing them to memory', async () => {
    const store = createStore()
    const result = await processMemoryEvent({
      eventId: 'event-sensitive-candidate',
      scope: { user: 'local' },
      store,
      candidate: {
        action: 'create',
        memory_type: 'user_usage',
        key: 'api_key',
        content: 'api_key=sk-sensitive-value',
        scope: { user: 'local' },
      },
    })

    expect(result.status).toBe('failed')
    expect(store.search({ query: 'sensitive', scope: { user: 'local' } })).toHaveLength(0)
  })

  it('rejects common credential formats returned by the memory model', async () => {
    const store = createStore()
    const result = await processMemoryEvent({
      eventId: 'event-github-token-candidate',
      scope: { user: 'local' },
      store,
      candidate: {
        action: 'create',
        memory_type: 'user_usage',
        key: 'credential_note',
        content: '使用 ghp_abcdefghijklmnopqrstuvwxyz123456',
        scope: { user: 'local' },
      },
    })

    expect(result.status).toBe('failed')
    expect(store.search({ query: 'credential', scope: { user: 'local' } })).toHaveLength(0)
  })

  it('rolls back a memory write when event completion fails in the same transaction', () => {
    const store = createStore()
    expect(() => store.completeEventAtomically('missing-event', () => {
      store.create({
        type: 'user_usage',
        key: 'transaction_test',
        content: '这条记录必须随事件完成失败一起回滚。',
        scope: { user: 'local' },
        sourceEventId: 'missing-event',
      })
    })).toThrow('memory event is not processing')

    expect(store.search({ query: '事务 完成 回滚', scope: { user: 'local' } })).toHaveLength(0)
  })
})
