import test from 'node:test'
import assert from 'node:assert/strict'
import { BrowserControlClient, normalizeBrowserMode } from '../dedicated-browser.js'

const tick = () => new Promise((resolve) => setImmediate(resolve))
const RUNNING = { mode: 'dedicated', status: 'running', browser: 'Chrome', extensionLoaded: true, extensionConnected: true }

/** WebSocket double: records what the client sends; the test plays the Bridge. */
function fakeSockets() {
  const sockets = []
  class FakeWebSocket {
    constructor(url) {
      this.url = url
      this.readyState = 0
      this.sent = []
      this.listeners = {}
      sockets.push(this)
    }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener) }
    emit(type, event = {}) { for (const listener of this.listeners[type] ?? []) listener(event) }
    send(data) { this.sent.push(JSON.parse(data)) }
    close() { this.readyState = 3 }
    // Bridge side
    open() { this.readyState = 1; this.emit('open') }
    reply(message) { this.emit('message', { data: JSON.stringify(message) }) }
    drop() { this.readyState = 3; this.emit('close') }
  }
  return { FakeWebSocket, sockets }
}

function client(options = {}) {
  const { FakeWebSocket, sockets } = fakeSockets()
  const instance = new BrowserControlClient({ WebSocketImpl: FakeWebSocket, reconnectMs: 5, attachTimeoutMs: 20, requestTimeoutMs: 50, ...options })
  return { instance, sockets }
}

test('browser mode defaults to WeWorker browser', () => {
  assert.equal(normalizeBrowserMode(undefined), 'dedicated')
  assert.equal(normalizeBrowserMode('system'), 'system')
  assert.equal(normalizeBrowserMode('other'), 'dedicated')
})

test('attaches on connect and mirrors the status the Bridge reports and publishes', async () => {
  const { instance, sockets } = client()
  const seen = []
  instance.onStatus((status) => seen.push(status.status))
  assert.equal(instance.getStatus().status, 'bridge_unavailable')
  instance.start()
  const [ws] = sockets
  assert.equal(ws.url, 'ws://localhost:3711')
  ws.open()
  assert.deepEqual(ws.sent, [{ type: 'browser_control', id: 'desktop-1', action: 'attach' }])
  ws.reply({ type: 'browser_control_result', id: 'desktop-1', ok: true, browser: { ...RUNNING, status: 'starting' } })
  ws.reply({ type: 'browser_status', browser: RUNNING })
  assert.deepEqual(instance.getStatus(), RUNNING)
  assert.deepEqual(seen, ['starting', 'running'])
  instance.stop()
})

test('sends fixed actions and resolves or rejects with the Bridge reply', async () => {
  const { instance, sockets } = client()
  await assert.rejects(instance.request('show'), /Bridge 未连接/)
  instance.start()
  const [ws] = sockets
  ws.open()
  const shown = instance.request('show')
  ws.reply({ type: 'browser_control_result', id: 'desktop-2', ok: true, browser: RUNNING })
  assert.deepEqual(await shown, RUNNING)
  const switched = instance.request('set_mode', { mode: 'system' })
  assert.deepEqual(ws.sent.at(-1), { type: 'browser_control', id: 'desktop-3', action: 'set_mode', mode: 'system' })
  ws.reply({ type: 'browser_control_result', id: 'desktop-3', ok: false, error: '浏览器模式由环境变量固定', browser: RUNNING })
  await assert.rejects(switched, /环境变量/)
  await assert.rejects(instance.request('hide'), /Bridge 未响应/)
  instance.stop()
})

test('reports an older Bridge that ignores browser control', async () => {
  const { instance, sockets } = client()
  instance.start()
  sockets[0].open()
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(instance.getStatus().status, 'bridge_unavailable')
  assert.match(instance.getStatus().detail, /不支持 WeWorker 浏览器/)
  instance.stop()
})

test('reconnects and re-attaches after the Bridge restarts, keeping the last known mode', async () => {
  const { instance, sockets } = client()
  instance.start()
  sockets[0].open()
  sockets[0].reply({ type: 'browser_control_result', id: 'desktop-1', ok: true, browser: { ...RUNNING, mode: 'system', status: 'stopped' } })
  const pending = instance.request('status')
  sockets[0].drop()
  await assert.rejects(pending, /closed/)
  assert.deepEqual({ mode: instance.getStatus().mode, status: instance.getStatus().status }, { mode: 'system', status: 'bridge_unavailable' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(sockets.length, 2)
  sockets[1].open()
  assert.equal(sockets[1].sent[0].action, 'attach')
  instance.stop()
  await tick()
  sockets[1].drop()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(sockets.length, 2, 'no reconnect after stop')
})
