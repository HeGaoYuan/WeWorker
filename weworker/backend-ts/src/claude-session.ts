import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { McpServerConfig, Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Message } from './works-store.js'
import type { SSEEvent } from './agent.js'

/** Mirrors persisted assistant semantics, ignoring display timing and block splitting. */
export class AssistantCheckpoint {
  private text = ''
  private tools = new Map<string, { id: string; name: string; args: unknown; result?: string; image?: string; status?: string }>()
  private skills: unknown[] = []
  private sequence: Array<{ type: 'text'; text: string } | { type: 'tool'; id: string } | { type: 'skill'; index: number }> = []

  observe(event: SSEEvent): void {
    if (event.type === 'text_delta') {
      const text = event.content ?? ''
      this.text += text
      const last = this.sequence.at(-1)
      if (last?.type === 'text') last.text += text
      else if (text) this.sequence.push({ type: 'text', text })
    }
    if (event.type === 'skill_context' && event.skillContext) {
      const index = this.skills.push(event.skillContext) - 1
      this.sequence.push({ type: 'skill', index })
    }
    if (!event.id) return
    const previous = this.tools.get(event.id)
    if (event.type === 'tool_call_start') {
      if (!previous) this.sequence.push({ type: 'tool', id: event.id })
      this.tools.set(event.id, {
        ...previous, id: event.id, name: (event.name ?? previous?.name ?? '').replace(/^mcp__weworker__/, ''),
        args: event.args ?? previous?.args ?? {}, status: previous?.status ?? 'running',
      })
    }
    if (event.type === 'tool_call_result') this.tools.set(event.id, {
      ...previous, id: event.id, name: previous?.name ?? '', args: previous?.args ?? {},
      result: event.result, status: event.isError ? 'failed' : 'done',
    })
    if (event.type === 'tool_call_image') this.tools.set(event.id, {
      ...previous, id: event.id, name: previous?.name ?? 'capture_screenshot', args: previous?.args ?? {},
      image: event.data, status: previous?.status === 'failed' ? 'failed' : 'done',
    })
  }

  private value() {
    return {
      sequence: this.sequence.map(item => item.type === 'text' ? item
        : item.type === 'skill' ? { type: item.type, value: this.skills[item.index] }
          : (() => {
              const tool = this.tools.get(item.id)
              return { type: item.type, value: tool && {
                id: tool.id, name: tool.name, args: tool.args,
                result: tool.result, image: tool.image, status: tool.status,
              } }
            })()),
      text: this.text,
    }
  }

  matches(message: Message | undefined): boolean {
    if (message?.role !== 'assistant') return false
    const checkpoint = new AssistantCheckpoint()
    for (const block of message.content) {
      if (block.type === 'text') checkpoint.observe({ type: 'text_delta', content: block.text })
      else if (block.type === 'tool_use') {
        checkpoint.tools.set(block.id, {
          id: block.id, name: block.name, args: block.args, result: block.result, image: block.image, status: block.status,
        })
        checkpoint.sequence.push({ type: 'tool', id: block.id })
      }
      else if (block.type === 'skill_context') {
        const index = checkpoint.skills.push(block) - 1
        checkpoint.sequence.push({ type: 'skill', index })
      }
      else if (block.type !== 'timing' || block.routeTool) return false
    }
    return hash(checkpoint.value()) === hash(this.value())
  }
}

export class AsyncQueue<T> implements AsyncIterable<T> {
  private values: T[] = []
  private wake?: () => void
  private ended = false
  private error?: Error

  push(value: T): void {
    if (this.ended) return
    this.values.push(value)
    this.wake?.()
  }
  end(error?: Error): void {
    if (this.ended) return
    this.ended = true
    this.error = error
    this.wake?.()
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      if (this.values.length) { yield this.values.shift()!; continue }
      if (this.ended) {
        if (this.error) throw this.error
        return
      }
      await new Promise<void>(resolve => { this.wake = resolve })
      this.wake = undefined
    }
  }
}

/** Owns one continuous SDK output reader. Ending an HTTP turn must not return() it. */
export class ClaudeSession {
  private input = new AsyncQueue<SDKUserMessage>()
  private current?: AsyncQueue<SDKMessage>
  private handle: Query
  private live = true
  private cost = 0
  private release?: () => void
  options?: Options

  constructor(factory: (input: AsyncIterable<SDKUserMessage>, session: ClaudeSession) => Query, release?: () => void) {
    this.release = release
    try { this.handle = factory(this.input, this) } catch (error) {
      this.release?.()
      throw error
    }
    void this.pump()
  }
  get alive(): boolean { return this.live }
  get busy(): boolean { return !!this.current }

  async *turn(prompt: string, mcpServer: McpServerConfig, signal?: AbortSignal, configureServer = true): AsyncGenerator<SDKMessage> {
    if (!this.live) throw new Error('Claude session has exited')
    if (this.current) throw new Error('This conversation already has an active request')
    const output = new AsyncQueue<SDKMessage>()
    this.current = output
    let complete = false
    const abort = () => this.close()
    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      signal?.addEventListener('abort', abort, { once: true })
      if (configureServer) {
        await this.handle.setMcpServers({})
        const result = await this.handle.setMcpServers({ weworker: mcpServer })
        if (Object.keys(result.errors ?? {}).length) throw new Error('Unable to refresh session tools')
      }
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      this.input.push({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null })
      for await (const message of output) yield message
      complete = true
    } finally {
      signal?.removeEventListener('abort', abort)
      this.current = undefined
      if (!complete || !this.live) this.close()
    }
  }

  close(): void {
    if (!this.live) return
    this.live = false
    this.input.end()
    const error = new Error('Claude session aborted')
    error.name = 'AbortError'
    this.current?.end(error)
    try { this.handle.close() } finally {
      this.release?.()
      this.release = undefined
      this.options = undefined
    }
  }

  private async pump(): Promise<void> {
    try {
      for await (const message of this.handle) {
        if (!this.current) continue
        if (message.type === 'result') {
          const cost = Number(message.total_cost_usd)
          const output = this.current
          output?.push({ ...message, total_cost_usd: Number.isFinite(cost) ? Math.max(0, cost - this.cost) : 0 })
          if (Number.isFinite(cost)) this.cost = cost
          output?.end()
        } else this.current.push(message)
      }
      this.current?.end(new Error('Claude process exited before completing the request'))
    } catch {
      // Do not include transport payloads or credentials in lifecycle errors.
      this.current?.end(new Error('Claude session connection failed'))
    } finally {
      this.close()
    }
  }
}

interface Entry {
  session: ClaudeSession
  fingerprint: string
  historyLength: number
  historyHash: string
  checkpoint?: AssistantCheckpoint
  timer?: ReturnType<typeof setTimeout>
  lastUsed: number
}

const MAX_CONVERSATIONS = 12
const IDLE_TTL_MS = 10 * 60_000
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export class ClaudeConversationSessions {
  private entries = new Map<string, Entry>()

  get(key: string, fingerprint: string, messages: Message[]): ClaudeSession | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.session.busy) throw new Error('This conversation already has an active request')
    if (!entry.session.alive || entry.fingerprint !== fingerprint
      || messages.length !== entry.historyLength + 2
      || hash(messages.slice(0, entry.historyLength)) !== entry.historyHash
      || !entry.checkpoint?.matches(messages[entry.historyLength])
      || messages.at(-1)?.role !== 'user') {
      this.remove(key)
      return undefined
    }
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = undefined
    return entry.session
  }

  put(key: string, fingerprint: string, history: Message[], session: ClaudeSession): boolean {
    if (this.entries.size >= MAX_CONVERSATIONS) {
      const oldest = [...this.entries.entries()].filter(([, item]) => !item.session.busy)
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0]
      if (oldest) this.remove(oldest[0])
      else return false
    }
    const entry = {} as Entry
    entry.session = session
    entry.fingerprint = fingerprint
    entry.historyLength = history.length
    entry.historyHash = hash(history)
    entry.lastUsed = Date.now()
    this.entries.set(key, entry)
    return true
  }

  complete(key: string, session: ClaudeSession, history: Message[], checkpoint: AssistantCheckpoint): void {
    const entry = this.entries.get(key)
    if (!entry || entry.session !== session) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.historyLength = history.length
    entry.historyHash = hash(history)
    entry.checkpoint = checkpoint
    entry.lastUsed = Date.now()
    entry.timer = setTimeout(() => this.remove(key), IDLE_TTL_MS)
    entry.timer.unref?.()
  }

  remove(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    if (entry.timer) clearTimeout(entry.timer)
    entry.session.close()
  }

  closeAll(): void {
    for (const key of [...this.entries.keys()]) this.remove(key)
  }
}

export const claudeConversationSessions = new ClaudeConversationSessions()
process.once('exit', () => claudeConversationSessions.closeAll())

/** Changes to discovered skills/rules must rebuild the CLI, including already loaded skills. */
export function fingerprintSessionSources(skillRoots: string[], configDirectory: string, cwd: string): string {
  const files = new Set([
    path.join(configDirectory, 'settings.json'), path.join(configDirectory, 'settings.local.json'),
    path.join(configDirectory, 'CLAUDE.md'), path.join(cwd, 'CLAUDE.md'), path.join(cwd, 'CLAUDE.local.md'),
    path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.claude', 'CLAUDE.md'),
  ])
  for (const root of skillRoots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) files.add(path.join(root, entry.name, 'SKILL.md'))
      }
    } catch { /* Optional skill directory. */ }
  }
  for (const root of [path.join(configDirectory, 'rules'), path.join(cwd, '.claude', 'rules')]) {
    try {
      for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
          files.add(path.join(entry.parentPath, entry.name))
        }
      }
    } catch { /* Missing optional skill/rule directories are represented by an empty set. */ }
  }
  const digest = createHash('sha256')
  for (const file of [...files].sort()) {
    digest.update(file)
    try { digest.update(fs.readFileSync(file)) } catch { digest.update('<missing>') }
  }
  return digest.digest('hex')
}
