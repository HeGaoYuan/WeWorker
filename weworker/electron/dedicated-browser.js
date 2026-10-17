/**
 * WeWorker 浏览器: a Chrome instance owned by WeWorker.
 *
 * WeWorker starts the user's installed Chrome (or Edge) with its own profile
 * under ~/.weworker/browser/profile, loads the bundled extension, and keeps
 * the window off-screen so website automation never covers or focuses the
 * user's own windows. The user's everyday Chrome is never touched.
 *
 * Chrome constraints this design follows:
 * - Chrome 137+ ignores --load-extension in branded builds, so the extension
 *   is loaded through CDP `Extensions.loadUnpacked`, which requires
 *   --remote-debugging-pipe and --enable-unsafe-extension-debugging.
 * - Chrome 136+ honours remote debugging only for a non-default
 *   --user-data-dir, which the dedicated profile is.
 * - CDP runs over the inherited pipe (fd 3/4); no debugging port is opened.
 *
 * The extension learns that it runs here through a marker in its local
 * storage. It then avoids window focus changes, and the bridge prefers it over
 * an extension that may also be installed in the user's own Chrome.
 *
 * Process rules: only the process started by this manager is stopped. A
 * profile already used by another process (for example a browser left over
 * from a crash) is reported and retried later, never killed.
 */
import { spawn as nodeSpawn, spawnSync } from 'child_process'
import { randomBytes } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const BROWSER_INSTANCE_STORAGE_KEY = 'weworkerBrowserInstance'
export const BROWSER_MODES = Object.freeze(['dedicated', 'system'])
export const DEFAULT_BROWSER_MODE = 'dedicated'
export const OFFSCREEN_POSITION = -32000

const READY_TIMEOUT_MS = 20_000
const COMMAND_TIMEOUT_MS = 15_000
const EXTENSION_WORKER_TIMEOUT_MS = 15_000
const QUICK_EXIT_MS = 8_000
const STABLE_RUN_MS = 60_000
const PROFILE_IN_USE_RETRY_MS = 15_000
const RESTART_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const MAX_FAILED_STARTS = RESTART_DELAYS_MS.length

export function normalizeBrowserMode(value) {
  return BROWSER_MODES.includes(value) ? value : DEFAULT_BROWSER_MODE
}

export function resolveBrowserHome(home = os.homedir()) {
  return path.join(home, '.weworker', 'browser')
}

// ── Locating the browser ────────────────────────────────────────────────────

export function browserExecutableCandidates({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const candidates = []
  if (env.WEWORKER_BROWSER_EXECUTABLE) candidates.push({ path: env.WEWORKER_BROWSER_EXECUTABLE, name: 'Chrome' })
  if (platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean)
    for (const root of roots) candidates.push({ path: path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), name: 'Chrome' })
    for (const root of roots) candidates.push({ path: path.win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), name: 'Microsoft Edge' })
  } else if (platform === 'darwin') {
    for (const root of ['/Applications', path.join(home, 'Applications')]) {
      candidates.push({ path: path.posix.join(root, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'), name: 'Chrome' })
    }
    for (const root of ['/Applications', path.join(home, 'Applications')]) {
      candidates.push({ path: path.posix.join(root, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'), name: 'Microsoft Edge' })
    }
  } else {
    for (const bin of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
      candidates.push({ path: path.posix.join('/usr/bin', bin), name: bin.startsWith('chromium') ? 'Chromium' : 'Chrome' })
    }
    candidates.push({ path: '/usr/bin/microsoft-edge', name: 'Microsoft Edge' })
  }
  return candidates
}

export function findBrowserExecutable(options = {}) {
  const exists = options.exists ?? ((file) => {
    try { return fs.statSync(file).isFile() } catch { return false }
  })
  return browserExecutableCandidates(options).find((candidate) => exists(candidate.path)) ?? null
}

/** The extension directory shipped with the app (packaged) or produced by the profile build (dev). */
export function resolveBundledExtensionDir({ packaged, resourcesPath, repoRoot, exists = fs.existsSync }) {
  const candidates = packaged
    ? [path.join(resourcesPath, 'extension')]
    : [path.join(repoRoot, 'weworker', 'build', 'extension-dist'), path.join(repoRoot, 'extension')]
  return candidates.find((dir) => exists(path.join(dir, 'manifest.json'))) ?? null
}

export function buildBrowserArgs({ userDataDir }) {
  return [
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    // No window at launch; WeWorker opens one off-screen, which later windows inherit.
    '--no-startup-window',
    `--window-position=${OFFSCREEN_POSITION},${OFFSCREEN_POSITION}`,
    '--window-size=1280,860',
    // An off-screen window counts as occluded; keep its pages running at full speed.
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ]
}

/** Stable per-profile marker; it only tells the bridge which extension runs in this browser. */
export function loadInstanceToken(browserHome, fileSystem = fs) {
  const file = path.join(browserHome, 'instance.json')
  try {
    const parsed = JSON.parse(fileSystem.readFileSync(file, 'utf8'))
    if (typeof parsed?.token === 'string' && /^[A-Za-z0-9_-]{32,}$/.test(parsed.token)) return parsed.token
  } catch {
    // Created below.
  }
  const token = randomBytes(24).toString('base64url')
  fileSystem.mkdirSync(browserHome, { recursive: true })
  fileSystem.writeFileSync(file, JSON.stringify({ token }, null, 2), { mode: 0o600 })
  return token
}

// ── CDP over the inherited pipe ─────────────────────────────────────────────

/** Chrome's pipe transport: one JSON message per NUL-terminated frame. */
export function createCdpPipe(writable, readable, { timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  let nextId = 0
  let closed = false
  let buffered = Buffer.alloc(0)
  const pending = new Map()
  const listeners = new Set()

  const failAll = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer)
      reject(error)
    }
    pending.clear()
  }

  readable.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
    let end
    while ((end = buffered.indexOf(0)) >= 0) {
      const frame = buffered.subarray(0, end).toString('utf8')
      buffered = buffered.subarray(end + 1)
      let message
      try { message = JSON.parse(frame) } catch { continue }
      if (message.id !== undefined && pending.has(message.id)) {
        const entry = pending.get(message.id)
        pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.error) entry.reject(Object.assign(new Error(message.error.message || 'CDP error'), { code: message.error.code }))
        else entry.resolve(message.result ?? {})
      } else if (message.method) {
        for (const listener of listeners) listener(message)
      }
    }
  })
  const onClose = () => {
    if (closed) return
    closed = true
    failAll(new Error('Browser connection closed'))
  }
  readable.on('close', onClose)
  readable.on('end', onClose)
  readable.on('error', onClose)
  writable.on?.('error', onClose)

  return {
    send(method, params = {}, sessionId) {
      if (closed) return Promise.reject(new Error('Browser connection closed'))
      const id = ++nextId
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`CDP ${method} timed out`))
        }, timeoutMs)
        timer.unref?.()
        pending.set(id, { resolve, reject, timer })
        writable.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`)
      })
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get closed() { return closed },
    close: onClose,
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function withTimeout(promise, ms, message) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })])
  } finally {
    clearTimeout(timer)
  }
}

/** Write the instance marker from inside the extension's service worker (no browser-context CDP API needed). */
export async function markExtensionInstance(cdp, extensionId, marker, { timeoutMs = EXTENSION_WORKER_TIMEOUT_MS, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  let worker
  while (!worker) {
    const { targetInfos = [] } = await cdp.send('Target.getTargets')
    worker = targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extensionId}/`))
    if (!worker) {
      if (Date.now() > deadline) throw new Error('Extension service worker did not start')
      await wait(pollMs)
    }
  }
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true })
  try {
    const expression = `chrome.storage.local.set(${JSON.stringify({ [BROWSER_INSTANCE_STORAGE_KEY]: marker })}).then(() => 'ok')`
    for (;;) {
      const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (response?.result?.value === 'ok') return
      const description = response?.exceptionDetails?.exception?.description || ''
      // The worker's extension APIs are bound shortly after the target appears.
      if (!description.includes('chrome is not defined') || Date.now() > deadline) {
        throw new Error(`Failed to mark the extension instance: ${description || 'no result'}`)
      }
      await wait(pollMs)
    }
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {})
  }
}

// ── Manager ─────────────────────────────────────────────────────────────────

function hasExited(child) {
  return child.exitCode !== null && child.exitCode !== undefined
    || child.signalCode !== null && child.signalCode !== undefined
}

function killProcessTree(child, platform) {
  // An exited child's PID may already belong to another process.
  if (!child?.pid || hasExited(child)) return
  if (platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    return
  }
  try { child.kill('SIGKILL') } catch {}
}

export class DedicatedBrowserManager {
  constructor({
    log = () => {},
    extensionDir,
    browserHome = resolveBrowserHome(),
    instanceToken,
    platform = process.platform,
    spawn = nodeSpawn,
    findExecutable = () => findBrowserExecutable({ platform }),
    killTree = (child) => killProcessTree(child, platform),
    restartDelaysMs = RESTART_DELAYS_MS,
    profileInUseRetryMs = PROFILE_IN_USE_RETRY_MS,
    now = () => Date.now(),
  } = {}) {
    this._log = log
    this._extensionDir = extensionDir
    this._browserHome = browserHome
    this._userDataDir = path.join(browserHome, 'profile')
    this._instanceToken = instanceToken
    this._platform = platform
    this._spawn = spawn
    this._findExecutable = findExecutable
    this._killTree = killTree
    this._restartDelaysMs = restartDelaysMs
    this._profileInUseRetryMs = profileInUseRetryMs
    this._now = now
    this._status = 'stopped'
    this._detail = ''
    this._browserName = null
    this._child = null
    this._cdp = null
    this._windowId = null
    this._extensionId = null
    this._starting = null
    this._stopping = false
    this._restartTimer = null
    this._failedStarts = 0
  }

  get userDataDir() { return this._userDataDir }

  getStatus() {
    return {
      status: this._status,
      browser: this._browserName,
      extensionLoaded: !!this._extensionId,
      ...(this._detail ? { detail: this._detail } : {}),
    }
  }

  start() {
    if (this._starting) return this._starting
    if (this._child && this._status === 'running') return Promise.resolve(this.getStatus())
    this._stopping = false
    this._clearRestartTimer()
    this._starting = this._startInternal().finally(() => { this._starting = null })
    return this._starting
  }

  async _startInternal() {
    if (!this._extensionDir) return this._setStatus('unavailable', '找不到 WeWorker 扩展文件')
    const executable = this._findExecutable()
    if (!executable) return this._setStatus('unavailable', '未找到 Chrome 或 Microsoft Edge')
    this._browserName = executable.name
    this._setStatus('starting')
    fs.mkdirSync(this._userDataDir, { recursive: true })

    const run = { ready: false, startedAt: this._now() }
    const child = this._spawn(executable.path, buildBrowserArgs({ userDataDir: this._userDataDir }), {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
      windowsHide: false,
      // Stays in WeWorker's process tree, so the uninstaller's tree kill also covers it.
      detached: false,
    })
    this._child = child
    child.stderr?.on('data', () => {})
    child.once('error', (error) => this._log(`[browser] failed to launch: ${error.message}`))
    child.once('exit', (code, signal) => this._handleExit(child, { code, signal, ...run }))
    const cdp = createCdpPipe(child.stdio[3], child.stdio[4])
    this._cdp = cdp

    try {
      const version = await withTimeout(cdp.send('Browser.getVersion'), READY_TIMEOUT_MS, 'Browser did not respond')
      const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: this._extensionDir })
      this._extensionId = extensionId
      // One off-screen window: tabs opened by the extension land here, later windows inherit its position.
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, background: true })
      const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId })
      this._windowId = windowId
      await markExtensionInstance(cdp, extensionId, { kind: 'dedicated', token: this._instanceToken })
      run.ready = true
      this._readyAt = this._now()
      this._setStatus('running')
      this._log(`[browser] ${executable.name} ready (${version.product || 'unknown version'}), extension ${extensionId}`)
    } catch (error) {
      if (this._child === child && !this._stopping) {
        this._log(`[browser] startup failed: ${error.message}`)
        this._detail = error.message
        // Exit handling decides between retry and "profile in use".
        cdp.close()
        if (!hasExited(child)) this._killTree(child)
      }
    }
    return this.getStatus()
  }

  _handleExit(child, { code, signal, ready, startedAt }) {
    if (this._child !== child) return
    this._child = null
    this._cdp?.close()
    this._cdp = null
    this._windowId = null
    this._extensionId = null
    if (this._stopping) {
      this._setStatus('stopped')
      return
    }
    const ranFor = this._now() - startedAt
    if (!ready && code === 0 && ranFor < QUICK_EXIT_MS) {
      // Chrome handed the launch over to a process that already owns this profile.
      this._setStatus('profile_in_use', 'WeWorker 浏览器的配置正被另一个浏览器进程使用')
      this._log('[browser] profile is already in use by another process; will retry')
      this._scheduleRestart(this._profileInUseRetryMs)
      return
    }
    const stableRun = ready && this._readyAt && this._now() - this._readyAt >= STABLE_RUN_MS
    if (ready && (code === 0 || stableRun)) {
      // Closed by the user (last window) or ran fine for a while: bring it back quietly.
      this._failedStarts = 0
      this._log(`[browser] exited (code ${code ?? signal}); restarting`)
      this._setStatus('starting')
      this._scheduleRestart(this._restartDelaysMs[0])
      return
    }
    this._failedStarts += 1
    if (this._failedStarts >= MAX_FAILED_STARTS) {
      this._setStatus('error', this._detail || `浏览器退出（${code ?? signal}）`)
      this._log('[browser] giving up after repeated failures')
      return
    }
    const delay = this._restartDelaysMs[Math.min(this._failedStarts - 1, this._restartDelaysMs.length - 1)]
    this._setStatus('starting', this._detail)
    this._log(`[browser] exited unexpectedly (code ${code ?? signal}); restarting in ${delay}ms`)
    this._scheduleRestart(delay)
  }

  _scheduleRestart(delay) {
    this._clearRestartTimer()
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null
      void this.start()
    }, delay)
    this._restartTimer.unref?.()
  }

  _clearRestartTimer() {
    if (this._restartTimer) clearTimeout(this._restartTimer)
    this._restartTimer = null
  }

  _setStatus(status, detail = '') {
    this._status = status
    this._detail = detail
    if (status === 'running') this._failedStarts = 0
    return this.getStatus()
  }

  /** User-requested restart, for example after repeated failures. */
  async restart() {
    this._failedStarts = 0
    await this.stop()
    return this.start()
  }

  async stop() {
    this._stopping = true
    this._clearRestartTimer()
    const child = this._child
    if (!child) {
      if (this._status !== 'unavailable') this._setStatus('stopped')
      return
    }
    const exited = new Promise((resolve) => child.once('exit', resolve))
    try {
      await withTimeout(this._cdp?.send('Browser.close') ?? Promise.resolve(), 3_000, 'close timeout')
    } catch {
      // Fall through to the forced stop below.
    }
    const closed = await Promise.race([exited.then(() => true), wait(5_000).then(() => false)])
    if (!closed && !hasExited(child)) this._killTree(child)
    await Promise.race([exited, wait(2_000)])
    if (this._child === child) this._child = null
    this._cdp = null
    this._windowId = null
    this._extensionId = null
    this._setStatus('stopped')
  }

  async _pageInWindow() {
    const cdp = this._cdp
    const { targetInfos = [] } = await cdp.send('Target.getTargets')
    const page = targetInfos.find((target) => target.type === 'page')
    if (page) return page.targetId
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, background: true })
    return targetId
  }

  /** Bring the browser on-screen, for example so the user can sign in to a website. */
  async show() {
    if (this._status !== 'running' || !this._cdp) {
      await this.start()
      if (this._status !== 'running' || !this._cdp) return this.getStatus()
    }
    const cdp = this._cdp
    const targetId = await this._pageInWindow()
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget', { targetId })
    if (bounds?.windowState && bounds.windowState !== 'normal') {
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
    }
    // Chrome clamps the parked position (about -18000 on Windows), so compare with a margin.
    const offScreen = !bounds || bounds.left < -10000 || bounds.top < -10000
    if (offScreen) {
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 120, top: 80, width: 1280, height: 860 } })
    }
    await cdp.send('Target.activateTarget', { targetId })
    return this.getStatus()
  }

  /** Move every browser window off-screen again. */
  async hide() {
    if (this._status !== 'running' || !this._cdp) return this.getStatus()
    const cdp = this._cdp
    const { targetInfos = [] } = await cdp.send('Target.getTargets')
    const windowIds = new Set()
    for (const target of targetInfos.filter((item) => item.type === 'page')) {
      try {
        const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: target.targetId })
        windowIds.add(windowId)
      } catch {
        // Target closed meanwhile.
      }
    }
    for (const windowId of windowIds) {
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {})
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: OFFSCREEN_POSITION, top: OFFSCREEN_POSITION } }).catch(() => {})
    }
    return this.getStatus()
  }
}
