import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../config.js'
import type { Message } from '../works-store.js'
import { AsyncQueue, claudeConversationSessions } from '../claude-session.js'

const mocks = vi.hoisted(() => ({ query: vi.fn(), directory: '', mcp: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mocks.query }))
vi.mock('../config.js', () => ({
  getConfigDirectory: () => mocks.directory, getUserDirectory: () => mocks.directory,
  getOpenBrowserAllowedOrigins: () => [], getUserDirectoryBlacklist: () => [], getSiteEnabled: () => false,
}))
vi.mock('../tools.js', () => ({ buildMcpServer: mocks.mcp, getMcpToolDefinitionSummary: () => '' }))
vi.mock('../logger.js', () => ({ createLogger: () => ({ info() {}, error() {}, warn() {}, debug() {} }) }))
vi.mock('../zcf-sync.js', () => ({ composeSystemPromptWithZcf: (prompt: string) => prompt }))
vi.mock('../adapter-parser.js', () => ({ parseAllAdapters: () => new Map() }))
vi.mock('../user-directory-access.js', () => ({
  buildAgentFilesystemSettings: () => ({}), createUnifiedToolGuard: () => async () => ({ behavior: 'deny' }),
}))
import { streamChat } from '../agent.js'

const settings = { active_provider: 'anthropic', api_key: 'test-placeholder', base_url: 'https://example.com', model: 'test-model', context_limit: 1_000_000 } as Settings
const message = (id: string, role: string, text: string): Message => ({ id, work_id: 'test-work', role, content: [{ type: 'text', text }], created_at: '' })
const input = () => [message('u1', 'user', 'first')]
const nextInput = () => [...input(), message('a1', 'assistant', 'answer'), message('u2', 'user', 'second')]
const prompts: string[] = []
const changes: any[] = []
const closes: ReturnType<typeof vi.fn>[] = []

async function collect(messages: Message[], overrides = {}, config = settings) {
  const events = []
  for await (const event of streamChat(messages, config, undefined, {
    workId: 'test-work', memoryEnabled: false, channelPermissionMode: 'qa_only', ...overrides,
  })) events.push(event)
  expect(events.filter(event => event.type === 'error')).toEqual([])
  return events
}

beforeEach(() => {
  mocks.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-agent-session-test-'))
  vi.stubEnv('WEWORKER_CLAUDE_CODE_PATH', process.execPath)
  prompts.length = 0; changes.length = 0; closes.length = 0
  mocks.query.mockReset()
  mocks.mcp.mockImplementation(context => ({ type: 'sdk', context }))
  mocks.query.mockImplementation(request => {
    const output = new AsyncQueue<any>()
    const close = vi.fn(() => output.end())
    closes.push(close)
    void (async () => {
      for await (const prompt of request.prompt) {
        prompts.push(prompt.message.content)
        output.push({ type: 'assistant', message: { content: [{ type: 'text', text: 'answer' }] } })
        output.push({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, usage: { input_tokens: 5, output_tokens: 2 } })
      }
    })()
    return { [Symbol.asyncIterator]: () => output[Symbol.asyncIterator](), close,
      setMcpServers: async (servers: any) => { changes.push(servers); return { errors: {} } },
    }
  })
})
afterEach(() => {
  claudeConversationSessions.closeAll()
  vi.unstubAllEnvs()
  fs.rmSync(mocks.directory, { recursive: true, force: true })
})

describe('chat session integration', () => {
  it('sends only the new message on the second turn and refreshes callbacks', async () => {
    const firstCallback = vi.fn(), secondCallback = vi.fn()
    await collect(input(), { onAskUser: firstCallback })
    await collect(nextInput(), { onAskUser: secondCallback })
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(prompts).toEqual(['first', 'second'])
    expect(changes.at(-1).weworker.context.askUserSSECallback).toBe(secondCallback)
    expect(closes[0]).not.toHaveBeenCalled()
  })

  it.each(['model', 'api_key', 'base_url'])('rebuilds when %s changes', async field => {
    await collect(input())
    await collect(nextInput(), {}, { ...settings, [field]: field === 'base_url' ? 'https://example.org' : 'test-changed' })
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(prompts[1]).toContain('first')
    expect(prompts[1]).toContain('second')
    expect(closes[0]).toHaveBeenCalledOnce()
  })

  it('preserves the full URL relay until its retained process is closed', async () => {
    const full = { ...settings, base_url: 'https://example.com/messages', base_url_is_full: true }
    await collect(input(), {}, full)
    const relay = mocks.query.mock.calls[0][0].options.env.ANTHROPIC_BASE_URL
    expect((await fetch(`${relay}/v1/models`)).status).toBe(404)
    await collect(nextInput(), {}, full)
    expect(mocks.query).toHaveBeenCalledOnce()
    claudeConversationSessions.closeAll()
    await expect(fetch(`${relay}/v1/models`)).rejects.toThrow()
  })

  it('does not attach the HTTP abort controller to the retained process', async () => {
    const controller = new AbortController()
    for await (const _ of streamChat(input(), settings, controller, { workId: 'test-work', memoryEnabled: false, channelPermissionMode: 'qa_only' })) { /* drain */ }
    controller.abort()
    expect(closes[0]).not.toHaveBeenCalled()
    await collect(nextInput())
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(mocks.query.mock.calls[0][0].options.abortController).not.toBe(controller)
  })

  it('rebuilds after a rule changes and does not reuse stale permissions', async () => {
    await collect(input())
    const configDir = mocks.query.mock.calls[0][0].options.env.CLAUDE_CONFIG_DIR
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'CLAUDE.md'), 'Updated test rule', 'utf8')
    await collect(nextInput())
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(closes[0]).toHaveBeenCalledOnce()
  })

  it('does not reuse a session whose partial streaming mode changed', async () => {
    await collect(input(), { channelPermissionMode: 'full', streaming: false })
    await collect(nextInput(), { channelPermissionMode: 'full', streaming: true })
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls[1][0].options.includePartialMessages).toBe(true)
  })

  it('uses an explicitly configured executable without shell discovery', async () => {
    await collect(input())
    expect(mocks.query.mock.calls[0][0].options.pathToClaudeCodeExecutable).toBe(process.execPath)
  })

  it('rebuilds when the injected site tool catalog changes', async () => {
    await collect(input(), { siteToolkitPrompt: 'First site tool catalog' })
    await collect(nextInput(), { siteToolkitPrompt: 'Second site tool catalog' })
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(prompts[1]).toContain('Second site tool catalog')
    expect(closes[0]).toHaveBeenCalledOnce()
  })
})
