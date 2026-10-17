import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  return { WebSocketServer: class extends EventEmitter {} }
})
vi.mock('child_process', async (importOriginal) => ({ ...(await importOriginal()), execFile: mocks.execFile }))
vi.mock('../open-browser-policy.js', () => ({
  assertAllowedOpenBrowserUrl: (url) => url,
  buildAllowedOpenBrowserOrigins: () => [],
  loadAdapterManifests: () => [],
}))
vi.mock('../adapter-host.js', () => ({
  describeAdapterCatalog: () => ({ adapters: [] }),
  readAdapterBundle: vi.fn(),
  resolveAdapterCall: vi.fn(),
}))

const { WebSocketBridge } = await import('../bridge.js')

const TOKEN = 'fixture-dedicated-browser-token-0123456789'

function createBridge() {
  const bridge = Object.create(WebSocketBridge.prototype)
  bridge._clients = new Set()
  bridge._extensionWs = null
  bridge._extensionVersion = null
  bridge._extensionCapabilities = []
  bridge._broadcast = vi.fn()
  bridge._handleExtensionMessage = vi.fn()
  bridge._clearCaptureModelContexts = vi.fn()
  bridge._adapterStateWatcher = { snapshot: () => null }
  bridge._startServer()
  return bridge
}

function connect(bridge) {
  const ws = new EventEmitter()
  ws.readyState = 1
  ws.send = vi.fn()
  bridge._wss.emit('connection', ws, { headers: { origin: 'chrome-extension://fixtureid' } })
  return ws
}

const hello = (ws, extra = {}) => ws.emit('message', JSON.stringify({ type: 'extension_hello', version: '1.1.0', capabilities: [], ...extra }))
const close = (ws) => { ws.readyState = 3; ws.emit('close') }
const connectedEvents = (bridge) => bridge._broadcast.mock.calls.map(([event]) => event).filter((event) => event.type.startsWith('extension_'))

beforeEach(() => {
  vi.stubEnv('WEWORKER_DEDICATED_BROWSER_TOKEN', TOKEN)
  mocks.execFile.mockReset()
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('bridge with WeWorker browser and the user\'s Chrome', () => {
  it('prefers the WeWorker browser extension and keeps it when another browser says hello', () => {
    const bridge = createBridge()
    const own = connect(bridge)
    hello(own)
    expect(bridge._extensionWs).toBe(own)
    const dedicated = connect(bridge)
    hello(dedicated, { instanceToken: TOKEN })
    expect(bridge._extensionWs).toBe(dedicated)
    // A later hello from the user's Chrome (reconnect or heartbeat) does not take over.
    hello(own)
    hello(connect(bridge))
    expect(bridge._extensionWs).toBe(dedicated)
    expect(connectedEvents(bridge)).toEqual([
      expect.objectContaining({ type: 'extension_connected', instance: 'system' }),
      expect.objectContaining({ type: 'extension_connected', instance: 'dedicated' }),
    ])
    // Heartbeats repeat the hello without new broadcasts.
    hello(dedicated, { instanceToken: TOKEN, heartbeat: true })
    expect(connectedEvents(bridge)).toHaveLength(2)
  })

  it('hands over to the remaining extension instead of reporting a disconnect', () => {
    const bridge = createBridge()
    const own = connect(bridge)
    hello(own)
    const dedicated = connect(bridge)
    hello(dedicated, { instanceToken: TOKEN })
    close(dedicated)
    expect(bridge._extensionWs).toBe(own)
    expect(connectedEvents(bridge).at(-1)).toEqual(expect.objectContaining({ type: 'extension_connected', instance: 'system' }))
    close(own)
    expect(bridge._extensionWs).toBeNull()
    expect(connectedEvents(bridge).at(-1)).toEqual({ type: 'extension_disconnected' })
  })

  it('treats a missing or wrong token as the user\'s Chrome', () => {
    const bridge = createBridge()
    const ws = connect(bridge)
    hello(ws, { instanceToken: 'not-the-token' })
    expect(bridge._activeExtensionInstance()).toBe('system')
    vi.stubEnv('WEWORKER_DEDICATED_BROWSER_TOKEN', '')
    const other = connect(bridge)
    hello(other, { instanceToken: '' })
    expect(bridge._activeExtensionInstance()).toBe('system')
  })

  it('reports the serving browser to consumers that connect later', () => {
    const bridge = createBridge()
    hello(connect(bridge), { instanceToken: TOKEN })
    const consumer = connect(bridge)
    const sent = consumer.send.mock.calls.map(([value]) => JSON.parse(value))
    expect(sent).toContainEqual(expect.objectContaining({ type: 'extension_connected', instance: 'dedicated' }))
  })
})

describe('open_browser in WeWorker browser mode', () => {
  it('never starts the user\'s Chrome and fails clearly when the browser is not ready', async () => {
    vi.stubEnv('WEWORKER_BROWSER_MODE', 'dedicated')
    vi.useFakeTimers()
    const bridge = createBridge()
    const opening = bridge.openBrowser('https://example.com/')
    const outcome = expect(opening).rejects.toThrow('WeWorker 浏览器尚未就绪')
    await vi.advanceTimersByTimeAsync(16_000)
    await outcome
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('opens the tab through the connected extension', async () => {
    vi.stubEnv('WEWORKER_BROWSER_MODE', 'dedicated')
    const bridge = createBridge()
    hello(connect(bridge), { instanceToken: TOKEN })
    bridge._request = vi.fn(async () => ({ tabId: 7 }))
    await expect(bridge.openBrowser('https://example.com/')).resolves.toMatchObject({ success: true, method: 'extension', tabId: 7 })
    expect(bridge._request).toHaveBeenCalledWith({ type: 'open_tab', url: 'https://example.com/' }, 5000)
    expect(mocks.execFile).not.toHaveBeenCalled()
  })
})
