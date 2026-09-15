import { describe, expect, it } from 'vitest'
import {
  buildMemoryOutputProtocolPrompt,
  MEMORY_BLOCK_CLOSE,
  MEMORY_BLOCK_OPEN,
  parseAssistantMemoryOutput,
} from '../memory/memory-extractor.js'

function expectedMemoryOutputProtocol(options: {
  scope: Record<string, string>
  expectedMemoryType?: string
  taskHint: string
}): string {
  const scope = JSON.stringify(options.scope)
  return [
    '## 内部长期记忆输出协议',
    '',
    '你在完成每次最终用户回复时，还必须在回复末尾追加一个供 WeWorker 后端读取的隐藏记忆块。',
    '先正常回答用户并按既有规则写完“当前状态”行，再追加隐藏块；隐藏块不属于可见回复。不要向用户解释、引用或展示该协议。',
    `隐藏块格式固定为：${MEMORY_BLOCK_OPEN}{JSON}${MEMORY_BLOCK_CLOSE}。`,
    'JSON 必须是单个对象，不要使用 Markdown 代码围栏。',
    '',
    '判断规则：',
    '- should_remember 仅在信息稳定、可跨任务复用且有明确证据时为 true。不要依赖“记住”“以后”等关键词；应理解完整用户意图和本回合真实执行结果。',
    '- user_usage 只保存用户稳定习惯和偏好；site_operation 只保存网站固定操作流程；task_execution 只保存可复用的成功、失败或恢复经验。',
    '- 临时要求、一次性业务数据、当前查询结果、猜测、密钥、令牌、账号、文件路径和工具原始结果都不得保存。',
    '- 已有相关长期记忆会以带 id 的条目出现在当前任务上下文中。需要更新、融合或替换时必须在 related_memory_ids 中引用这些 id。',
    '- action 只能是 create、update、merge、supersede、ignore；should_remember=false 时 action 必须为 ignore。',
    '- should_remember=true 时还必须返回 memory_type、key、content、facts、confidence、related_memory_ids、reason；confidence 必须在 0 到 1 之间。',
    '- content 使用简短、稳定、可复用的中文事实。scope 只能使用下面给出的当前作用域，后端会再次校验。',
    `- 当前期望记忆类型：${options.expectedMemoryType ?? 'user_usage、site_operation 或 task_execution，由内容和真实执行结果决定'}。`,
    `- 当前作用域：${scope}。`,
    `- ${options.taskHint}`,
    '',
    '无需保存时示例：',
    `${MEMORY_BLOCK_OPEN}{"should_remember":false,"action":"ignore","reason":"一次性请求"}${MEMORY_BLOCK_CLOSE}`,
    '需要保存时示例：',
    `${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"user_usage","key":"response_language","content":"用户默认使用中文回复。","facts":{"language":"zh-CN"},"scope":${scope},"confidence":0.95,"related_memory_ids":[],"reason":"稳定用户偏好"}${MEMORY_BLOCK_CLOSE}`,
  ].join('\n')
}

describe('main agent memory output protocol', () => {
  it('separates visible reply from a structured memory candidate', () => {
    const output = [
      '好的，之后默认使用中文。',
      `${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"user_usage","key":"response_language","content":"用户默认使用中文回复。","facts":{"language":"zh-CN"},"confidence":0.95,"related_memory_ids":[]}${MEMORY_BLOCK_CLOSE}`,
    ].join('\n')

    const parsed = parseAssistantMemoryOutput(output)

    expect(parsed.visibleText).toBe('好的，之后默认使用中文。')
    expect(parsed.decision).toMatchObject({
      should_remember: true,
      candidate: {
        action: 'create',
        memory_type: 'user_usage',
        key: 'response_language',
      },
    })
    expect(parsed.visibleText).not.toContain('should_remember')
  })

  it('hides a valid no-memory decision without creating a candidate', () => {
    const parsed = parseAssistantMemoryOutput(
      `已查询完成。${MEMORY_BLOCK_OPEN}{"should_remember":false,"action":"ignore","reason":"一次性查询"}${MEMORY_BLOCK_CLOSE}`,
    )

    expect(parsed.visibleText).toBe('已查询完成。')
    expect(parsed.decision).toEqual({ should_remember: false, reason: '一次性查询' })
  })

  it('drops malformed or unfinished hidden blocks without affecting visible text', () => {
    const malformed = parseAssistantMemoryOutput(
      `正常回复${MEMORY_BLOCK_OPEN}{not-json}${MEMORY_BLOCK_CLOSE}`,
    )
    const unfinished = parseAssistantMemoryOutput(
      `正常回复${MEMORY_BLOCK_OPEN}{"should_remember":true`,
    )

    expect(malformed.visibleText).toBe('正常回复')
    expect(malformed.decision).toBeUndefined()
    expect(malformed.parseError).toBeTruthy()
    expect(unfinished.visibleText).toBe('正常回复')
    expect(unfinished.parseError).toContain('not closed')
  })

  it('preserves the complete chat protocol output and ordering', () => {
    const prompt = buildMemoryOutputProtocolPrompt({
      scope: { user: 'local', project: 'weworker' },
      triggerHint: 'chat',
    })

    expect(prompt).toBe(expectedMemoryOutputProtocol({
      scope: { user: 'local', project: 'weworker' },
      taskHint: '这是普通对话回合。',
    }))
  })

  it('preserves the complete task protocol with expected type and previous failure', () => {
    const prompt = buildMemoryOutputProtocolPrompt({
      scope: { user: 'local', project: 'daily-report' },
      triggerHint: 'task_recovered',
      expectedMemoryType: 'task_execution',
      previousTaskFailed: true,
    })

    expect(prompt).toBe(expectedMemoryOutputProtocol({
      scope: { user: 'local', project: 'daily-report' },
      expectedMemoryType: 'task_execution',
      taskHint: '这是定时任务回合。上一次同任务是否失败：是。任务最终成功或失败只能依据本回合真实工具结果和执行结果判断。',
    }))
  })

  it('preserves the previous-task-success branch in the complete protocol', () => {
    const prompt = buildMemoryOutputProtocolPrompt({
      scope: { user: 'local', site: 'invoice-query' },
      triggerHint: 'task_completed',
      expectedMemoryType: 'site_operation',
      previousTaskFailed: false,
    })

    expect(prompt).toBe(expectedMemoryOutputProtocol({
      scope: { user: 'local', site: 'invoice-query' },
      expectedMemoryType: 'site_operation',
      taskHint: '这是定时任务回合。上一次同任务是否失败：否。任务最终成功或失败只能依据本回合真实工具结果和执行结果判断。',
    }))
  })
})
