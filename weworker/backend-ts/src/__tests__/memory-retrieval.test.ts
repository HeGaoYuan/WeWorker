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
    expect(assembled.sdk.system_prompt).toContain('[相关长期记忆]')
    expect(assembled.sdk.system_prompt).toContain('用户默认使用中文回复')
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

  it('formats recalled memory and injects it into the actual SDK system prompt', () => {
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

    expect(result.sdk.system_prompt).toContain('用户默认使用中文回复')
    expect(result.sdk.system_prompt).toContain('id=memory-1')
    expect(result.snapshot.categories.find((item) => item.id === 'long_term_memory')?.estimated_tokens).toBeGreaterThan(0)
  })

  it('degrades to an empty context when recall has no match', () => {
    const store = createStore()
    store.create({
      type: 'task_execution',
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

  it('recalls task execution memories when natural-language queries contain paths and punctuation', () => {
    const store = createStore()
    store.create({
      type: 'task_execution',
      key: 'powershell_markdown_audit_report',
      content: 'PowerShell 读取 Markdown 文档，生成审计报告并写入 $env:TEMP。',
      scope: { user: 'user-a' },
      sourceEventId: 'event-path-query',
    })

    const query = '请再次完成 PowerShell Markdown 审计：读取 ROADMAP.md 和 docs\\memory_real_e2e_test_plan.md，生成报告并写入 $env:TEMP。'
    expect(store.search({ query, scope: { user: 'user-a' } })).toMatchObject([{
      key: 'powershell_markdown_audit_report',
    }])

    const recalled = recallLongTermMemory({ query, scope: { user: 'user-a' }, store })

    expect(recalled.recalled).toContain('powershell_markdown_audit_report')
  })

  it('maps historical site_operation rows to task_execution during reads', () => {
    const database = new DatabaseSync(':memory:')
    const store = new MemoryStore(database)
    stores.push(store)
    const now = new Date().toISOString()
    database.prepare(`
      INSERT INTO memories (
        id, type, key, content, facts_json,
        user_scope, project_scope, site_scope, extension_scope,
        status, confidence, source_event_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'active', ?, ?, ?, ?)
    `).run(
      'legacy-site-memory',
      'site_operation',
      'legacy_invoice_flow',
      '历史费控流程先选择费用归属，再上传发票。',
      '{}',
      'user-a',
      'billing.example.com',
      0.8,
      'legacy-event',
      now,
      now,
    )
    database.prepare(
      'INSERT INTO memory_fts (memory_id, key, content, facts_json) VALUES (?, ?, ?, ?)',
    ).run('legacy-site-memory', 'legacy_invoice_flow', '历史费控流程先选择费用归属，再上传发票。', '{}')

    expect(store.listActive({ type: 'task_execution', scope: { user: 'user-a', site: 'billing.example.com' } })).toMatchObject([{
      id: 'legacy-site-memory',
      type: 'task_execution',
      key: 'legacy_invoice_flow',
    }])
    expect(store.search({ query: '发票', scope: { user: 'user-a', site: 'billing.example.com' } })).toMatchObject([{
      type: 'task_execution',
    }])
  })
})
