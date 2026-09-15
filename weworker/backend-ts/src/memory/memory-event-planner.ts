import {
  buildMemoryEventContext,
  type MemoryAdapterIdentity,
  type MemoryToolCall,
} from './memory-event-context.js'
import type { MemoryEventTrigger, MemoryScope, MemoryType, MemoryUpdateCandidate } from './memory-types.js'

export interface PlannedMemoryEvent {
  eventId: string
  trigger: MemoryEventTrigger
  scope: MemoryScope
  expectedMemoryType?: MemoryType
}

function hasFailedTool(toolCalls: MemoryToolCall[]): boolean {
  return toolCalls.some((tool) => tool.status === 'failed' || tool.status === 'error')
}

export function planCompletedChatMemoryEvents(input: {
  baseEventId: string
  baseScope: MemoryScope
  userMessage: string
  adapters: MemoryAdapterIdentity[]
  toolCalls: MemoryToolCall[]
  turnSucceeded: boolean
  candidate?: MemoryUpdateCandidate
}): { scope: MemoryScope; events: PlannedMemoryEvent[] } {
  const context = buildMemoryEventContext({
    baseScope: input.baseScope,
    userMessage: input.userMessage,
    adapters: input.adapters,
    toolCalls: input.toolCalls,
  })
  const events: PlannedMemoryEvent[] = []
  const candidate = input.candidate
  if (!candidate || candidate.action === 'ignore') return { scope: context.scope, events }
  const hasStableSiteWorkflow = input.turnSucceeded && !hasFailedTool(input.toolCalls) && context.hasSuccessfulSiteWorkflow

  if (candidate.memory_type === 'user_usage') {
    events.push({
      eventId: `${input.baseEventId}:agent-user-usage`,
      trigger: 'agent_decision',
      scope: context.scope,
      expectedMemoryType: 'user_usage',
    })
  }

  const hasSafeDeclaredSiteWorkflow = input.turnSucceeded && !hasFailedTool(input.toolCalls) && input.toolCalls.length === 0 && Boolean(context.scope.site)
  if (candidate.memory_type === 'site_operation' && (hasStableSiteWorkflow || hasSafeDeclaredSiteWorkflow)) {
    events.push({
      eventId: `${input.baseEventId}:agent-site-operation`,
      trigger: 'site_workflow_completed',
      scope: context.scope,
      expectedMemoryType: 'site_operation',
    })
  }

  if (candidate.memory_type === 'task_execution') {
    const failed = hasFailedTool(input.toolCalls) || !input.turnSucceeded
    events.push({
      eventId: `${input.baseEventId}:agent-task-${input.toolCalls.length > 0 ? (failed ? 'failed' : 'completed') : 'declared'}`,
      trigger: input.toolCalls.length > 0 ? (failed ? 'task_failed' : 'task_completed') : 'agent_decision',
      scope: context.scope,
      expectedMemoryType: 'task_execution',
    })
  }

  if (candidate.memory_type.startsWith('extension:') && context.scope.extension) {
    events.push({
      eventId: `${input.baseEventId}:agent-extension`,
      trigger: 'agent_decision',
      scope: context.scope,
      expectedMemoryType: candidate.memory_type,
    })
  }

  return { scope: context.scope, events }
}

export function planTaskMemoryEvent(input: {
  executionId: string
  trigger: Extract<MemoryEventTrigger, 'task_completed' | 'task_failed' | 'task_recovered'>
  baseScope: MemoryScope
  taskPrompt: string
  adapters: MemoryAdapterIdentity[]
  toolCalls: MemoryToolCall[]
}): { scope: MemoryScope; event: PlannedMemoryEvent } {
  const context = buildMemoryEventContext({
    baseScope: input.baseScope,
    userMessage: input.taskPrompt,
    adapters: input.adapters,
    toolCalls: input.toolCalls,
  })
  return {
    scope: context.scope,
    event: {
      eventId: `task:${input.executionId}:${input.trigger}`,
      trigger: input.trigger,
      scope: context.scope,
      expectedMemoryType: 'task_execution',
    },
  }
}
