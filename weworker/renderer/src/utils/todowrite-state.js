function normalizeToolBaseName(name) {
  return String(name ?? '').replace(/^mcp__[^_]+__/, '').split('.').pop()
}

const TASK_PLAN_TOOL_NAMES = new Set(['TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskStop'])

export function isTodoWriteTool(name) {
  return normalizeToolBaseName(name) === 'TodoWrite'
}

export function isPlanManagementTool(name) {
  const baseName = normalizeToolBaseName(name)
  return baseName === 'TodoWrite' || TASK_PLAN_TOOL_NAMES.has(baseName)
}

export function messageHasTodoWrite(message) {
  return (message?.content ?? []).some((block) => block.type === 'tool_use' && isTodoWriteTool(block.name))
}

function normalizeStatus(status) {
  const value = String(status ?? 'pending').toLowerCase().replace(/\s+/g, '_')
  if (value === 'completed') return 'completed'
  if (value === 'in_progress') return 'in_progress'
  if (value === 'failed' || value === 'failure') return 'failed'
  if (value === 'blocked') return 'blocked'
  if (value === 'needs_confirmation') return 'needs_confirmation'
  if (value === 'cancelled') return 'cancelled'
  return 'pending'
}

function normalizeReason(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function getIssueReason(todo) {
  return normalizeReason(todo?.failure_reason)
    ?? normalizeReason(todo?.failed_reason)
    ?? normalizeReason(todo?.error)
    ?? normalizeReason(todo?.blocked_reason)
}

function displayStatusForTodo(todo) {
  const status = normalizeStatus(todo?.status)
  if (status === 'in_progress' && getIssueReason(todo)) return 'failed'
  return status
}

function leadingStepNumber(text) {
  const match = String(text ?? '').trim().match(/^(?:step\s*)?(\d+)\s*[.、:：)）-]?/i)
  return match ? Number(match[1]) : null
}

function titleFingerprint(text) {
  const value = String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!value) return ''
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash * 31) + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function canonicalStepId(todo, index) {
  const explicit = String(todo?.id ?? '').trim()
  const explicitNumber = explicit.match(/^(?:step-)?(\d+)$/i)
  if (explicitNumber) return `step-${explicitNumber[1]}`
  if (explicit) return explicit
  const title = todo?.content ?? todo?.subject ?? ''
  const fromTitle = leadingStepNumber(title)
  if (fromTitle != null) return `step-${fromTitle}`
  const fingerprint = titleFingerprint(title)
  return fingerprint ? `todo-${fingerprint}` : `step-${index + 1}`
}

function todoToStep(todo, index) {
  const title = String(todo?.content ?? todo?.subject ?? `Step ${index + 1}`).trim()
  const issueReason = getIssueReason(todo)
  return {
    id: canonicalStepId(todo, index),
    order: index + 1,
    title,
    acceptance: '',
    status: displayStatusForTodo(todo),
    result: todo?.result == null ? null : String(todo.result),
    blocked_reason: issueReason,
    activeForm: todo?.activeForm == null ? null : String(todo.activeForm),
  }
}

function parseToolResultJson(result) {
  if (!result || typeof result !== 'string') return null
  try {
    return JSON.parse(result)
  } catch {
    return null
  }
}

function parseTaskCreateResult(result) {
  const text = String(result ?? '').trim()
  const match = text.match(/^Task\s+#(\d+)\s+created successfully:\s*(.+)$/i)
  if (!match) return null
  return {
    id: match[1],
    subject: match[2].trim(),
  }
}

function parseTaskListResult(result) {
  const text = String(result ?? '').trim()
  if (!text) return null
  if (/^No tasks found$/i.test(text)) return []

  const tasks = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^#(\d+)\s+\[([^\]]+)\]\s+(.+?)(?:\s+\[blocked by .+\])?$/i)
    if (!match) continue
    tasks.push({
      id: match[1],
      subject: match[3].trim(),
      status: match[2].trim(),
    })
  }
  return tasks.length ? tasks : null
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function taskTitle(args, resultTask, fallback) {
  return firstText(
    args?.content,
    args?.subject,
    args?.title,
    resultTask?.content,
    resultTask?.subject,
    resultTask?.title,
    resultTask?.name,
    fallback,
  )
}

function taskId(args, resultTask, title, index) {
  const explicit = firstText(
    args?.taskId,
    args?.task_id,
    args?.id,
    resultTask?.id,
    resultTask?.taskId,
    resultTask?.task_id,
  )
  const explicitNumber = explicit.match(/^(?:step-)?(\d+)$/i)
  if (explicitNumber) return `step-${explicitNumber[1]}`
  if (explicit) return explicit
  const numbered = leadingStepNumber(title)
  if (numbered != null) return `step-${numbered}`
  const fingerprint = titleFingerprint(title)
  return fingerprint ? `todo-${fingerprint}` : `task-${index + 1}`
}

function normalizeTaskId(value) {
  const explicit = firstText(value)
  const explicitNumber = explicit.match(/^(?:step-)?(\d+)$/i)
  if (explicitNumber) return `step-${explicitNumber[1]}`
  return explicit
}

function taskStatus(args, resultTask, fallback = 'pending') {
  return normalizeStatus(args?.status ?? args?.state ?? resultTask?.status ?? resultTask?.state ?? fallback)
}

function taskReason(args, resultTask) {
  const metadata = args?.metadata && typeof args.metadata === 'object' ? args.metadata : {}
  return normalizeReason(args?.failure_reason)
    ?? normalizeReason(args?.failed_reason)
    ?? normalizeReason(args?.error)
    ?? normalizeReason(args?.blocked_reason)
    ?? normalizeReason(metadata?.failure_reason)
    ?? normalizeReason(metadata?.failed_reason)
    ?? normalizeReason(metadata?.error)
    ?? normalizeReason(metadata?.blocked_reason)
    ?? normalizeReason(resultTask?.failure_reason)
    ?? normalizeReason(resultTask?.failed_reason)
    ?? normalizeReason(resultTask?.error)
    ?? normalizeReason(resultTask?.blocked_reason)
}

function stepToTaskRecord(step) {
  return {
    id: step.id,
    order: step.order,
    title: step.title,
    status: step.status,
    result: step.result ?? null,
    blocked_reason: step.blocked_reason ?? null,
    activeForm: step.activeForm ?? null,
  }
}

function taskRecordToStep(record, index) {
  return todoToStep({
    id: record.id,
    content: record.title,
    status: record.status,
    result: record.result,
    blocked_reason: record.blocked_reason,
    failure_reason: record.failure_reason,
    activeForm: record.activeForm,
  }, index)
}

function tasksFromListResult(result) {
  const parsed = parseToolResultJson(result)
  const rawTasks = parsed
    ? Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.tasks)
        ? parsed.tasks
        : Array.isArray(parsed?.data)
          ? parsed.data
          : null
    : parseTaskListResult(result)
  if (!rawTasks) return null

  return rawTasks
    .filter((task) => task && typeof task === 'object')
    .map((task, index) => {
      const title = taskTitle({}, task, `Task ${index + 1}`)
      return {
        id: taskId({}, task, title, index),
        order: index + 1,
        title,
        status: taskStatus({}, task),
        result: task?.result == null ? null : String(task.result),
        blocked_reason: taskReason({}, task),
        activeForm: task?.activeForm == null ? null : String(task.activeForm),
      }
    })
}

function latestTaskPlanSteps(message, previousPlan) {
  const taskBlocks = (message?.content ?? []).filter((block) => (
    block.type === 'tool_use' && TASK_PLAN_TOOL_NAMES.has(normalizeToolBaseName(block.name))
  ))
  if (!taskBlocks.length) return null

  const tasks = new Map()
  for (const step of previousPlan?.steps ?? []) {
    tasks.set(step.id, stepToTaskRecord(step))
  }

  for (const block of taskBlocks) {
    const name = normalizeToolBaseName(block.name)
    const args = block.args && typeof block.args === 'object' ? block.args : {}
    const parsed = parseToolResultJson(block.result)
    const resultTask = (
      name === 'TaskCreate'
        ? parseTaskCreateResult(block.result)
        : parsed?.task && typeof parsed.task === 'object'
          ? parsed.task
          : parsed
    )

    if (name === 'TaskList') {
      const listedTasks = tasksFromListResult(block.result)
      if (listedTasks) {
        tasks.clear()
        listedTasks.forEach((task) => tasks.set(task.id, task))
      }
      continue
    }

    if (name === 'TaskCreate') {
      const title = taskTitle(args, resultTask, `Task ${tasks.size + 1}`)
      const id = taskId(args, resultTask, title, tasks.size)
      tasks.set(id, {
        id,
        order: tasks.size + 1,
        title,
        status: taskStatus(args, resultTask),
        result: args.result == null ? null : String(args.result),
        blocked_reason: taskReason(args, resultTask),
        activeForm: args.activeForm == null ? null : String(args.activeForm),
      })
      continue
    }

    if (name === 'TaskUpdate') {
      const rawId = normalizeTaskId(args.taskId ?? args.task_id ?? args.id ?? resultTask?.id)
      let existing = rawId ? tasks.get(rawId) : null
      if (!existing) {
        const titleHint = taskTitle(args, resultTask, '')
        existing = titleHint
          ? [...tasks.values()].find((task) => titleFingerprint(task.title) === titleFingerprint(titleHint))
          : null
      }
      const title = taskTitle(args, resultTask, existing?.title ?? `Task ${tasks.size + 1}`)
      const id = existing?.id ?? taskId(args, resultTask, title, tasks.size)
      tasks.set(id, {
        ...(existing ?? { id, order: tasks.size + 1 }),
        id,
        title,
        status: taskStatus(args, resultTask, existing?.status),
        result: args.result == null ? existing?.result ?? null : String(args.result),
        blocked_reason: taskReason(args, resultTask) ?? existing?.blocked_reason ?? null,
        activeForm: args.activeForm == null ? existing?.activeForm ?? null : String(args.activeForm),
      })
      continue
    }

    if (name === 'TaskStop') {
      const id = normalizeTaskId(args.taskId ?? args.task_id ?? args.id)
      if (id && tasks.has(id)) {
        const existing = tasks.get(id)
        tasks.set(id, {
          ...existing,
          status: 'cancelled',
          blocked_reason: taskReason(args, resultTask) ?? existing.blocked_reason ?? 'stopped',
        })
      }
    }
  }

  return [...tasks.values()]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(taskRecordToStep)
}

function finalizePlan(plan) {
  if (!plan?.steps?.length) return null
  const activeSteps = plan.steps.filter((step) => step.status !== 'cancelled')
  const completed = activeSteps.length > 0 && activeSteps.every((step) => step.status === 'completed')
  const blocked = activeSteps.some((step) => step.status === 'blocked' || step.status === 'failed')
  return {
    ...plan,
    status: completed ? 'completed' : blocked ? 'blocked' : 'active',
    locked: completed,
  }
}

function mergeTodoSnapshot(previousPlan, nextSteps, revision) {
  if (!previousPlan) {
    return finalizePlan({
      goal: 'Todo List',
      steps: nextSteps.map((step, index) => ({ ...step, order: index + 1 })),
      revision,
      summary: null,
    })
  }

  if (previousPlan.locked) {
    return finalizePlan({
      goal: 'Todo List',
      steps: nextSteps.map((step, index) => ({ ...step, order: index + 1 })),
      revision,
      summary: null,
    })
  }

  const nextById = new Map(nextSteps.map((step) => [step.id, step]))
  const merged = []
  const consumed = new Set()
  const completedSteps = []

  for (const oldStep of previousPlan.steps ?? []) {
    const next = nextById.get(oldStep.id)
    if (oldStep.status === 'completed') {
      completedSteps.push(oldStep)
      if (next) consumed.add(next.id)
      continue
    }
  }

  for (const step of nextSteps) {
    if (consumed.has(step.id)) continue
    const previous = (previousPlan.steps ?? []).find((oldStep) => oldStep.id === step.id)
    merged.push(previous ? { ...previous, ...step } : step)
    consumed.add(step.id)
  }

  return finalizePlan({
    ...previousPlan,
    steps: [...completedSteps, ...merged].map((step, index) => ({ ...step, order: index + 1 })),
    revision,
  })
}

function latestTodoWriteSteps(message) {
  let latest = null
  for (const block of message?.content ?? []) {
    if (block.type !== 'tool_use' || !isTodoWriteTool(block.name)) continue
    const todos = block.args?.todos
    if (Array.isArray(todos)) latest = todos.map(todoToStep)
  }
  return latest
}

export function buildTodoWriteState(messages, { streaming = false } = {}) {
  let plan = null
  let anchorIndex = -1
  const snapshots = {}

  for (let i = 0; i < (messages?.length ?? 0); i += 1) {
    const msg = messages[i]
    if (msg?.role !== 'assistant') continue
    const steps = latestTodoWriteSteps(msg) ?? latestTaskPlanSteps(msg, plan?.locked ? null : plan)
    if (!steps) continue
    const startsNewPlan = !!plan?.locked
    plan = mergeTodoSnapshot(plan, steps, i)
    if (plan) {
      anchorIndex = anchorIndex < 0 || startsNewPlan ? i : anchorIndex
      snapshots[i] = plan
    }
  }

  return plan ? { plan, anchorIndex, snapshots } : null
}

export function buildDisplayTodoSnapshots(todoState, displayPlan) {
  const snapshots = todoState?.snapshots ?? {}
  const anchorIndex = todoState?.anchorIndex
  const nextSnapshots = { ...snapshots }
  if (anchorIndex != null && displayPlan) {
    nextSnapshots[anchorIndex] = displayPlan
  }
  return nextSnapshots
}

export function hasIncompleteTodoList(plan) {
  if (!plan || plan.locked || plan.status === 'completed') return false
  return (plan.steps ?? []).some((step) => {
    const status = normalizeStatus(step.status)
    return status !== 'completed' && status !== 'cancelled'
  })
}

export function applyPausedTodoState(plan) {
  if (!plan || plan.locked) return plan
  const steps = (plan.steps ?? []).map((step) => (
    step.status === 'in_progress'
      ? step.blocked_reason
        ? { ...step, status: 'failed' }
        : { ...step, status: 'needs_confirmation', blocked_reason: '需要确认' }
      : step
  ))
  return finalizePlan({ ...plan, steps })
}

export function applyStreamingTodoProgress(plan, { streaming = false } = {}) {
  if (!streaming || !plan || plan.locked) return plan
  if ((plan.steps ?? []).some((step) => step.status === 'in_progress')) return plan
  let idx = (plan.steps ?? []).findIndex((step) => (
    step.status === 'needs_confirmation'
    || step.status === 'blocked'
  ))
  if (idx < 0) idx = (plan.steps ?? []).findIndex((step) => step.status === 'pending')
  if (idx < 0) return plan
  const steps = plan.steps.map((step, index) => (
    index === idx
      ? { ...step, status: 'in_progress', blocked_reason: null }
      : step
  ))
  return finalizePlan({ ...plan, steps })
}

export function buildTodoWriteContextPrompt(userText, plan) {
  if (!hasIncompleteTodoList(plan)) return userText
  const steps = (plan.steps ?? [])
    .map((step) => {
      const localStatus = normalizeStatus(step.status)
      const todoStatus = localStatus === 'needs_confirmation' || localStatus === 'failed' || localStatus === 'blocked' || localStatus === 'cancelled'
        ? 'pending'
        : localStatus
      const localNote = localStatus !== todoStatus ? ` | local_status=${localStatus}` : ''
      const blockedReason = step.blocked_reason ? ` | blocked_reason=${step.blocked_reason}` : ''
      return `- ${step.id} | ${todoStatus} | locked=${localStatus === 'completed'}${localNote}${blockedReason} | ${step.title}`
    })
    .join('\n')

  return [
    `用户原始消息：\n${userText}`,
    '当前存在未完成 Todo List。除非用户明确要求修改计划且确有必要，否则必须继续沿用原 TodoWrite 列表。',
    '本轮如果开始、继续、完成、阻塞、修改或删除任何 todo，必须调用 TodoWrite，并传入完整最新列表。',
    '已完成 todo 不允许修改、删除或回退状态；未完成 todo 可以修改、删除、新增或调整状态。',
    'TodoWrite 工具参数中的 status 只能使用 pending、in_progress、completed；如果当前列表里标注 local_status=needs_confirmation/failed/blocked/cancelled，表示本地展示状态，下一次写回 TodoWrite 时应改为 pending 或 in_progress。',
    '如果某个 todo 因工具错误、重试失败、超时或页面结构变化无法继续，由你自行决定：调整/删除未完成计划、保持 pending，或使用 in_progress 并写入 failure_reason/blocked_reason 让前端显示为失败。',
    '仅在正文中说明“失败/阻塞/超时”不会更新 Todo List 状态；失败必须由 TodoWrite 参数中的 failure_reason/blocked_reason 或可用任务工具的结构化字段表达。',
    '如果没有实质变化，也必须保持一个未完成 todo 为 in_progress，并用 TodoWrite 写回完整最新列表。',
    `当前 Todo List：\n${steps}`,
  ].join('\n\n')
}
