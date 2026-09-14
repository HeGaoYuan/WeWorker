import { backendFetch } from './http.js'

function normalizeBackendError(message, maxChatAttachments = 60) {
  if (String(message || '').includes('too many attachments')) {
    return `一次最多发送 ${maxChatAttachments} 个附件`
  }
  return message
}

export async function streamChat(workId, message, onEvent, signal, attachments = [], maxChatAttachments = 60, modelMessage = message) {
  console.log(`[frontend] streamChat called, workId=${workId}, signal.aborted=${signal?.aborted}`)
  const res = await backendFetch(`/works/${workId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, modelMessage, attachments }),
    signal,
  })

  console.log(`[frontend] fetch response received, status=${res.status}`)

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(normalizeBackendError(err.detail || 'Request failed', maxChatAttachments))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('[frontend] reader done')
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          onEvent(JSON.parse(data))
        } catch {}
      }
    }
  } catch (e) {
    console.log(`[frontend] streamChat error: ${e.name} — ${e.message}`)
    throw e
  }
}

export async function getSites() {
  const res = await backendFetch('/sites')
  return res.json()
}

export async function submitUserChoice(workId, answer) {
  const res = await backendFetch(`/works/${workId}/user-choice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  return res.json()
}
