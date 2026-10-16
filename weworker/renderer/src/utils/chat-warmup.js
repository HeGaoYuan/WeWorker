/**
 * Ask the Backend to start the Claude Code process while the user is typing,
 * so the first message of a conversation skips the CLI startup (several
 * seconds). Requests are throttled per target; the Backend ignores a warm-up
 * when a session already exists.
 */
export const CHAT_WARMUP_INTERVAL_MS = 60_000
export const WELCOME_WARMUP_TARGET = 'welcome'

/** Text change that should trigger a warm-up: an empty composer starts a chat message. */
export function shouldWarmupOnTextChange(previousText, nextText) {
  const next = String(nextText || '').trimStart()
  if (!next) return false
  // `!command` runs a local shell command, not a model turn.
  if (next.startsWith('!')) return false
  return !String(previousText || '').trim()
}

export function createChatWarmupScheduler({ send, now = () => Date.now(), intervalMs = CHAT_WARMUP_INTERVAL_MS }) {
  const lastSent = new Map()
  return function requestChatWarmup(workId, payload = {}) {
    const key = workId || WELCOME_WARMUP_TARGET
    const at = now()
    const previous = lastSent.get(key)
    if (previous !== undefined && at - previous < intervalMs) return false
    lastSent.set(key, at)
    // Best effort: a failed warm-up only means the first turn starts cold.
    Promise.resolve()
      .then(() => send(workId || null, payload))
      .catch(() => {})
    return true
  }
}
