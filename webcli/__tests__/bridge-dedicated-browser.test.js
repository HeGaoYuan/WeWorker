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

/** Stand-in for BrowserHost: records control calls; `ready` decides what ensureReady does. */
function fakeHost({ mode = 'dedicated', ready = async () => true } = {}) {
  const listeners = new Set()
  return {
    mode,
    token: TOKEN,
    calls: [],
    detached: [],
    ensureReady: vi.fn(ready),
    status: () => ({ mode, status: 'running', browser: 'Chrome', extensionLoaded: true, extensionConnected: true }),
    onStatus: (listener) => { listeners.add(listener) },
    notify() { for (const listener of listeners) listener(this.status()) },
    async control(action, params, client) {
      this.calls.push({ action, params, client })
      if (action === 'open_url') throw new Error('Unknown browser action: open_url')
      return this.status()
    },
    detach(client) { this.detached.push(client) },
    shutdown: vi.fn(async () => {}),
  }
}

function createBridge(host = fakeHost()) {
  const bridge = Object.create(WebSocketBridge.prototype)
  bridge._clients = new Set()
  bridge._extensionWs = null
  bridge._extensionVersion = null
  bridge._extensionCapabilities = []
  bridge._pendingRequests = new Map()
  bridge._requestCounter = 0
  bridge._broadcast = vi.fn()
  bridge._handleExtensionMessage = vi.fn()
  bridge._clearCaptureModelContexts = vi.fn()
  bridge._adapterStateWatcher = { snapshot: () => null }
  bridge._browserHost = host
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
const sentTo = (ws) => ws.send.mock.calls.map(([value]) => JSON.parse(value))
const flush = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => { mocks.execFile.mockReset() })
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

  it('treats a wrong token, or any token in system mode, as the user\'s Chrome', () => {
    const bridge = createBridge()
    hello(connect(bridge), { instanceToken: 'not-the-token' })
    expect(bridge._activeExtensionInstance()).toBe('system')
    const system = createBridge(fakeHost({ mode: 'system' }))
    hello(connect(system), { instanceToken: TOKEN })
    expect(system._activeExtensionInstance()).toBe('system')
  })

  it('reports the serving browser to consumers that connect later', () => {
    const bridge = createBridge()
    hello(connect(bridge), { instanceToken: TOKEN })
    const consumer = connect(bridge)
    expect(sentTo(consumer)).toContainEqual(expect.objectContaining({ type: 'extension_connected', instance: 'dedicated' }))
  })
})

describe('requests in WeWorker browser mode', () => {
  it('makes sure the browser is ready before every extension request', async () => {
    const host = fakeHost()
    const bridge = createBridge(host)
    const extension = connect(bridge)
    hello(extension, { instanceToken: TOKEN })
    const request = bridge._request({ type: 'get_active_tab' }, 1000)
    await flush()
    expect(host.ensureReady).toHaveBeenCalledTimes(1)
    const sent = sentTo(extension).find((message) => message.type === 'get_active_tab')
    expect(sent).toBeTruthy()
    bridge._pendingRequests.get(sent.id).resolve(5)
    await expect(request).resolves.toBe(5)
  })

  it('surfaces why the browser could not start and never opens the user\'s Chrome', async () => {
    const host = fakeHost({ ready: async () => { throw new Error('WeWorker 浏览器未就绪：未找到 Chrome 或 Microsoft Edge') } })
    const bridge = createBridge(host)
    await expect(bridge.openBrowser('https://example.com/')).rejects.toThrow('未找到 Chrome')
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('opens the tab through the WeWorker browser extension', async () => {
    const bridge = createBridge()
    hello(connect(bridge), { instanceToken: TOKEN })
    bridge._request = vi.fn(async () => ({ tabId: 7 }))
    await expect(bridge.openBrowser('https://example.com/')).resolves.toMatchObject({ success: true, method: 'extension', tabId: 7 })
    expect(bridge._request).toHaveBeenCalledWith({ type: 'open_tab', url: 'https://example.com/' }, 5000)
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('keeps the old behaviour in system mode', async () => {
    const host = fakeHost({ mode: 'system', ready: async () => false })
    const bridge = createBridge(host)
    hello(connect(bridge))
    bridge._requestNow = vi.fn(async () => ({ tabId: 3 }))
    await expect(bridge.openBrowser('https://example.com/')).resolves.toMatchObject({ method: 'extension', tabId: 3 })
  })
})

describe('capture_screenshot', () => {
  const shot = { data: 'ZmFrZQ==', width: 1200, height: 675, crop: { cropped: true, croppedSize: 4 } }
  const screenshotHost = (captureTarget) => Object.assign(fakeHost(), { pageControl: true, captureTarget: vi.fn(captureTarget) })

  it('captures the tab of the last Adapter call through the WeWorker browser, not chrome.debugger', async () => {
    const host = screenshotHost(async () => shot)
    const bridge = createBridge(host)
    hello(connect(bridge), { instanceToken: TOKEN })
    bridge._requestNow = vi.fn(async () => ({ tabId: 7, url: 'https://example.com/checkout', reason: 'last_tool_call', targetId: 'target-7' }))
    const result = await bridge._callToolInner('capture_screenshot', {}, 'fixturetrace1')
    expect(result).toEqual({ ...shot, fullPage: false, tabId: 7, url: 'https://example.com/checkout' })
    expect(bridge._requestNow).toHaveBeenCalledTimes(1)
    expect(bridge._requestNow).toHaveBeenCalledWith({ type: 'screenshot_target' }, expect.any(Number), 'fixturetrace1')
    expect(host.captureTarget).toHaveBeenCalledWith('target-7', expect.objectContaining({ fullPage: false }))
  })

  it('falls back to the extension for the same tab when the browser capture fails', async () => {
    const host = screenshotHost(async () => { throw new Error('Page.captureScreenshot 超时（15000 ms）') })
    const bridge = createBridge(host)
    hello(connect(bridge), { instanceToken: TOKEN })
    bridge._requestNow = vi.fn(async (msg) => (msg.type === 'screenshot_target'
      ? { tabId: 7, url: 'https://example.com/checkout', reason: 'last_tool_call', targetId: 'target-7' }
      : shot))
    await expect(bridge.captureScreenshot(true, 'fixturetrace2')).resolves.toEqual(shot)
    expect(bridge._requestNow).toHaveBeenLastCalledWith({ type: 'capture_screenshot', fullPage: true, tabId: 7 }, 30000, 'fixturetrace2')
  })

  it('uses the extension directly with the user\'s Chrome', async () => {
    const host = Object.assign(fakeHost({ mode: 'system', ready: async () => false }), { pageControl: false, captureTarget: vi.fn() })
    const bridge = createBridge(host)
    hello(connect(bridge))
    bridge._requestNow = vi.fn(async () => shot)
    await expect(bridge.captureScreenshot(false, 'fixturetrace3')).resolves.toEqual(shot)
    expect(bridge._requestNow).toHaveBeenCalledWith({ type: 'capture_screenshot', fullPage: false }, 30000, 'fixturetrace3')
    expect(host.captureTarget).not.toHaveBeenCalled()
  })

  it('tells the model how a desktop user can see the page when the capture fails', async () => {
    const bridge = createBridge(fakeHost({ mode: 'system', ready: async () => false }))
    hello(connect(bridge))
    bridge._requestNow = vi.fn(async () => { throw new Error('debugger.attach 超时（5000 ms）') })
    const error = await bridge.captureScreenshot().catch((caught) => caught)
    expect(error.message).toContain('截图失败: debugger.attach 超时')
    expect(error.message).toContain('左侧栏底部的浏览器图标')
  })
})

describe('browser_control', () => {
  it('answers the sender, publishes status changes to control clients only, and detaches on close', async () => {
    const host = fakeHost()
    const bridge = createBridge(host)
    const desktop = connect(bridge)
    const extension = connect(bridge)
    hello(extension, { instanceToken: TOKEN })
    desktop.emit('message', JSON.stringify({ type: 'browser_control', id: 'c1', action: 'attach' }))
    await flush()
    expect(host.calls).toEqual([{ action: 'attach', params: { mode: undefined }, client: desktop }])
    expect(sentTo(desktop)).toContainEqual({ type: 'browser_control_result', id: 'c1', ok: true, browser: host.status() })

    desktop.emit('message', JSON.stringify({ type: 'browser_control', id: 'c2', action: 'open_url', url: 'https://example.com/' }))
    await flush()
    expect(sentTo(desktop)).toContainEqual(expect.objectContaining({ type: 'browser_control_result', id: 'c2', ok: false, error: 'Unknown browser action: open_url' }))

    host.notify()
    expect(sentTo(desktop)).toContainEqual({ type: 'browser_status', browser: host.status() })
    expect(sentTo(extension).some((message) => message.type === 'browser_status')).toBe(false)

    close(desktop)
    expect(host.detached).toEqual([desktop])
  })
})
