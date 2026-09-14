import { Socket } from 'net'

export function isPortOccupied(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    const finish = (occupied) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(occupied)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

export async function probeHttpJson(url, timeout = 1500, token = '') {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const attemptTimeout = Math.max(1, Math.min(500, deadline - Date.now()))
      const response = await fetch(url, {
        headers: token ? { 'X-WeWorker-Auth': token } : undefined,
        signal: AbortSignal.timeout(attemptTimeout),
      })
      if (response.ok) {
        const payload = await response.json()
        return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

export function isStandaloneWeWorkerBackend(payload) {
  return payload?.service === 'weworker-backend'
    && payload?.runtime_mode === 'standalone'
    && !String(payload?.backend_instance_id || '').trim()
}

export async function waitForHttpInstance(url, timeout, token = '', expectedInstanceId = '') {
  const deadline = Date.now() + timeout
  let lastStatus = 0
  let lastInstanceId = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        headers: token ? { 'X-WeWorker-Auth': token } : undefined,
      })
      lastStatus = response.status
      if (response.ok) {
        if (!expectedInstanceId) return
        const payload = await response.json()
        lastInstanceId = String(payload?.backend_instance_id || '')
        if (lastInstanceId === expectedInstanceId) return
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const details = expectedInstanceId
    ? ` (last status ${lastStatus || 'unreachable'}, instance ${lastInstanceId || 'unknown'})`
    : ''
  throw new Error(`Timeout waiting for ${url}${details}`)
}

export function formatProcessExitCode(code) {
  if (!Number.isFinite(Number(code))) return String(code)
  const numeric = Number(code)
  const unsigned = numeric >>> 0
  const hex = `0x${unsigned.toString(16).padStart(8, '0')}`
  const known = {
    0xc0000005: 'access violation',
    0xc00000fd: 'stack overflow',
    0xc0000409: 'fail-fast / stack buffer overrun (often a native or V8 fatal error)',
  }
  return `${numeric} (${hex}${known[unsigned] ? `: ${known[unsigned]}` : ''})`
}
