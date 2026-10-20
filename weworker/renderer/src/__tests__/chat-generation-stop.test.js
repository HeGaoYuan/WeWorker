import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPlanPreservationPrompt,
  buildResumePrompt,
  isPlanChangeIntent,
  isResumeIntent,
  mapMessageContentAfterStop,
  mapMessagesAfterStop,
} from '../utils/chat-generation-stop.js'

describe('chat-generation-stop', () => {
  it('stops every split segment of the active turn without changing old turns', () => {
    const tool = { type: 'tool_use', id: 'fixture', name: 'Read', status: 'running' }
    const messages = [
      { role: 'assistant', streamingTurnId: 'old', content: [tool] },
      { role: 'assistant', streamingTurnId: 'active', content: [tool] },
      { role: 'user', content: [{ type: 'text', text: 'steer' }] },
      { role: 'assistant', streamingTurnId: 'active', content: [] },
    ]
    const result = mapMessagesAfterStop(messages)
    assert.equal(result[0], messages[0])
    assert.equal(result[1].content[0].status, 'cancelled')
    assert.equal(result[2], messages[2])
  })
  it('marks running tools cancelled and flags in-progress plan tools as needing confirmation', () => {
    const content = [
      { type: 'tool_use', id: '1', name: 'Bash', status: 'running' },
      {
        type: 'tool_use',
        id: '2',
        name: 'TodoWrite',
        args: { todos: [{ id: '1', content: 'step 1', status: 'in_progress' }] },
        status: 'done',
      },
      { type: 'tool_use', id: '3', name: 'Read', status: 'done', result: 'ok' },
    ]

    const next = mapMessageContentAfterStop(content)
    assert.equal(next[0].status, 'cancelled')
    assert.equal(next[0].result, '(已停止)')
    assert.equal(next[1].args.todos[0].status, 'needs_confirmation')
    assert.equal(next[1].args.todos[0].blocked_reason, '需要确认')
    assert.equal(next[2].status, 'done')
  })

  it('keeps failed in-progress todos failed after stop', () => {
    const content = [
      {
        type: 'tool_use',
        id: '2',
        name: 'TodoWrite',
        args: {
          todos: [
            { id: '1', content: 'retry failed step', status: 'in_progress', failure_reason: 'retry failed' },
            { id: '2', content: 'waiting step', status: 'in_progress' },
          ],
        },
        status: 'done',
      },
    ]

    const next = mapMessageContentAfterStop(content)
    assert.equal(next[0].args.todos[0].status, 'in_progress')
    assert.equal(next[0].args.todos[0].failure_reason, 'retry failed')
    assert.equal(next[0].args.todos[1].status, 'needs_confirmation')
  })

  it('builds a resume prompt from the first stopped plan step', () => {
    const plan = {
      steps: [
        { title: '安全设置敏感信息加密检查', status: 'completed' },
        { title: '渠道权限隔离检查', status: 'needs_confirmation', blocked_reason: '需要确认' },
        { title: '站点开关控制功能测试', status: 'pending' },
      ],
    }

    const prompt = buildResumePrompt(plan)

    assert.match(prompt, /从中断处继续执行当前计划/)
    assert.match(prompt, /下一步必须从：渠道权限隔离检查/)
    assert.match(prompt, /不要重做已完成步骤/)
    assert.match(prompt, /TodoWrite 状态只能使用 pending、in_progress、completed/)
    assert.match(prompt, /\[pending; local_status=needs_confirmation\] 渠道权限隔离检查/)
    assert.doesNotMatch(prompt, /\[needs_confirmation\] 渠道权限隔离检查/)
    assert.match(prompt, /安全设置敏感信息加密检查/)
    assert.match(prompt, /站点开关控制功能测试/)
  })

  it('detects accidental stop messages as resume intent', () => {
    assert.equal(isResumeIntent('ok，按错了'), true)
    assert.equal(isResumeIntent('点错了，继续'), true)
    assert.equal(isResumeIntent('继续执行'), true)
    assert.equal(isResumeIntent('重新制定计划'), false)
  })

  it('builds a plan-preservation prompt for unfinished plans', () => {
    const plan = {
      goal: '验证站点权限',
      steps: [
        { id: 'step-1', title: '检查登录状态', status: 'completed', acceptance: '已登录' },
        { id: 'step-2', title: '验证渠道权限隔离', status: 'pending', acceptance: '不同渠道互不串权' },
      ],
    }

    const prompt = buildPlanPreservationPrompt('继续看下一个问题', plan)

    assert.match(prompt, /用户原始消息：\n继续看下一个问题/)
    assert.match(prompt, /已有未完成计划/)
    assert.match(prompt, /必须直接沿用下面的原计划结构/)
    assert.match(prompt, /step-1/)
    assert.match(prompt, /检查登录状态/)
    assert.match(prompt, /step-2/)
    assert.match(prompt, /验证渠道权限隔离/)
  })

  it('does not preserve a completed plan', () => {
    const plan = {
      goal: '已完成计划',
      steps: [
        { id: 'step-1', title: '完成检查', status: 'completed' },
      ],
    }

    assert.equal(buildPlanPreservationPrompt('开始新的任务', plan), '开始新的任务')
  })

  it('does not preserve when the user explicitly wants to change the plan', () => {
    const plan = {
      goal: '旧计划',
      steps: [
        { id: 'step-1', title: '旧步骤', status: 'pending' },
      ],
    }

    assert.equal(isPlanChangeIntent('重新制定计划'), true)
    assert.equal(isPlanChangeIntent('调整一下计划'), true)
    assert.equal(isPlanChangeIntent('继续执行'), false)
    assert.equal(buildPlanPreservationPrompt('重新制定计划', plan), '重新制定计划')
  })
})
