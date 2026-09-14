import { isTodoWriteTool } from './todowrite-state.js'

function normalizeToolBaseName(name) {
  return String(name ?? '').replace(/^mcp__[^_]+__/, '').split('.').pop()
}

function isInProgressStatus(status) {
  const s = String(status ?? '').toLowerCase()
  return s === 'in_progress' || s === 'in progress'
}

function hasIssueReason(todo) {
  return !!String(
    todo?.failure_reason
      ?? todo?.failed_reason
      ?? todo?.error
      ?? todo?.blocked_reason
      ?? '',
  ).trim()
}

function todoWriteCompatibleStatus(status) {
  const value = String(status ?? 'pending').toLowerCase().replace(/\s+/g, '_')
  if (value === 'completed' || value === 'in_progress') return value
  return 'pending'
}

function formatResumeStatus(status) {
  const localStatus = String(status ?? 'pending').toLowerCase().replace(/\s+/g, '_')
  const todoStatus = todoWriteCompatibleStatus(localStatus)
  return localStatus === todoStatus ? todoStatus : `${todoStatus}; local_status=${localStatus}`
}

function mapPlanManagementBlockAfterStop(block) {
  const args = block.args && typeof block.args === 'object' ? block.args : {}
  const toolName = normalizeToolBaseName(block.name)

  if (toolName === 'TodoWrite' && Array.isArray(args.todos)) {
    return {
      ...block,
      args: {
        ...args,
        todos: args.todos.map((todo) => (
          todo && isInProgressStatus(todo.status)
            ? hasIssueReason(todo)
              ? todo
              : { ...todo, status: 'needs_confirmation', blocked_reason: todo.blocked_reason ?? '需要确认' }
            : todo
        )),
      },
    }
  }

  if (isInProgressStatus(args.status)) {
    if (hasIssueReason(args)) return block
    return { ...block, args: { ...args, status: 'needs_confirmation', blocked_reason: args.blocked_reason ?? '需要确认' } }
  }

  return block
}

export function mapMessageContentAfterStop(content) {
  return (content ?? []).map((block) => {
    if (block.type === 'tool_use' && block.status === 'running') {
      return { ...block, status: 'cancelled', result: block.result ?? '(已停止)' }
    }
    if (block.type === 'tool_use' && isTodoWriteTool(block.name)) {
      return mapPlanManagementBlockAfterStop(block)
    }
    return block
  })
}

export function buildResumePrompt(plan) {
  const steps = plan?.steps ?? []
  if (!steps.length) return '继续执行。'

  const resumeStep = steps.find((step) => step.status === 'needs_confirmation' || step.status === 'failed' || step.status === 'blocked' || step.status === 'cancelled')
    ?? steps.find((step) => step.status === 'in_progress')
    ?? steps.find((step) => step.status === 'pending')

  if (!resumeStep) return '继续执行。'

  const completed = steps
    .filter((step) => step.status === 'completed')
    .map((step) => `- ${step.title}`)
    .join('\n')
  const remaining = steps
    .filter((step) => step.status !== 'completed')
    .map((step) => `- [${formatResumeStatus(step.status)}] ${step.title}`)
    .join('\n')

  return [
    '从中断处继续执行当前计划。',
    `下一步必须从：${resumeStep.title}`,
    '不要重做已完成步骤，也不要跳到更后面的步骤，除非当前步骤确认完成或不可执行。',
    'TodoWrite 状态只能使用 pending、in_progress、completed；local_status=needs_confirmation/failed/blocked/cancelled 只表示本地展示状态，继续时写回 pending 或 in_progress。',
    completed ? `已完成步骤：\n${completed}` : '已完成步骤：无',
    remaining ? `待继续步骤：\n${remaining}` : '待继续步骤：无',
  ].join('\n\n')
}

export function isResumeIntent(text) {
  const value = String(text ?? '').trim()
  if (!value) return false

  return /继续|继续执行|继续吧|接着来|接着执行|从停止处继续|从中断处继续|按错了|点错了|手滑|误点|不小心停了|刚才停错了|停错了/i.test(value)
    || /^(continue|resume)\b/i.test(value)
}

export function isPlanChangeIntent(text) {
  const value = String(text ?? '').trim()
  if (!value) return false

  return /重新制定|重新规划|重做计划|改.{0,6}计划|修改.{0,6}计划|调整.{0,6}计划|换个计划|更新.{0,6}计划|不要按原计划|新计划/.test(value)
    || /\b(replan|change plan|new plan|update plan)\b/i.test(value)
}

function formatPlanSteps(plan) {
  return (plan?.steps ?? [])
    .map((step, index) => {
      const id = step.id ?? `step-${index + 1}`
      const status = step.status ?? 'pending'
      const acceptance = step.acceptance ? `；验收：${step.acceptance}` : ''
      return `- ${id} | ${status} | ${step.title}${acceptance}`
    })
    .join('\n')
}

export function buildPlanPreservationPrompt(userText, plan) {
  if (isPlanChangeIntent(userText)) return userText

  const activeSteps = (plan?.steps ?? []).filter((step) => step.status !== 'cancelled')
  if (!activeSteps.length || activeSteps.every((step) => step.status === 'completed')) return userText

  const steps = formatPlanSteps(plan)
  if (!steps) return userText

  return [
    `用户原始消息：\n${userText}`,
    '已有未完成计划。除非用户明确要求重新制定、修改、替换计划，或当前事实证明原计划不可执行/明显不再适用，否则必须直接沿用下面的原计划结构。',
    '如果继续执行计划，请保持原步骤 ID、标题和顺序，不要重写成相似但不同的新计划；只更新必要的步骤状态、结果或阻塞原因。',
    `原计划目标：${plan?.goal || '未命名计划'}`,
    `原计划步骤：\n${steps}`,
  ].join('\n\n')
}
