import { create } from 'zustand'
import { backendFetch } from '../api/http.js'

const MAX_SESSIONS = 40
const MAX_ASSISTANT_REPLIES = 40
const MAX_COMMAND_HISTORY = 80
const MAX_OUTPUT_CHARS = 120000

function clampOutput(text) {
  const value = String(text || '')
  if (value.length <= MAX_OUTPUT_CHARS) return value
  return value.slice(value.length - MAX_OUTPUT_CHARS)
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeSession(event) {
  return {
    id: event.sessionId,
    source: event.source || 'ai',
    shell: event.shell === 'powershell' ? 'powershell' : 'bash',
    outputEncoding: event.outputEncoding || 'utf-8',
    workId: event.workId || null,
    command: event.command || '',
    cwd: event.cwd || '',
    status: 'running',
    output: '',
    stdout: '',
    stderr: '',
    exitCode: null,
    signal: null,
    error: null,
    startedAt: event.startedAt || nowIso(),
    endedAt: null,
  }
}

function upsertSession(sessions, session) {
  const existingIndex = sessions.findIndex((item) => item.id === session.id)
  const next = existingIndex >= 0
    ? sessions.map((item, index) => index === existingIndex ? { ...item, ...session } : item)
    : [session, ...sessions]
  return next.slice(0, MAX_SESSIONS)
}

function appendCommandHistory(history, command) {
  const trimmed = String(command || '').trim()
  if (!trimmed) return history
  return [trimmed, ...(history || []).filter((item) => item !== trimmed)].slice(0, MAX_COMMAND_HISTORY)
}

function makeLocalSession({ command, cwd, shell, output = '', exitCode = 0 }) {
  const now = nowIso()
  return {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'user',
    shell: shell === 'powershell' ? 'powershell' : 'bash',
    outputEncoding: 'utf-8',
    workId: null,
    command: String(command || '').trim(),
    cwd: cwd || '',
    status: Number(exitCode) === 0 ? 'done' : 'failed',
    output,
    stdout: output,
    stderr: '',
    exitCode,
    signal: null,
    error: null,
    startedAt: now,
    endedAt: now,
  }
}

export const useTerminalStore = create((set, get) => ({
  open: false,
  maximized: false,
  shell: 'bash',
  outputEncoding: 'utf-8',
  sessions: [],
  assistantReplies: [],
  commandHistory: [],
  activeSessionId: null,
  running: false,
  error: null,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false, maximized: false }),
  togglePanel: () => set((s) => ({ open: !s.open })),
  toggleMaximized: () => set((s) => ({ maximized: !s.maximized, open: true })),
  setMaximized: (maximized) => set({ maximized: !!maximized, open: true }),
  setShell: (shell) => set({ shell: shell === 'powershell' ? 'powershell' : 'bash' }),
  setOutputEncoding: (outputEncoding) => set({ outputEncoding: String(outputEncoding || '').trim() || 'utf-8' }),
  clear: () => set({ sessions: [], assistantReplies: [], activeSessionId: null, error: null }),
  rememberCommand: (command) => set((state) => ({
    commandHistory: appendCommandHistory(state.commandHistory, command),
  })),
  addLocalSession: (session) => set((state) => {
    const nextSession = makeLocalSession(session || {})
    return {
      sessions: upsertSession(state.sessions, nextSession),
      commandHistory: appendCommandHistory(state.commandHistory, nextSession.command),
      activeSessionId: nextSession.id,
      error: null,
      open: true,
    }
  }),
  addAssistantReply: (reply) => set((state) => ({
    assistantReplies: [{
      id: reply.id || `ta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'assistant',
      input: reply.input || '',
      title: reply.title || '',
      message: reply.message || '',
      bullets: Array.isArray(reply.bullets) ? reply.bullets : [],
      command: reply.command || '',
      cwd: reply.cwd || '',
      shell: reply.shell === 'powershell' ? 'powershell' : 'bash',
      loading: !!reply.loading,
      error: reply.error || '',
      createdAt: reply.createdAt || nowIso(),
    }, ...state.assistantReplies].slice(0, MAX_ASSISTANT_REPLIES),
  })),
  updateAssistantReply: (id, patch) => set((state) => ({
    assistantReplies: state.assistantReplies.map((reply) => (
      reply.id === id ? { ...reply, ...patch } : reply
    )),
  })),
  handleTerminalEvent: (event) => {
    if (!event || event.type !== 'terminal_event') return
    const data = event.data || {}
    if (!data.sessionId) return

    set((state) => {
      if (data.event === 'start') {
        const session = normalizeSession(data)
        return {
          sessions: upsertSession(state.sessions, session),
          commandHistory: appendCommandHistory(state.commandHistory, session.command),
          activeSessionId: session.id,
          error: null,
        }
      }

      const sessions = state.sessions.map((session) => {
        if (session.id !== data.sessionId) return session
        if (data.event === 'output') {
          const chunk = String(data.chunk || '')
          const stream = data.stream === 'stderr' ? 'stderr' : 'stdout'
          return {
            ...session,
            output: clampOutput(session.output + chunk),
            [stream]: clampOutput((session[stream] || '') + chunk),
          }
        }
        if (data.event === 'exit') {
          return {
            ...session,
            status: Number(data.exitCode) === 0 ? 'done' : 'failed',
            exitCode: data.exitCode,
            signal: data.signal || null,
            endedAt: data.endedAt || nowIso(),
          }
        }
        if (data.event === 'error') {
          return {
            ...session,
            status: 'failed',
            error: data.error || 'Shell command failed',
            endedAt: data.endedAt || nowIso(),
          }
        }
        return session
      })
      return { sessions, activeSessionId: state.activeSessionId || data.sessionId }
    })
  },
  runCommand: async (command, cwd, shell, outputEncoding) => {
    const trimmed = String(command || '').trim()
    if (!trimmed) return null
    const selectedShell = shell
      ? (shell === 'powershell' ? 'powershell' : 'bash')
      : get().shell
    const selectedEncoding = String(outputEncoding || get().outputEncoding || 'utf-8').trim() || 'utf-8'
    set((state) => ({ running: true, error: null, open: true, commandHistory: appendCommandHistory(state.commandHistory, trimmed) }))
    try {
      const res = await backendFetch('/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: trimmed,
          cwd: cwd || undefined,
          shell: selectedShell,
          outputEncoding: selectedEncoding,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Shell command failed')
      return data
    } catch (e) {
      set({ error: e.message || 'Shell command failed' })
      return null
    } finally {
      set({ running: false })
    }
  },
  stopCommand: async () => {
    const sessionId = get().activeSessionId
    try {
      await backendFetch('/terminal/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch (e) {
      set({ error: e.message || 'Failed to stop shell command' })
    } finally {
      set({ running: false })
    }
  },
  assistTerminal: async ({ input, cwd, shell, context }) => {
    const trimmed = String(input || '').trim()
    if (!trimmed) return null
    const id = `ta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const selectedShell = shell === 'powershell' ? 'powershell' : 'bash'
    get().addAssistantReply({
      id,
      input: trimmed,
      cwd: cwd || '',
      shell: selectedShell,
      title: '正在理解你的终端请求...',
      message: '',
      bullets: [],
      command: '',
      loading: true,
    })
    set({ running: true, error: null, open: true })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 35000)
    try {
      const res = await backendFetch('/terminal/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ input: trimmed, cwd: cwd || undefined, shell: selectedShell, context: context || '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'AI assistant failed')
      get().updateAssistantReply(id, {
        title: data.title || '我理解了你的请求。',
        message: data.message || '',
        bullets: Array.isArray(data.bullets) ? data.bullets : [],
        command: data.command || '',
        cwd: data.cwd || cwd || '',
        shell: data.shell === 'powershell' ? 'powershell' : selectedShell,
        loading: false,
        error: '',
      })
      return data
    } catch (e) {
      get().updateAssistantReply(id, {
        title: '终端助手暂时不可用。',
        message: e.message || '请稍后重试，或直接输入命令执行。',
        bullets: [],
        command: '',
        loading: false,
        error: e.message || 'AI assistant failed',
      })
      return null
    } finally {
      window.clearTimeout(timeout)
      set({ running: false })
    }
  },
  selectSession: (id) => set({ activeSessionId: id || get().activeSessionId }),
}))
