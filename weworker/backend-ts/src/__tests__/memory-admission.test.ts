import { describe, expect, it } from 'vitest'
import {
  admitMemoryCandidate,
  extractLedgerWebcliHits,
} from '../memory/memory-admission.js'
import type { MemoryUpdateCandidate } from '../memory/memory-types.js'

const adapters = [
  { id: 'billing.example.com', name: '费用管理示例', match: ['billing.example.com'] },
  { id: 'support.example.com', name: '支持工单示例', match: ['support.example.com'] },
  { id: 'xiaohongshu.com', name: '小红书', match: ['xiaohongshu.com'] },
]

describe('memory admission (candidate-first)', () => {
  it('extracts webcli tools from PowerShell ledger without storing command semantics beyond tool id', () => {
    const hits = extractLedgerWebcliHits([{
      name: 'PowerShell',
      args: { command: 'webcli call support.example.com.my_todo --output-format=json' },
      status: 'done',
    }, {
      name: 'PowerShell',
      args: { command: 'webcli call support.example.com.detail --mode=req' },
      status: 'done',
    }])
    expect(hits).toEqual([
      { tool: 'support.example.com.my_todo', adapterId: 'support.example.com', ok: true },
      { tool: 'support.example.com.detail', adapterId: 'support.example.com', ok: true },
    ])
  })

  it('admits declarative site_operation as provisional without NL matching', () => {
    const candidate: MemoryUpdateCandidate = {
      action: 'create',
      memory_type: 'site_operation',
      key: 'reimburse',
      content: '先费用归属再发票',
      facts: { declarative: true },
      scope: { site: 'billing.example.com' },
      confidence: 0.55,
    }
    const result = admitMemoryCandidate({
      candidate,
      baseScope: { user: 'local' },
      adapters,
      toolCalls: [],
      turnSucceeded: true,
      // Message would NOT match "费用管理示例" without space — must still admit.
    })
    expect(result).toMatchObject({
      ok: true,
      verification: 'provisional',
      scope: { user: 'local', site: 'billing.example.com' },
    })
  })

  it('rejects high-confidence site_operation with no tools (fake verified)', () => {
    const result = admitMemoryCandidate({
      candidate: {
        action: 'create',
        memory_type: 'site_operation',
        key: 'guess',
        content: '推测流程',
        scope: { site: 'billing.example.com' },
        confidence: 0.95,
      },
      baseScope: { user: 'local' },
      adapters,
      toolCalls: [],
      turnSucceeded: true,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('site_evidence_insufficient')
  })

  it('admits ledger site_operation when ≥2 successful webcli extracts exist', () => {
    const result = admitMemoryCandidate({
      candidate: {
        action: 'create',
        memory_type: 'site_operation',
        key: 'itsm_flow',
        content: '先 my_todo 再 detail',
        scope: { site: 'support.example.com' },
        confidence: 0.9,
      },
      baseScope: { user: 'local' },
      adapters,
      toolCalls: [{
        name: 'PowerShell',
        args: { command: 'webcli call support.example.com.my_todo' },
        status: 'done',
      }, {
        name: 'PowerShell',
        args: { command: 'webcli call support.example.com.detail' },
        status: 'done',
      }],
      turnSucceeded: true,
    })
    expect(result).toMatchObject({ ok: true, verification: 'ledger' })
  })

  it('rejects disabled site even with declarative flag', () => {
    const result = admitMemoryCandidate({
      candidate: {
        action: 'create',
        memory_type: 'site_operation',
        key: 'xhs',
        content: '搜索笔记',
        facts: { declarative: true },
        scope: { site: 'xiaohongshu.com' },
        confidence: 0.5,
      },
      baseScope: { user: 'local' },
      adapters,
      enabledAdapterIds: new Set(['billing.example.com', 'support.example.com']),
      toolCalls: [],
      turnSucceeded: true,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('disabled_site')
  })

  it('does not use userMessage fuzzy match to invent site', () => {
    const result = admitMemoryCandidate({
      candidate: {
        action: 'create',
        memory_type: 'site_operation',
        key: 'no_site',
        content: '流程',
        confidence: 0.5,
      },
      baseScope: { user: 'local' },
      adapters,
      toolCalls: [],
      turnSucceeded: true,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('missing_site')
  })
})
