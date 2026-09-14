import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTodoWriteState,
  buildDisplayTodoSnapshots,
  buildTodoWriteContextPrompt,
  hasIncompleteTodoList,
  isPlanManagementTool,
  messageHasTodoWrite,
  applyPausedTodoState,
  applyStreamingTodoProgress,
} from '../utils/todowrite-state.js'

function assistant(content) {
  return { role: 'assistant', content }
}

function todoBlock(todos) {
  return { type: 'tool_use', name: 'TodoWrite', args: { todos }, status: 'done' }
}

describe('todowrite-state', () => {
  it('creates canonical todo state from the latest TodoWrite snapshot', () => {
    const state = buildTodoWriteState([
      assistant([
        todoBlock([
          { content: 'Step 1: inspect', status: 'pending', activeForm: 'Inspecting' },
          { content: 'Step 2: implement', status: 'pending', activeForm: 'Implementing' },
        ]),
        todoBlock([
          { content: 'Step 1: inspect', status: 'completed', activeForm: 'Inspecting' },
          { content: 'Step 2: implement', status: 'in_progress', activeForm: 'Implementing' },
        ]),
      ]),
    ])

    assert.equal(state.plan.status, 'active')
    assert.equal(state.plan.locked, false)
    assert.equal(state.plan.steps.length, 2)
    assert.equal(state.plan.steps[0].status, 'completed')
    assert.equal(state.plan.steps[1].status, 'in_progress')
    assert.equal(state.anchorIndex, 0)
  })

  it('locks completed items against later rename, delete, or status rollback', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Step 1: inspect', status: 'completed', activeForm: 'Inspecting' },
        { content: 'Step 2: implement', status: 'in_progress', activeForm: 'Implementing' },
      ])]),
      assistant([todoBlock([
        { content: 'Step 1: renamed wrongly', status: 'pending', activeForm: 'Renaming' },
        { content: 'Step 3: verify', status: 'pending', activeForm: 'Verifying' },
      ])]),
    ])

    assert.equal(state.plan.steps.length, 2)
    assert.equal(state.plan.steps[0].title, 'Step 1: inspect')
    assert.equal(state.plan.steps[0].status, 'completed')
    assert.equal(state.plan.steps[1].title, 'Step 3: verify')
    assert.equal(state.plan.steps[1].status, 'pending')
  })

  it('does not consume a newly inserted un-id-ed todo with a completed positional id', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Inspect existing project', status: 'completed' },
        { content: 'Implement change', status: 'in_progress' },
      ])]),
      assistant([todoBlock([
        { content: 'Add missing regression test', status: 'in_progress' },
        { content: 'Implement change', status: 'pending' },
      ])]),
    ])

    assert.equal(state.plan.steps.length, 3)
    assert.equal(state.plan.steps[0].title, 'Inspect existing project')
    assert.equal(state.plan.steps[0].status, 'completed')
    assert.equal(state.plan.steps[1].title, 'Add missing regression test')
    assert.equal(state.plan.steps[1].status, 'in_progress')
    assert.equal(state.plan.steps[2].title, 'Implement change')
    assert.equal(state.plan.steps[2].status, 'pending')
  })

  it('locks the whole todo list when all active items are completed', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Step 1: inspect', status: 'completed', activeForm: 'Inspecting' },
        { content: 'Step 2: verify', status: 'completed', activeForm: 'Verifying' },
      ])]),
    ])

    assert.equal(state.plan.status, 'completed')
    assert.equal(state.plan.locked, true)
    assert.equal(hasIncompleteTodoList(state.plan), false)
  })

  it('reconstructs the same todo card state from TaskCreate and TaskUpdate tools', () => {
    const state = buildTodoWriteState([
      assistant([
        { type: 'tool_use', id: 'task-1', name: 'TaskCreate', args: { taskId: '1', subject: 'Step 1: inspect', status: 'pending' }, status: 'done' },
        { type: 'tool_use', id: 'task-2', name: 'TaskCreate', args: { taskId: '2', subject: 'Step 2: implement', status: 'pending' }, status: 'done' },
      ]),
      assistant([
        { type: 'tool_use', id: 'task-3', name: 'TaskUpdate', args: { taskId: '1', status: 'completed' }, status: 'done' },
        { type: 'tool_use', id: 'task-4', name: 'TaskUpdate', args: { taskId: '2', status: 'in_progress' }, status: 'done' },
      ]),
    ])

    assert.equal(state.plan.status, 'active')
    assert.equal(state.plan.locked, false)
    assert.equal(state.plan.steps.length, 2)
    assert.equal(state.plan.steps[0].title, 'Step 1: inspect')
    assert.equal(state.plan.steps[0].status, 'completed')
    assert.equal(state.plan.steps[1].title, 'Step 2: implement')
    assert.equal(state.plan.steps[1].status, 'in_progress')
  })

  it('matches TaskUpdate ids from plain TaskCreate result text', () => {
    const state = buildTodoWriteState([
      assistant([
        { type: 'tool_use', id: 'task-1', name: 'TaskCreate', args: { subject: '准备数据文件' }, result: 'Task #1 created successfully: 准备数据文件', status: 'done' },
        { type: 'tool_use', id: 'task-2', name: 'TaskCreate', args: { subject: '编写核心逻辑模块' }, result: 'Task #2 created successfully: 编写核心逻辑模块', status: 'done' },
        { type: 'tool_use', id: 'task-3', name: 'TaskUpdate', args: { taskId: '1', status: 'completed' }, result: 'Updated task #1 status', status: 'done' },
        { type: 'tool_use', id: 'task-4', name: 'TaskUpdate', args: { taskId: '2', status: 'completed' }, result: 'Updated task #2 status', status: 'done' },
      ]),
    ])

    assert.equal(state.plan.status, 'completed')
    assert.equal(state.plan.locked, true)
    assert.equal(state.plan.steps.length, 2)
    assert.deepEqual(state.plan.steps.map((step) => step.status), ['completed', 'completed'])
    assert.deepEqual(state.plan.steps.map((step) => step.title), ['准备数据文件', '编写核心逻辑模块'])
  })

  it('clears stale unfinished task state when TaskList reports no tasks before a new list', () => {
    const state = buildTodoWriteState([
      assistant([
        { type: 'tool_use', id: 'old-1', name: 'TaskCreate', args: { subject: '旧任务' }, result: 'Task #7 created successfully: 旧任务', status: 'done' },
      ]),
      assistant([
        { type: 'tool_use', id: 'list-empty', name: 'TaskList', args: {}, result: 'No tasks found', status: 'done' },
        { type: 'tool_use', id: 'new-1', name: 'TaskCreate', args: { subject: '准备数据文件' }, result: 'Task #1 created successfully: 准备数据文件', status: 'done' },
        { type: 'tool_use', id: 'new-2', name: 'TaskUpdate', args: { taskId: '1', status: 'completed' }, result: 'Updated task #1 status', status: 'done' },
      ]),
    ])

    assert.equal(state.plan.status, 'completed')
    assert.equal(state.plan.steps.length, 1)
    assert.equal(state.plan.steps[0].title, '准备数据文件')
    assert.equal(state.plan.steps[0].status, 'completed')
  })

  it('uses plain TaskList output as the latest task snapshot', () => {
    const state = buildTodoWriteState([
      assistant([
        { type: 'tool_use', id: 'task-1', name: 'TaskCreate', args: { subject: '准备数据文件' }, result: 'Task #1 created successfully: 准备数据文件', status: 'done' },
        { type: 'tool_use', id: 'task-2', name: 'TaskList', args: {}, result: '#1 [completed] 准备数据文件\n#2 [pending] 编写核心逻辑模块 [blocked by #1]', status: 'done' },
      ]),
    ])

    assert.equal(state.plan.status, 'active')
    assert.equal(state.plan.steps.length, 2)
    assert.equal(state.plan.steps[0].status, 'completed')
    assert.equal(state.plan.steps[1].title, '编写核心逻辑模块')
    assert.equal(state.plan.steps[1].status, 'pending')
  })

  it('starts a new todo list after the previous todo list is completed and locked', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Step 1: inspect', status: 'completed', activeForm: 'Inspecting' },
        { content: 'Step 2: verify', status: 'completed', activeForm: 'Verifying' },
      ])]),
      { role: 'user', content: [{ type: 'text', text: '开始新的整理任务' }] },
      assistant([todoBlock([
        { content: 'Step 1: read docs', status: 'in_progress', activeForm: 'Reading docs' },
        { content: 'Step 2: classify reports', status: 'pending', activeForm: 'Classifying reports' },
      ])]),
    ])

    assert.equal(state.anchorIndex, 2)
    assert.equal(state.plan.status, 'active')
    assert.equal(state.plan.locked, false)
    assert.equal(state.plan.steps.length, 2)
    assert.equal(state.plan.steps[0].title, 'Step 1: read docs')
    assert.equal(state.snapshots[0].status, 'completed')
    assert.equal(state.snapshots[2].status, 'active')
  })

  it('starts a fresh todo list from TaskCreate after the previous list is completed and locked', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Step 1: inspect', status: 'completed' },
        { content: 'Step 2: verify', status: 'completed' },
      ])]),
      { role: 'user', content: [{ type: 'text', text: '开始新任务' }] },
      assistant([
        { type: 'tool_use', id: 'task-1', name: 'TaskCreate', args: { taskId: '1', subject: 'Step 1: new task', status: 'in_progress' }, status: 'done' },
      ]),
    ])

    assert.equal(state.anchorIndex, 2)
    assert.equal(state.plan.status, 'active')
    assert.equal(state.plan.steps.length, 1)
    assert.equal(state.plan.steps[0].title, 'Step 1: new task')
  })

  it('uses the paused display plan for the current todo snapshot after streaming stops', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Step 1: inspect', status: 'completed', activeForm: 'Inspecting' },
        { content: 'Step 2: wait for user', status: 'in_progress', activeForm: 'Waiting' },
      ])]),
    ])

    const displayPlan = applyPausedTodoState(state.plan)
    const snapshots = buildDisplayTodoSnapshots(state, displayPlan)

    assert.equal(snapshots[0].steps[1].status, 'needs_confirmation')
    assert.equal(snapshots[0].steps[1].blocked_reason, '需要确认')
    assert.equal(state.snapshots[0].steps[1].status, 'in_progress')
  })

  it('keeps failed in-progress display state failed after streaming stops', () => {
    const plan = {
      locked: false,
      steps: [
        { id: 'step-1', title: 'Inspect', status: 'completed' },
        { id: 'step-2', title: 'Retry failed', status: 'in_progress', blocked_reason: '连续重试失败' },
      ],
    }

    const displayPlan = applyPausedTodoState(plan)

    assert.equal(displayPlan.status, 'blocked')
    assert.equal(displayPlan.steps[1].status, 'failed')
    assert.equal(displayPlan.steps[1].blocked_reason, '连续重试失败')
  })

  it('displays an in-progress todo with a failure reason as failed', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Step 1: inspect', status: 'completed' },
        { content: 'Step 2: search product', status: 'in_progress', failure_reason: '连续 2 次重试均超时失败' },
        { content: 'Step 3: verify result', status: 'pending' },
      ])]),
    ])

    assert.equal(state.plan.status, 'blocked')
    assert.equal(state.plan.steps[1].status, 'failed')
    assert.equal(state.plan.steps[1].blocked_reason, '连续 2 次重试均超时失败')
    assert.equal(hasIncompleteTodoList(state.plan), true)
  })

  it('leaves pending unchanged when failure is only mentioned in assistant text', () => {
    const state = buildTodoWriteState([
      assistant([
        todoBlock([
          { content: '创建测试目录及文件结构', status: 'completed' },
          { content: '生成随机数据并写入文件', status: 'completed' },
          { content: '对文件内容进行排序和统计', status: 'pending' },
          { content: '验证数据完整性及正确性', status: 'pending' },
          { content: '清理测试文件并输出最终报告', status: 'pending' },
        ]),
        { type: 'text', text: '已按要求将第三步（对文件内容进行排序和统计）标记为失败（受阻状态）。' },
      ]),
    ])

    assert.equal(state.plan.steps[2].status, 'pending')
    assert.equal(state.plan.steps[2].blocked_reason, null)
  })

  it('does not infer failed state from assistant text without structured todo fields', () => {
    const state = buildTodoWriteState([
      assistant([
        todoBlock([
          { content: '场景1：任务执行中抛出异常后重试恢复', status: 'completed' },
          { content: '场景2：任务连续重试3次全部失败', status: 'in_progress' },
        ]),
        { type: 'text', text: '3 次重试全部失败，按规则停止重试，标记失败。' },
      ]),
    ], { streaming: true })

    assert.equal(state.plan.status, 'active')
    assert.equal(state.plan.steps[1].status, 'in_progress')
    assert.equal(state.plan.steps[1].blocked_reason, null)
  })

  it('restores a confirmation todo to in progress while streaming resumes', () => {
    const plan = {
      locked: false,
      steps: [
        { id: 'step-1', title: 'Inspect', status: 'completed' },
        { id: 'step-2', title: 'Search', status: 'needs_confirmation', blocked_reason: '需要确认' },
        { id: 'step-3', title: 'Verify', status: 'pending' },
      ],
    }

    const displayPlan = applyStreamingTodoProgress(plan, { streaming: true })

    assert.equal(displayPlan.steps[1].status, 'in_progress')
    assert.equal(displayPlan.steps[1].blocked_reason, null)
  })

  it('does not restore a failed todo to in progress just because streaming resumes', () => {
    const plan = {
      locked: false,
      status: 'blocked',
      steps: [
        { id: 'step-1', title: 'Inspect', status: 'completed' },
        { id: 'step-2', title: 'Search', status: 'failed', blocked_reason: '连续重试失败' },
      ],
    }

    const displayPlan = applyStreamingTodoProgress(plan, { streaming: true })

    assert.equal(displayPlan.steps[1].status, 'failed')
    assert.equal(displayPlan.steps[1].blocked_reason, '连续重试失败')
  })

  it('detects assistant messages that called TodoWrite', () => {
    assert.equal(messageHasTodoWrite(assistant([todoBlock([])])), true)
    assert.equal(messageHasTodoWrite(assistant([{ type: 'text', text: 'No tool' }])), false)
  })

  it('treats Task tools as plan-management tools without renaming them to TodoWrite', () => {
    assert.equal(isPlanManagementTool('TaskCreate'), true)
    assert.equal(isPlanManagementTool('TaskUpdate'), true)
    assert.equal(isPlanManagementTool('TodoWrite'), true)
    assert.equal(messageHasTodoWrite(assistant([{ type: 'tool_use', name: 'TaskCreate', args: {} }])), false)
  })

  it('builds model context instructing the assistant to update TodoWrite, not JSON patches', () => {
    const state = buildTodoWriteState([
      assistant([todoBlock([
        { content: 'Step 1: inspect', status: 'completed', activeForm: 'Inspecting' },
        { content: 'Step 2: implement', status: 'in_progress', activeForm: 'Implementing' },
      ])]),
    ])

    const prompt = buildTodoWriteContextPrompt('continue', state.plan)

    assert.match(prompt, /TodoWrite/)
    assert.match(prompt, /完整最新列表/)
    assert.doesNotMatch(prompt, /todo_patch/)
    assert.doesNotMatch(prompt, /complex_task_plan/)
  })

  it('maps local confirmation todo state back to TodoWrite-compatible pending state in model context', () => {
    const prompt = buildTodoWriteContextPrompt('继续', {
      status: 'blocked',
      locked: false,
      steps: [
        { id: 'step-1', title: 'Inspect', status: 'completed' },
        { id: 'step-2', title: 'Verify', status: 'needs_confirmation', blocked_reason: '需要确认' },
      ],
    })

    assert.match(prompt, /step-2 \| pending \| locked=false \| local_status=needs_confirmation/)
    assert.match(prompt, /blocked_reason=需要确认/)
    assert.doesNotMatch(prompt, /step-2 \| needs_confirmation \|/)
  })
})
