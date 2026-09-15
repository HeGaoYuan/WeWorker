import { describe, expect, it } from 'vitest'
import {
  appendMemoryUserTurnReminder,
  buildMemoryOutputProtocolPrompt,
  MEMORY_BLOCK_CLOSE,
  MEMORY_BLOCK_OPEN,
  MEMORY_USER_TURN_REMINDER,
  parseAssistantMemoryOutput,
  summarizeAssistantMemoryParse,
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
    '- 所有候选（用户偏好、成功经验、失败经验、恢复经验、网站流程和工具限制）是否值得保存，都由你根据完整用户目标、对话上下文、已有记忆和本回合结果判断；不要依赖“记住”“以后”等关键词，也不要把“成功”或“失败”自动等同于值得保存。',
    '- 使用“可复用决策反事实”判断：假设下次遇到相同或相近目标，这条信息是否会让你明确改变回答或执行行为？必须能指出具体改变，例如更换工具或入口、调整步骤顺序、修正参数格式、先做环境检查、避免重复失败、环境恢复后重试，或遵守稳定用户偏好。若只能复述本次答案、临时结果、当前状态或原始工具输出，无法指出具体行为变化，则 should_remember=false。',
    '- 失败经验也只有在能改变下一次决策时才保存。若保存失败经验，必须在 facts.task_assessment 中标注 failure_kind：environmental（网络、扩展、页面加载等暂态环境）、procedural（步骤顺序、参数格式或调用方式）、capability（工具或 Adapter 不支持该能力）、mixed（多种原因）或 unknown（暂时无法归类）；可用 retryable 标注是否应在环境恢复后重试。',
    '- 本回合若已真实执行本地 PowerShell／Bash 或 webcli 站点工具，必须追加隐藏块，不得省略。隐藏块内要么写出可复用的 task_execution 经验，要么显式 should_remember=false 且 action=ignore（例如纯一次性验证且无可复用方法）；禁止静默缺块。',
    '- user_usage 只保存用户稳定习惯和偏好；task_execution 统一保存可复用的任务步骤、网站操作、成功、失败、恢复和工具能力限制。',
    '- 临时要求、一次性业务数据、当前查询结果、猜测、密钥、令牌、账号、文件路径和工具原始结果都不得写入 content；本地命令任务经验只概括可复用方法，不抄录原始输出。',
    '- 已有相关长期记忆会以带 id 的条目出现在当前任务上下文中。需要更新、融合或替换时必须在 related_memory_ids 中引用这些 id。',
    '- action 只能是 create、update、merge、supersede、ignore；should_remember=false 时 action 必须为 ignore。',
    '- should_remember=true 时还必须返回 memory_type、key、content、facts、confidence、related_memory_ids、reason；confidence 必须在 0 到 1 之间。',
    '- content 使用简短、稳定、可复用的中文事实。scope 只能使用下面给出的当前作用域，后端会再次校验。',
    '- 对执行型候选，facts.task_assessment 必须总结总体任务是否完成：`{"completed":true,"recovered":false}`；复合任务还要在其中用 `subtasks` 数组逐项写 `summary`、`completed` 和可选的 `reusable`。只要总体未完成，就必须提供 `failure_kind`；失败子任务也必须提供自己的 `failure_kind`。`recovered=true` 只能用于本轮已修正此前失败并完成总体目标的情况。Backend 只校验协议、作用域和执行证据，不替你判断总体任务或长期价值。',
    '- facts.execution_refs（可选数组）：声明本记忆依赖的本回合执行证据。Backend 用于门禁，不是记忆正文。webcli 站点流程示例：`{"kind":"webcli","tool":"support.example.com.my_todo","required":"success"}`；本地 shell 示例：`{"kind":"local_shell","required":"success"}`。',
    '- 用户明确要求记住、但本回合未执行的站点流程：memory_type=task_execution，必须 facts.declarative=true，confidence≤0.6，scope.site 为唯一 adapter id（如 billing.example.com）；Backend 仅存 provisional，不是 verified。',
    '- 有真实执行的站点步骤、成功经验、失败经验或恢复经验：统一使用 memory_type=task_execution；站点任务可带 scope.site，不要求固定两个或多个 webcli 调用；勿宣称 verified（完整证据要等 Bridge）。',
    '- 任务执行经验必须用 facts.task_assessment 总结总体任务；未完成时使用 failure_kind 分类，不要把失败经验改写成成功流程。',
    '- 纯 user_usage 不要带 execution_refs，也不要带 site。',
    '- 禁用站点不得写成可执行成功的 task_execution。',
    `- 当前期望记忆类型：${options.expectedMemoryType ?? 'user_usage 或 task_execution，由内容和真实执行结果决定'}。`,
    `- 当前作用域：${scope}。`,
    `- ${options.taskHint}`,
    '',
    '无需保存时示例：',
    `${MEMORY_BLOCK_OPEN}{"should_remember":false,"action":"ignore","reason":"一次性请求"}${MEMORY_BLOCK_CLOSE}`,
    '需要保存用户偏好时示例：',
    `${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"user_usage","key":"response_language","content":"用户默认使用中文回复。","facts":{"language":"zh-CN"},"scope":${scope},"confidence":0.95,"related_memory_ids":[],"reason":"稳定用户偏好"}${MEMORY_BLOCK_CLOSE}`,
    '声明式站点流程示例：',
    `${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"task_execution","key":"costplus_team_reimburse_order","content":"团建报销先选费用归属，再上传发票，提交前确认。","facts":{"declarative":true},"scope":{"user":"local","site":"billing.example.com"},"confidence":0.55,"related_memory_ids":[],"reason":"用户明确要求记住流程"}${MEMORY_BLOCK_CLOSE}`,
  ].join('\n')
}

describe('main agent memory output protocol', () => {
  it('separates visible reply from a structured memory candidate', () => {
    const output = [
      '好的，之后默认使用中文。',
      `${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"user_usage","key":"response_language","content":"用户默认使用中文回复。","facts":{"language":"zh-CN"},"scope":{"user":"local"},"confidence":0.95,"related_memory_ids":[],"reason":"稳定用户偏好"}${MEMORY_BLOCK_CLOSE}`,
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
    expect(summarizeAssistantMemoryParse(parsed)).toEqual({
      outcome: 'present_ok',
      should_remember: true,
      action: 'create',
      memory_type: 'user_usage',
    })
    expect(parsed.visibleText).not.toContain('should_remember')
  })

  it('hides a valid no-memory decision without creating a candidate', () => {
    const parsed = parseAssistantMemoryOutput(
      `已查询完成。${MEMORY_BLOCK_OPEN}{"should_remember":false,"action":"ignore","reason":"一次性查询"}${MEMORY_BLOCK_CLOSE}`,
    )

    expect(parsed.visibleText).toBe('已查询完成。')
    expect(parsed.decision).toEqual({ should_remember: false, reason: '一次性查询' })
    expect(summarizeAssistantMemoryParse(parsed)).toEqual({
      outcome: 'present_ignore',
      should_remember: false,
      action: 'ignore',
    })
  })

  it('classifies missing and malformed memory blocks without leaking content', () => {
    const missing = parseAssistantMemoryOutput('正常回复，无隐藏块。')
    expect(summarizeAssistantMemoryParse(missing)).toEqual({ outcome: 'missing' })

    const malformed = parseAssistantMemoryOutput(
      `正常回复${MEMORY_BLOCK_OPEN}{not-json}${MEMORY_BLOCK_CLOSE}`,
    )
    expect(summarizeAssistantMemoryParse(malformed)).toEqual({
      outcome: 'present_parse_error',
      parse_error: malformed.parseError,
    })
    expect(JSON.stringify(summarizeAssistantMemoryParse(malformed))).not.toContain('正常回复')
  })

  it('rejects an incomplete remembered candidate instead of supplying defaults', () => {
    const parsed = parseAssistantMemoryOutput(
      `正常回复${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"task_execution","key":"x","content":"经验"}${MEMORY_BLOCK_CLOSE}`,
    )

    expect(parsed.decision).toBeUndefined()
    expect(parsed.parseError).toContain('facts')
    expect(summarizeAssistantMemoryParse(parsed).outcome).toBe('present_parse_error')
  })

  it('requires explicit ignore for a no-memory decision', () => {
    const parsed = parseAssistantMemoryOutput(
      `${MEMORY_BLOCK_OPEN}{"should_remember":false,"action":"create","reason":"一次性请求"}${MEMORY_BLOCK_CLOSE}`,
    )

    expect(parsed.decision).toBeUndefined()
    expect(parsed.parseError).toContain('action=ignore')
  })

  it('requires scope in a remembered candidate', () => {
    const parsed = parseAssistantMemoryOutput(
      `${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"user_usage","key":"language","content":"默认中文","facts":{},"confidence":0.9,"related_memory_ids":[],"reason":"稳定偏好"}${MEMORY_BLOCK_CLOSE}`,
    )

    expect(parsed.decision).toBeUndefined()
    expect(parsed.parseError).toContain('scope')
  })

  it('does not accept the legacy site_operation memory type', () => {
    const parsed = parseAssistantMemoryOutput(
      `${MEMORY_BLOCK_OPEN}{"should_remember":true,"action":"create","memory_type":"site_operation","key":"invoice_flow","content":"先选择费用归属再上传发票。","facts":{},"scope":{"user":"local","site":"billing.example.com"},"confidence":0.9,"related_memory_ids":[],"reason":"可复用流程"}${MEMORY_BLOCK_CLOSE}`,
    )

    expect(parsed.decision).toBeUndefined()
    expect(parsed.parseError).toContain('invalid memory type')
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
      taskHint: '这是定时任务回合。上一次同任务是否失败：是。任务是否完成由你根据完整上下文和用户目标判断；执行记录仅用于核验你声明的证据。',
    }))
  })

  it('preserves the previous-task-success branch in the complete protocol', () => {
    const prompt = buildMemoryOutputProtocolPrompt({
      scope: { user: 'local', site: 'invoice-query' },
      triggerHint: 'task_completed',
      expectedMemoryType: 'task_execution',
      previousTaskFailed: false,
    })

    expect(prompt).toBe(expectedMemoryOutputProtocol({
      scope: { user: 'local', site: 'invoice-query' },
      expectedMemoryType: 'task_execution',
      taskHint: '这是定时任务回合。上一次同任务是否失败：否。任务是否完成由你根据完整上下文和用户目标判断；执行记录仅用于核验你声明的证据。',
    }))
  })

  it('appends a one-line memory reminder to the end of the user turn prompt', () => {
    const withReminder = appendMemoryUserTurnReminder('请执行测试命令。')
    expect(withReminder.endsWith(MEMORY_USER_TURN_REMINDER)).toBe(true)
    expect(withReminder).toContain(MEMORY_BLOCK_OPEN)
    expect(appendMemoryUserTurnReminder(withReminder)).toBe(withReminder)
  })
})
