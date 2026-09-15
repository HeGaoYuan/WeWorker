import { describe, expect, it } from 'vitest'
import { buildMemoryEventContext } from '../memory/memory-event-context.js'

const adapters = [
  { id: 'billing.example.com', name: '费用管理示例', match: ['billing.example.com'] },
  { id: 'support.example.com', name: '支持工单示例', match: ['support.example.com'] },
]

describe('memory event context', () => {
  it('derives a site scope from an adapter name in the user message', () => {
    const context = buildMemoryEventContext({
      baseScope: { user: 'local' },
      userMessage: '在费用管理示例提交团建报销。',
      adapters,
      toolCalls: [],
    })

    expect(context.scope).toEqual({ user: 'local', site: 'billing.example.com' })
  })

  it('derives a site and stable workflow from completed adapter calls', () => {
    const context = buildMemoryEventContext({
      baseScope: { user: 'local' },
      userMessage: '帮我处理报销。',
      adapters,
      toolCalls: [{
        name: 'PowerShell',
        args: { command: 'webcli call billing.example.com.submit_expense --invoice=SECRET-123' },
        status: 'done',
      }, {
        name: 'PowerShell',
        args: { command: 'webcli call billing.example.com.confirm_expense' },
        status: 'done',
      }],
    })

    expect(context.scope.site).toBe('billing.example.com')
    expect(context.hasSuccessfulSiteWorkflow).toBe(true)
  })

  it('does not choose a site when the request references multiple adapters', () => {
    const context = buildMemoryEventContext({
      baseScope: { user: 'local' },
      userMessage: '比较费用管理示例和 支持工单示例。',
      adapters,
      toolCalls: [],
    })

    expect(context.scope).toEqual({ user: 'local' })
  })

  it('does not treat a completed generic command that only mentions a site as a successful adapter workflow', () => {
    const context = buildMemoryEventContext({
      baseScope: { user: 'local' },
      userMessage: '检查费用管理示例是否可用。',
      adapters,
      toolCalls: [{
        name: 'PowerShell',
        args: { command: 'Write-Output billing.example.com' },
        status: 'done',
      }],
    })

    expect(context.scope.site).toBe('billing.example.com')
    expect(context.hasSuccessfulSiteWorkflow).toBe(false)
  })

  it('keeps a failed adapter tool out of a successful workflow', () => {
    const context = buildMemoryEventContext({
      baseScope: { user: 'local' },
      userMessage: '帮我提交报销。',
      adapters,
      toolCalls: [{
        name: 'PowerShell',
        args: { command: 'webcli call billing.example.com.submit_expense' },
        status: 'failed',
      }, {
        name: 'PowerShell',
        args: { command: 'webcli call billing.example.com.confirm_expense' },
        status: 'done',
      }],
    })

    expect(context.scope.site).toBe('billing.example.com')
    expect(context.hasSuccessfulSiteWorkflow).toBe(false)
  })
})
