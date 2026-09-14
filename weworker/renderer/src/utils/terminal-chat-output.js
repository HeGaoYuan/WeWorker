const MAX_LIVE_OUTPUT_CHARS = 120000
const MAX_TERMINAL_EVENT_SESSIONS = 64
const MAX_TERMINAL_EVENT_KEYS_PER_SESSION = 200
const seenTerminalEventKeys = new Map()

function clampLiveOutput(text) {
  const value = String(text || '')
  if (value.length <= MAX_LIVE_OUTPUT_CHARS) return value
  return value.slice(value.length - MAX_LIVE_OUTPUT_CHARS)
}

export function isWeWorkerShellToolName(name) {
  const value = String(name || '')
  return value === 'weworker_powershell'
    || value === 'mcp__weworker__weworker_powershell'
    || value.endsWith('__weworker_powershell')
}

function commandMatches(block, data) {
  const blockCommand = String(block?.args?.command || '').trim()
  const eventCommand = String(data?.command || '').trim()
  if (!blockCommand || !eventCommand) return true
  return blockCommand === eventCommand
}

function terminalEventKey(data) {
  return [
    data.event || '',
    data.stream || '',
    data.at || '',
    data.chunk || data.error || '',
  ].join('\u001f')
}

function terminalEventSessionKey(data) {
  return [data.workId || '', data.sessionId || ''].join('\u001f')
}

function hasSeenTerminalEvent(data) {
  const sessionKey = terminalEventSessionKey(data)
  const key = terminalEventKey(data)
  const existing = seenTerminalEventKeys.get(sessionKey)
  if (existing?.has(key)) return true

  const next = existing || new Set()
  next.add(key)
  while (next.size > MAX_TERMINAL_EVENT_KEYS_PER_SESSION) {
    const oldest = next.values().next().value
    next.delete(oldest)
  }
  if (!existing && seenTerminalEventKeys.size >= MAX_TERMINAL_EVENT_SESSIONS) {
    const oldestSession = seenTerminalEventKeys.keys().next().value
    seenTerminalEventKeys.delete(oldestSession)
  }
  seenTerminalEventKeys.set(sessionKey, next)
  return false
}

function appendChunkToContent(content, data) {
  const chunk = data.event === 'error'
    ? String(data.error || '')
    : String(data.chunk || '')
  if (!chunk) return content

  let matched = false
  const next = [...content]
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const block = next[index]
    if (
      block?.type === 'tool_use'
      && block.status === 'running'
      && isWeWorkerShellToolName(block.name)
      && commandMatches(block, data)
    ) {
      if (hasSeenTerminalEvent(data)) return content
      next[index] = {
        ...block,
        terminalSessionId: data.sessionId || block.terminalSessionId,
        liveOutput: clampLiveOutput(String(block.liveOutput || '') + chunk),
      }
      matched = true
      break
    }
  }
  return matched ? next : content
}

function finishTerminalContent(content, data) {
  let matched = false
  const next = [...content]
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const block = next[index]
    if (
      block?.type === 'tool_use'
      && block.status === 'running'
      && isWeWorkerShellToolName(block.name)
      && commandMatches(block, data)
    ) {
      next[index] = {
        ...block,
        terminalSessionId: data.sessionId || block.terminalSessionId,
        status: Number(data.exitCode) === 0 ? 'done' : 'failed',
        result: block.result || JSON.stringify({ output: block.liveOutput || '', exitCode: data.exitCode ?? null }),
      }
      matched = true
      break
    }
  }
  return matched ? next : content
}

export function applyTerminalEventToMessages(messages, event) {
  if (!event || event.type !== 'terminal_event') return messages
  const data = event.data || {}
  if (data.event !== 'output' && data.event !== 'error' && data.event !== 'exit') return messages
  if (!data.sessionId) return messages

  let changed = false
  const nextMessages = messages.map((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) return message
    const nextContent = data.event === 'exit'
      ? finishTerminalContent(message.content, data)
      : appendChunkToContent(message.content, data)
    if (nextContent === message.content) return message
    changed = true
    return { ...message, content: nextContent }
  })

  return changed ? nextMessages : messages
}
