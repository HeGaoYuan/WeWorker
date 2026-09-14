/**
 * Task Executor — 执行单个定时任务的 AI 对话流程。
 * 复用现有 streamChat + runChannelChat 模式，非交互式执行。
 */
import { getSettings } from './config.js'
import { generateAssistantStatusLine, streamChat } from './agent.js'
import { resolveZcfPrefs } from './zcf-sync.js'
import * as store from './works-store.js'
import type { ScheduledTask, ContentBlock } from './works-store.js'
import { parseAllAdapters } from './adapter-parser.js'
import { getSiteEnabled } from './config.js'
import { ensureAssistantStatusLine } from './assistant-status.js'

export interface ExecutionResult {
  workId: string
  executionId: string
  status: 'completed' | 'failed'
  summary?: string
  error?: string
}

interface NotificationPayload {
  taskId: string
  taskTitle: string
  status: 'completed' | 'failed'
  summary?: string
  fullText?: string
  error?: string
  executionId: string
  workId: string
}

/**
 * 安全调用通知器。notifier.ts 将在 task 5.1 中创建，
 * 在此之前动态导入会失败，静默忽略。
 */
async function safeNotify(payload: NotificationPayload, channels: string[]): Promise<void> {
  try {
    const mod = await import(/* webpackIgnore: true */ './notifier.js')
    await mod.notify(payload, channels)
  } catch {
    // Notifier module not yet available — silently skip
  }
}

/**
 * 执行一个定时任务：创建 work、记录执行、调用 AI Agent、更新状态。
 */
export async function executeTask(task: ScheduledTask): Promise<ExecutionResult> {
  // Skip tasks with empty prompt — nothing to execute
  if (!task.prompt_template?.trim()) {
    const work = store.createWork(`[定时] ${task.title} · 跳过`)
    const execution = store.createTaskExecution(task.id, work.id)
    store.updateTaskExecution(execution.id, {
      status: 'failed',
      error_message: '任务提示词为空，跳过执行',
      completed_at: new Date().toISOString(),
    })
    return { workId: work.id, executionId: execution.id, status: 'failed', error: '任务提示词为空' }
  }

  // 1. Create a new work for this execution (with scheduled task identifier)
  const now = new Date()
  const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const workTitle = `[定时] ${task.title} · ${timeStr}`
  const work = store.createWork(workTitle)

  // 2. Create execution record (pending)
  const execution = store.createTaskExecution(task.id, work.id)

  // 3. Append the prompt template as user message
  store.appendMessage(work.id, 'user', [{ type: 'text', text: task.prompt_template }])

  // 4. Update execution to running
  store.updateTaskExecution(execution.id, { status: 'running' })

  try {
    // 5. Get work with messages and settings
    const workWithMessages = store.getWorkWithMessages(work.id)!
    const settings = getSettings()

    // 6. Build enabled adapter IDs (same pattern as server.ts chat endpoint)
    const allAdapters = parseAllAdapters()
    const enabledAdapterIds = new Set(
      [...allAdapters.entries()].filter(([id, a]) => getSiteEnabled(id, a.defaultEnabled)).map(([id]) => id),
    )

    // 7. Call streamChat and iterate to completion (non-streaming, like runChannelChat)
    const assistantContent: ContentBlock[] = []
    let currentText = ''
    // Per-turn timing (mirrors server.ts /chat handler so scheduled results also show durations)
    const chatStartTime = Date.now()
    let lastStepEndTime = chatStartTime
    let lastToolStartTime = 0
    let llmMsTotal = 0
    let execMsTotal = 0
    let stepIndex = 0
    const seenToolIds = new Set<string>()

    const zcfPrefs = resolveZcfPrefs(workWithMessages, settings)

    for await (const event of streamChat(workWithMessages.messages, settings, undefined, {
      streaming: false,
      enabledAdapterIds,
      workId: workWithMessages.id,
      zcfRole: zcfPrefs.zcfRole,
      zcfMode: zcfPrefs.zcfMode,
    })) {
      if (event.type === 'text_delta' && event.content) {
        currentText += event.content
      } else if (event.type === 'tool_call_start' && event.id) {
        if (currentText) {
          assistantContent.push({ type: 'text', text: currentText })
          currentText = ''
        }
        const isNew = !seenToolIds.has(event.id)
        let thinkMs: number | undefined
        if (isNew) {
          seenToolIds.add(event.id)
          stepIndex++
          lastToolStartTime = Date.now()
          thinkMs = lastToolStartTime - lastStepEndTime
          llmMsTotal += thinkMs
        }
        assistantContent.push({
          type: 'tool_use',
          id: event.id,
          name: event.name ?? '',
          args: event.args,
          status: 'running',
          ...(thinkMs !== undefined ? { thinkMs } : {}),
        })
      } else if (event.type === 'tool_call_result' && event.id) {
        const toolDuration = lastToolStartTime ? Date.now() - lastToolStartTime : 0
        execMsTotal += toolDuration
        lastStepEndTime = Date.now()
        const idx = assistantContent.findIndex(
          b => b.type === 'tool_use' && (b as { id: string }).id === event.id,
        )
        if (idx >= 0) {
          assistantContent[idx] = {
            ...(assistantContent[idx] as object),
            result: event.result,
            status: 'done',
            execMs: toolDuration,
          } as ContentBlock
        }
      } else if (event.type === 'tool_call_image' && event.id) {
        const idx = assistantContent.findIndex(
          b => b.type === 'tool_use' && (b as { id: string }).id === event.id,
        )
        if (idx >= 0) {
          assistantContent[idx] = {
            ...(assistantContent[idx] as object),
            image: event.data,
            status: 'done',
          } as ContentBlock
        }
      } else if (event.type === 'error') {
        throw new Error(event.content ?? 'AI Agent error')
      }
    }

    // Finalize remaining text
    if (currentText) {
      assistantContent.push({ type: 'text', text: currentText })
    }

    // Account for trailing LLM text generation
    llmMsTotal += Date.now() - lastStepEndTime

    const assistantText = assistantContent
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')

    if (assistantText) {
      const finalizedText = await ensureAssistantStatusLine({
        text: assistantText,
        generateStatusLine: () => generateAssistantStatusLine(assistantText, settings),
        fallbackStatusLine: '当前状态：已完成当前回复，等待下一步指令',
      })
      const statusSuffix = finalizedText.slice(assistantText.length)
      let patched = false
      for (let i = assistantContent.length - 1; i >= 0; i -= 1) {
        const block = assistantContent[i]
        if (block.type === 'text') {
          assistantContent[i] = { ...block, text: block.text + statusSuffix }
          patched = true
          break
        }
      }
      if (!patched) {
        assistantContent.push({ type: 'text', text: finalizedText })
      }
    }

    // 8. Persist assistant message
    if (assistantContent.length > 0) {
      assistantContent.push({ type: 'timing', totalMs: Date.now() - chatStartTime, llmMs: llmMsTotal, execMs: execMsTotal, steps: stepIndex })
      store.appendMessage(work.id, 'assistant', assistantContent)
    }

    // 9. Extract summary from accumulated text
    const fullText = assistantContent
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')
    const summary = fullText.slice(0, 200) || undefined

    // 10. Mark execution as completed
    store.updateTaskExecution(execution.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    })

    // 11. Send notification (notifier will be created in task 5.1)
    await safeNotify(
      {
        taskId: task.id,
        taskTitle: task.title,
        status: 'completed',
        summary,
        fullText: fullText || undefined,
        executionId: execution.id,
        workId: work.id,
      },
      task.notify_channels,
    )

    return {
      workId: work.id,
      executionId: execution.id,
      status: 'completed',
      summary,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    // Mark execution as failed
    store.updateTaskExecution(execution.id, {
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })

    // Send failure notification
    await safeNotify(
      {
        taskId: task.id,
        taskTitle: task.title,
        status: 'failed',
        error: errorMessage,
        executionId: execution.id,
        workId: work.id,
      },
      task.notify_channels,
    )

    return {
      workId: work.id,
      executionId: execution.id,
      status: 'failed',
      error: errorMessage,
    }
  }
}
