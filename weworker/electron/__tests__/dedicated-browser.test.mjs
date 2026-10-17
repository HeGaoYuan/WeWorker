import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import {
  BROWSER_INSTANCE_STORAGE_KEY,
  DedicatedBrowserManager,
  OFFSCREEN_POSITION,
  browserExecutableCandidates,
  buildBrowserArgs,
  createCdpPipe,
  findBrowserExecutable,
  loadInstanceToken,
  markExtensionInstance,
  normalizeBrowserMode,
  resolveBundledExtensionDir,
} from '../dedicated-browser.js'

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-browser-test-'))
const tick = () => new Promise((resolve) => setImmediate(resolve))

/**
 * Fake browser process: answers CDP requests written to fd 3 on fd 4.
 * `handlers[method]` returns a result object or throws to send a CDP error.
 */
function fakeBrowser({ handlers = {}, exitOnLaunch = null } = {}) {
  const requests = []
  const child = new EventEmitter()
  child.pid = 4321
  const toBrowser = new Writable({
    write(chunk, _encoding, done) {
      buffered += chunk.toString('utf8')
      let end
      while ((end = buffered.indexOf('\0')) >= 0) {
        const message = JSON.parse(buffered.slice(0, end))
        buffered = buffered.slice(end + 1)
        requests.push(message)
        respond(message)
      }
      done()
    },
  })
  let buffered = ''
  const fromBrowser = new PassThrough()
  const stderr = new PassThrough()
  child.stdio = [null, null, stderr, toBrowser, fromBrowser]
  child.stderr = stderr
  child.exitCode = null
  child.exit = (code = 0) => {
    if (child.exitCode !== null) return
    child.exitCode = code
    fromBrowser.end()
    setImmediate(() => child.emit('exit', code, null))
  }
  const respond = (message) => {
    setImmediate(() => {
      const handler = handlers[message.method] ?? defaultHandlers[message.method] ?? (() => ({}))
      try {
        const result = handler(message.params, message)
        fromBrowser.write(`${JSON.stringify({ id: message.id, result })}\0`)
      } catch (error) {
        fromBrowser.write(`${JSON.stringify({ id: message.id, error: { code: -32000, message: error.message } })}\0`)
      }
      if (message.method === 'Browser.close') child.exit(0)
    })
  }
  const defaultHandlers = {
    'Browser.getVersion': () => ({ product: 'Chrome/155.0.0.0' }),
    'Extensions.loadUnpacked': () => ({ id: 'abcdefghijklmnopabcdefghijklmnop' }),
    'Target.createTarget': () => ({ targetId: 'page-1' }),
    'Browser.getWindowForTarget': () => ({ windowId: 9, bounds: { left: OFFSCREEN_POSITION, top: OFFSCREEN_POSITION, windowState: 'normal' } }),
    'Target.getTargets': () => ({ targetInfos: [
      { targetId: 'page-1', type: 'page', url: 'about:blank' },
      { targetId: 'sw-1', type: 'service_worker', url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/background/service-worker.js' },
    ] }),
    'Target.attachToTarget': () => ({ sessionId: 'session-1' }),
    'Runtime.evaluate': () => ({ result: { type: 'string', value: 'ok' } }),
  }
  if (exitOnLaunch !== null) setImmediate(() => child.exit(exitOnLaunch))
  return { child, requests, methods: () => requests.map((request) => request.method) }
}

function manager(options = {}) {
  const browserHome = options.browserHome ?? tempDir()
  const launches = []
  const killed = []
  const queue = [...(options.browsers ?? [])]
  const instance = new DedicatedBrowserManager({
    browserHome,
    extensionDir: 'extensionDir' in options ? options.extensionDir : 'C:/weworker-fixtures/extension',
    instanceToken: 'fixture-instance-token-0123456789abcdef',
    platform: 'win32',
    findExecutable: options.findExecutable ?? (() => ({ path: 'C:/weworker-fixtures/chrome.exe', name: 'Chrome' })),
    spawn: (command, args, spawnOptions) => {
      const browser = queue.shift() ?? fakeBrowser()
      launches.push({ command, args, spawnOptions, browser })
      return browser.child
    },
    killTree: (child) => { killed.push(child.pid); child.exit?.(1) },
    restartDelaysMs: [5, 5, 5, 5, 5],
    profileInUseRetryMs: 5,
    ...options.overrides,
  })
  return { instance, launches, killed, browserHome }
}

test('browser mode defaults to WeWorker browser', () => {
  assert.equal(normalizeBrowserMode(undefined), 'dedicated')
  assert.equal(normalizeBrowserMode('system'), 'system')
  assert.equal(normalizeBrowserMode('other'), 'dedicated')
})

test('finds Chrome before Edge and honours an explicit executable', () => {
  const env = { ProgramFiles: 'C:/Program Files', 'ProgramFiles(x86)': 'C:/Program Files (x86)', LOCALAPPDATA: 'C:/Users/weworker-test/AppData/Local' }
  const candidates = browserExecutableCandidates({ platform: 'win32', env })
  assert.equal(candidates[0].name, 'Chrome')
  assert.ok(candidates.findIndex((c) => c.name === 'Microsoft Edge') > candidates.findLastIndex((c) => c.name === 'Chrome'))
  const edgeOnly = findBrowserExecutable({ platform: 'win32', env, exists: (file) => file.endsWith('msedge.exe') })
  assert.equal(edgeOnly.name, 'Microsoft Edge')
  const explicit = findBrowserExecutable({ platform: 'win32', env: { ...env, WEWORKER_BROWSER_EXECUTABLE: 'C:/weworker-fixtures/chrome.exe' }, exists: () => true })
  assert.equal(explicit.path, 'C:/weworker-fixtures/chrome.exe')
  assert.equal(findBrowserExecutable({ platform: 'win32', env, exists: () => false }), null)
  const mac = browserExecutableCandidates({ platform: 'darwin', env: {}, home: '/Users/weworker-test' })
  assert.match(mac[0].path, /Google Chrome\.app/)
})

test('uses the packaged extension, or the built extension in development', () => {
  const have = (...dirs) => (file) => dirs.some((dir) => file === path.join(dir, 'manifest.json'))
  assert.equal(resolveBundledExtensionDir({ packaged: true, resourcesPath: 'R', repoRoot: 'X', exists: have(path.join('R', 'extension')) }), path.join('R', 'extension'))
  const built = path.join('X', 'weworker', 'build', 'extension-dist')
  assert.equal(resolveBundledExtensionDir({ packaged: false, resourcesPath: 'R', repoRoot: 'X', exists: have(built, path.join('X', 'extension')) }), built)
  assert.equal(resolveBundledExtensionDir({ packaged: false, resourcesPath: 'R', repoRoot: 'X', exists: have(path.join('X', 'extension')) }), path.join('X', 'extension'))
  assert.equal(resolveBundledExtensionDir({ packaged: true, resourcesPath: 'R', repoRoot: 'X', exists: () => false }), null)
})

test('launch flags use a private profile, the CDP pipe and an off-screen window', () => {
  const args = buildBrowserArgs({ userDataDir: 'C:/weworker-fixtures/profile' })
  assert.ok(args.includes('--user-data-dir=C:/weworker-fixtures/profile'))
  for (const flag of ['--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-startup-window', '--no-first-run', '--disable-backgrounding-occluded-windows']) {
    assert.ok(args.includes(flag), flag)
  }
  assert.ok(args.includes(`--window-position=${OFFSCREEN_POSITION},${OFFSCREEN_POSITION}`))
  assert.equal(args.some((arg) => arg.startsWith('--remote-debugging-port') || arg.startsWith('--load-extension')), false)
})

test('the instance token is stable for a profile and replaced when invalid', () => {
  const dir = tempDir()
  const first = loadInstanceToken(dir)
  assert.match(first, /^[A-Za-z0-9_-]{32,}$/)
  assert.equal(loadInstanceToken(dir), first)
  fs.writeFileSync(path.join(dir, 'instance.json'), '{"token":"short"}')
  assert.notEqual(loadInstanceToken(dir), first)
})

test('the CDP pipe parses split frames, routes events and fails pending calls on close', async () => {
  const written = []
  const readable = new PassThrough()
  const cdp = createCdpPipe({ write: (data) => written.push(data) }, readable)
  const events = []
  cdp.onEvent((event) => events.push(event.method))
  const first = cdp.send('Browser.getVersion')
  const second = cdp.send('Target.getTargets', {}, 'session-1')
  assert.deepEqual(written.map((frame) => JSON.parse(frame.slice(0, -1))), [
    { id: 1, method: 'Browser.getVersion', params: {} },
    { id: 2, method: 'Target.getTargets', params: {}, sessionId: 'session-1' },
  ])
  const reply = `${JSON.stringify({ method: 'Target.targetCreated', params: {} })}\0${JSON.stringify({ id: 1, result: { product: 'Chrome' } })}\0${JSON.stringify({ id: 2, error: { code: -32601, message: 'not found' } })}\0`
  readable.write(reply.slice(0, 20))
  readable.write(reply.slice(20))
  assert.deepEqual(await first, { product: 'Chrome' })
  await assert.rejects(second, /not found/)
  assert.deepEqual(events, ['Target.targetCreated'])
  const pending = cdp.send('Browser.close')
  readable.end()
  await assert.rejects(pending, /closed/)
  await assert.rejects(cdp.send('Browser.getVersion'), /closed/)
})

test('marks the extension from inside its service worker, waiting for it to be ready', async () => {
  let targetsCalls = 0
  let evaluations = 0
  const sent = []
  const cdp = {
    async send(method, params, sessionId) {
      sent.push([method, sessionId ?? null])
      if (method === 'Target.getTargets') {
        targetsCalls += 1
        return { targetInfos: targetsCalls < 2 ? [] : [{ targetId: 'sw', type: 'service_worker', url: 'chrome-extension://extid/background/service-worker.js' }] }
      }
      if (method === 'Target.attachToTarget') return { sessionId: 's1' }
      if (method === 'Runtime.evaluate') {
        evaluations += 1
        assert.match(params.expression, new RegExp(BROWSER_INSTANCE_STORAGE_KEY))
        assert.match(params.expression, /fixture-token/)
        return evaluations < 2
          ? { exceptionDetails: { exception: { description: 'ReferenceError: chrome is not defined' } } }
          : { result: { value: 'ok' } }
      }
      return {}
    },
  }
  await markExtensionInstance(cdp, 'extid', { kind: 'dedicated', token: 'fixture-token' }, { pollMs: 1 })
  assert.equal(evaluations, 2)
  assert.deepEqual(sent.at(-1), ['Target.detachFromTarget', null])
  const failing = { send: async (method) => (method === 'Target.getTargets' ? { targetInfos: [] } : {}) }
  await assert.rejects(markExtensionInstance(failing, 'extid', {}, { timeoutMs: 5, pollMs: 1 }), /did not start/)
})

test('starts the browser off-screen with the extension and its instance marker, then stops it gracefully', async () => {
  const { instance, launches, killed } = manager()
  const status = await instance.start()
  assert.deepEqual(status, { status: 'running', browser: 'Chrome', extensionLoaded: true })
  const [{ browser, spawnOptions, args }] = launches
  assert.deepEqual(spawnOptions.stdio, ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'])
  assert.equal(spawnOptions.detached, false)
  assert.ok(args.some((arg) => arg.startsWith('--user-data-dir=') && arg.endsWith('profile')))
  assert.deepEqual(browser.methods().slice(0, 3), ['Browser.getVersion', 'Extensions.loadUnpacked', 'Target.createTarget'])
  assert.deepEqual(browser.requests.find((r) => r.method === 'Extensions.loadUnpacked').params, { path: 'C:/weworker-fixtures/extension' })
  assert.equal(browser.requests.find((r) => r.method === 'Target.createTarget').params.background, true)
  const marker = browser.requests.find((r) => r.method === 'Runtime.evaluate')
  assert.equal(marker.sessionId, 'session-1')
  assert.match(marker.params.expression, /fixture-instance-token-0123456789abcdef/)

  await instance.stop()
  assert.equal(instance.getStatus().status, 'stopped')
  assert.ok(browser.methods().includes('Browser.close'))
  assert.deepEqual(killed, [])
  assert.equal(launches.length, 1)
})

test('shows the window on-screen for sign-in and hides it again', async () => {
  const bounds = []
  const browser = fakeBrowser({
    handlers: {
      'Browser.setWindowBounds': (params) => { bounds.push(params.bounds); return {} },
    },
  })
  const { instance } = manager({ browsers: [browser] })
  await instance.start()
  await instance.show()
  assert.deepEqual(bounds[0], { left: 120, top: 80, width: 1280, height: 860 })
  assert.ok(browser.methods().includes('Target.activateTarget'))
  await instance.hide()
  assert.deepEqual(bounds.at(-1), { left: OFFSCREEN_POSITION, top: OFFSCREEN_POSITION })
  await instance.stop()
})

test('show() also moves a window whose parked position Chrome clamped', async () => {
  // Real Chrome reports -32000 back as about -18725 on Windows.
  const bounds = []
  const browser = fakeBrowser({
    handlers: {
      'Browser.getWindowForTarget': () => ({ windowId: 9, bounds: { left: -18725, top: -18725, windowState: 'normal' } }),
      'Browser.setWindowBounds': (params) => { bounds.push(params.bounds); return {} },
    },
  })
  const { instance } = manager({ browsers: [browser] })
  await instance.start()
  await instance.show()
  assert.deepEqual(bounds, [{ left: 120, top: 80, width: 1280, height: 860 }])
  await instance.stop()
})

test('reports a profile used by another process and retries without killing it', async () => {
  const handedOver = fakeBrowser({ exitOnLaunch: 0, handlers: { 'Browser.getVersion': () => { throw new Error('closed') } } })
  // Never answers: the profile owner keeps running elsewhere.
  handedOver.child.stdio[3] = new Writable({ write(_chunk, _encoding, done) { done() } })
  const { instance, launches, killed } = manager({ browsers: [handedOver] })
  const seen = new Set()
  const watch = setInterval(() => seen.add(instance.getStatus().status), 1)
  await instance.start()
  await tick()
  await new Promise((resolve) => setTimeout(resolve, 30))
  clearInterval(watch)
  assert.ok(seen.has('profile_in_use'), [...seen].join(','))
  assert.ok(launches.length >= 2, 'retries later')
  // The launcher already exited after handing over; nothing is killed.
  assert.deepEqual(killed, [])
  await instance.stop()
})

test('restarts after the browser exits and gives up after repeated failed starts', async () => {
  const { instance, launches } = manager()
  await instance.start()
  launches[0].browser.child.exit(1)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(instance.getStatus().status, 'running')
  assert.equal(launches.length, 2)
  await instance.stop()

  const failing = () => fakeBrowser({ handlers: { 'Extensions.loadUnpacked': () => { throw new Error('extension rejected') } } })
  const broken = manager({ browsers: Array.from({ length: 8 }, failing) })
  await broken.instance.start()
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.deepEqual(broken.instance.getStatus(), { status: 'error', browser: 'Chrome', extensionLoaded: false, detail: 'extension rejected' })
  assert.equal(broken.launches.length, 5)
  await broken.instance.stop()
})

test('stays unavailable without a browser or extension and never spawns', async () => {
  const noBrowser = manager({ findExecutable: () => null })
  assert.equal((await noBrowser.instance.start()).status, 'unavailable')
  const noExtension = manager({ extensionDir: null })
  assert.equal((await noExtension.instance.start()).status, 'unavailable')
  assert.equal(noBrowser.launches.length + noExtension.launches.length, 0)
})
