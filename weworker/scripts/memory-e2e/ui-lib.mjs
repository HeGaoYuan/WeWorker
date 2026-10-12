/**
 * UI E2E 基础设施：环境启动、CDP 连接、DOM 聊天操作。
 * 设计原则：
 * - 聊天发送走 DOM（验收计划 §3.1）
 * - 等待 streaming 只看 InputBar 控件状态，不扫 body 文案（历史消息会残留 working...）
 * - 长等待用轮询 + sleep，避免 puppeteer waitForFunction 长期占用 CDP 导致 protocolTimeout
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
import puppeteer from 'puppeteer-core'
import { createClient } from '../chat-bench/client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, '../..')
export const CDP_URL = process.env.WEWORKER_CDP_URL || 'http://127.0.0.1:9223'
export const CDP_PORT = Number(new URL(CDP_URL).port || 9223)
export const RENDERER_URL = process.env.WEWORKER_DEV_SERVER_URL || 'http://localhost:5173'
export const BASE = process.env.WEWORKER_BASE || 'http://127.0.0.1:8765'
export const CLAUDE_PATH = process.env.WEWORKER_CLAUDE_CODE_PATH
  || path.join(REPO_ROOT, 'backend-ts/node_modules/@anthropic-ai/claude-code-win32-x64/claude.exe')

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 带时间戳的即时日志（不缓冲到脚本结束）。 */
export function logLive(tag, ...parts) {
  const ts = new Date().toISOString().slice(11, 23)
  const msg = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  process.stdout.write(`[${ts}] [${tag}] ${msg}\n`)
}

export function disableProxy() {
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    delete process.env[key]
  }
  process.env.NO_PROXY = '127.0.0.1,localhost'
  process.env.no_proxy = '127.0.0.1,localhost'
}

async function probeUrl(url, timeoutMs = 2000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    // Local Backend may require Electron auth token; 401 still means the process is up.
    return res.ok || res.status === 401
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function waitForUrl(url, { timeout = 120000, interval = 1000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await probeUrl(url)) return true
    await sleep(interval)
  }
  return false
}

async function isPortListening(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function killProcessOnPort(port) {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('netstat', ['-ano'], { encoding: 'utf8' })
      const pids = new Set()
      for (const line of stdout.split('\n')) {
        if (!line.includes(`:${port}`) || !/LISTENING|ESTABLISHED/.test(line)) continue
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid)
      }
      for (const pid of pids) {
        spawn('taskkill', ['/PID', pid, '/F', '/T'], { stdio: 'ignore' })
      }
    } catch { /* ignore */ }
    await sleep(3000)
    return
  }
  await new Promise((resolve) => {
    spawn('bash', ['-lc', `lsof -ti tcp:${port} | xargs -r kill -9`], { stdio: 'ignore' }).on('exit', resolve)
  })
  await sleep(2000)
}

async function ensurePortFree(port, { timeout = 60000 } = {}) {
  if (!(await isPortListening(port))) return
  console.log(`[ui-e2e] 释放端口 ${port}...`)
  for (let attempt = 0; attempt < 3; attempt++) {
    await killProcessOnPort(port)
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (!(await isPortListening(port))) return
      await sleep(1000)
    }
  }
  throw new Error(`端口 ${port} 仍被占用，请手动关闭 WeWorker/Electron 后重试`)
}

async function listCdpTargets() {
  const res = await fetch(`${CDP_URL}/json/list`)
  if (!res.ok) throw new Error(`CDP /json/list failed: ${res.status}`)
  return res.json()
}

function isDevtoolsTarget(target) {
  return target?.type === 'page' && String(target.url || '').startsWith('devtools://')
}

function isAppTarget(target) {
  if (target?.type !== 'page' || isDevtoolsTarget(target)) return false
  const rendererHost = new URL(RENDERER_URL).host
  const url = String(target.url || '')
  const title = String(target.title || '')
  if (url.includes(rendererHost)) return true
  if (/WeWorker/i.test(title)) return true
  return url === '' && title === ''
}

export async function isAppWindowLoaded() {
  const target = await listCdpTargets().then((t) => t.find(isAppTarget)).catch(() => null)
  if (!target) return false
  return String(target.url || '').includes(new URL(RENDERER_URL).host)
}

async function waitForAppTarget({ timeout = 90000, requireLoaded = false } = {}) {
  const rendererHost = new URL(RENDERER_URL).host
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const targets = await listCdpTargets()
    const target = targets.find(isAppTarget)
    if (target && (!requireLoaded || String(target.url || '').includes(rendererHost))) return target
    await sleep(1000)
  }
  const targets = await listCdpTargets()
  throw new Error(`未找到 WeWorker CDP 目标: ${JSON.stringify(targets.map((t) => ({ title: t.title, url: t.url })))}`)
}

function pipeChild(label, child) {
  child.stdout?.on('data', (d) => {
    String(d).split('\n').filter(Boolean).forEach((l) => console.log(`[${label}] ${l}`))
  })
  child.stderr?.on('data', (d) => {
    String(d).split('\n').filter(Boolean).forEach((l) => console.error(`[${label}] ${l}`))
  })
}

/** 启动 Vite + Electron(E2E) + 确认 Backend；默认每次重启 Electron 保证 WEWORKER_E2E=1 且无 DevTools 占用。 */
export async function bootstrapUiEnv({ reuse = false } = {}) {
  if (!(await probeUrl(`${RENDERER_URL}/`))) {
    console.log(`[ui-e2e] 启动 renderer (${RENDERER_URL})`)
    const viteBin = path.join(REPO_ROOT, 'renderer/node_modules/vite/bin/vite.js')
    const port = new URL(RENDERER_URL).port || '5173'
    pipeChild('renderer', spawn(process.execPath, [viteBin, '--port', port, '--strictPort', '--host', '127.0.0.1'], {
      cwd: path.join(REPO_ROOT, 'renderer'),
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
    if (!(await waitForUrl(`${RENDERER_URL}/`))) {
      throw new Error(`renderer 未就绪: ${RENDERER_URL}`)
    }
  }

  const electronReady = reuse && await isAppWindowLoaded()
  if (!electronReady) {
    await ensurePortFree(CDP_PORT)
    console.log(`[ui-e2e] 启动 Electron (WEWORKER_E2E=1, CDP :${CDP_PORT})`)
    const electronCli = path.join(REPO_ROOT, 'node_modules/electron/cli.js')
    pipeChild('electron', spawn(process.execPath, [electronCli, '.', `--remote-debugging-port=${CDP_PORT}`], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        WEWORKER_E2E: '1',
        WEWORKER_DEV_SERVER_URL: RENDERER_URL,
        WEWORKER_CLAUDE_CODE_PATH: CLAUDE_PATH,
      },
    }))
    if (!(await waitForUrl(`${CDP_URL}/json/version`, { timeout: 90000 }))) {
      throw new Error(`Electron CDP 未就绪 (${CDP_URL})`)
    }
    await waitForAppTarget({ timeout: 90000, requireLoaded: true })
  } else {
    console.log('[ui-e2e] 复用已有 Electron 主窗口')
  }

  if (!(await waitForUrl(`${BASE}/status`, { timeout: 90000 }))) {
    throw new Error('Backend /status 未就绪')
  }
}

export async function connectWeWorkerPage() {
  const rendererHost = new URL(RENDERER_URL).host
  await waitForAppTarget({ requireLoaded: true })
  const browser = await puppeteer.connect({
    browserURL: CDP_URL,
    defaultViewport: null,
    protocolTimeout: 0,
  })
  const pages = await browser.pages()
  let page = pages.find((p) => p.url().includes(rendererHost))
    || pages.find((p) => !p.url().startsWith('devtools://') && p.url() !== 'about:blank')
  if (!page) throw new Error(`无可用 page: ${pages.map((p) => p.url()).join(', ')}`)
  if (!page.url().includes(rendererHost)) {
    await page.goto(`${RENDERER_URL}/`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  }
  await page.bringToFront()
  await page.waitForSelector('textarea[data-weworker-chat-input="true"]', { timeout: 90000 })
  return { browser, page }
}

export async function getAuthToken(page) {
  return page.evaluate(async () => {
    try {
      return await window.electronAPI?.getHttpAuthToken?.() || ''
    } catch {
      return ''
    }
  })
}

export function makeBackendClient(token = '') {
  return createClient({ base: BASE, token })
}

export async function subscribeEvents(onEvent, token = '') {
  const headers = token ? { 'X-WeWorker-Auth': token } : {}
  const controller = new AbortController()
  const res = await fetch(`${BASE}/events`, { signal: controller.signal, headers })
  if (!res.ok) throw new Error(`SSE /events failed: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  ;(async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw) continue
        try { onEvent(JSON.parse(raw)) } catch {}
      }
    }
  })().catch(() => {})
  return () => controller.abort()
}

/** 仅依据 InputBar 控件判断是否在 streaming。 */
export async function readChatTransportState(page) {
  return page.evaluate(() => {
    const stop = document.querySelector('button.chat-input-action-stop')
    const send = document.querySelector('button.chat-input-action-send')
    const input = document.querySelector('textarea[data-weworker-chat-input="true"]')
    return {
      hasStop: !!stop,
      sendDisabled: !send || send.disabled,
      inputDisabled: !input || input.disabled,
      placeholder: input?.placeholder || '',
    }
  })
}

export function isStreamingState(state) {
  return state.hasStop
    || state.inputDisabled
    || state.placeholder === '正在处理...'
}

export async function forceStopStreaming(page) {
  const state = await readChatTransportState(page)
  if (!isStreamingState(state)) return false
  const stop = await page.$('button.chat-input-action-stop')
  if (!stop) return false
  await stop.click()
  logLive('ui-e2e', 'clicked stop to abort in-flight turn')
  await waitForChatIdle(page, 90000).catch(() => {})
  return true
}

/** 轮询等待 streaming 结束。空输入时发送按钮 disabled 是正常态，不算未空闲。 */
export async function waitForChatIdle(page, timeoutMs = 600000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await readChatTransportState(page)
    if (!isStreamingState(state)) return state
    await sleep(500)
  }
  const state = await readChatTransportState(page)
  throw new Error(`聊天未在 ${timeoutMs}ms 内结束 streaming: ${JSON.stringify(state)}`)
}

/** 等待本轮 streaming：必须先观察到开始，再等 InputBar 回到可发送。 */
export async function waitForTurnComplete(page, { timeoutMs = 600000, waitStartMs = 90000 } = {}) {
  const t0 = Date.now()
  const startDeadline = Date.now() + waitStartMs
  let sawStreaming = false
  let lastProgress = 0
  while (Date.now() < startDeadline) {
    const state = await readChatTransportState(page)
    if (isStreamingState(state)) {
      sawStreaming = true
      logLive('ui-e2e', 'streaming started', JSON.stringify(state))
      break
    }
    if (Date.now() - lastProgress >= 5000) {
      logLive('ui-e2e', `waiting streaming start ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(state))
      lastProgress = Date.now()
    }
    await sleep(300)
  }
  if (!sawStreaming) {
    const state = await readChatTransportState(page)
    throw new Error(`聊天在 ${waitStartMs}ms 内未进入 streaming: ${JSON.stringify(state)}`)
  }
  lastProgress = 0
  while (Date.now() < t0 + timeoutMs) {
    const state = await readChatTransportState(page)
    if (!isStreamingState(state)) {
      logLive('ui-e2e', `streaming idle after ${Math.round((Date.now() - t0) / 1000)}s`)
      return state
    }
    if (Date.now() - lastProgress >= 5000) {
      logLive('ui-e2e', `streaming ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(state))
      lastProgress = Date.now()
    }
    await sleep(500)
  }
  const state = await readChatTransportState(page)
  throw new Error(`聊天未在 ${timeoutMs}ms 内结束 streaming: ${JSON.stringify(state)}`)
}

export async function fillChatInput(page, text) {
  await page.waitForSelector('textarea[data-weworker-chat-input="true"]', { visible: true })
  await page.evaluate((value) => {
    const el = document.querySelector('textarea[data-weworker-chat-input="true"]')
    if (!el) throw new Error('chat input not found')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, text)
}

export async function clickSend(page) {
  await waitForChatIdle(page, 120000)
  await page.waitForFunction(() => {
    const btn = document.querySelector('button.chat-input-action-send')
    return btn && !btn.disabled
  }, { timeout: 15000 })
  await page.click('button.chat-input-action-send')
}

export async function readMemoryBanner(page) {
  const texts = await page.evaluate(() => document.body.innerText)
  return ['正在整理长期记忆', '长期记忆已更新', '本次内容无需保存为长期记忆', '长期记忆整理失败']
    .filter((t) => texts.includes(t))
}

/** 读取当前会话最后一条助手可见回复（不含侧栏/欢迎页噪声）。 */
export async function readLastAssistantReply(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('.message-item--assistant')]
    const last = items[items.length - 1]
    if (!last) return ''
    const clone = last.cloneNode(true)
    clone.querySelectorAll('button, [data-chat-input-ignore-focus]').forEach((el) => el.remove())
    return (clone.innerText || '').replace(/\s+\n/g, '\n').trim()
  })
}

/** 当前会话可见工具步骤摘要（用于判断是否真的执行了命令/工具）。 */
export async function readVisibleToolSteps(page) {
  return page.evaluate(() => {
    const blocks = [...document.querySelectorAll('.chat-shell-command-header, .message-item--assistant')]
    const lines = (document.body.innerText || '').split('\n')
    const execLines = lines.filter((l) => /执行了 \d+ 个命令|step \d+|exec \d|Exit code|PowerShell|webcli call/i.test(l))
    return {
      commandHeaders: document.querySelectorAll('.chat-shell-command-header').length,
      execHints: execLines.slice(-8),
    }
  })
}

/**
 * 发送一轮聊天。
 * postDelayMs 只用于等异步 memory banner。
 */
export async function sendChatViaDom(page, text, { turnTimeoutMs = 180000, postDelayMs = 8000 } = {}) {
  const t0 = Date.now()
  logLive('chat', 'USER', text.slice(0, 120) + (text.length > 120 ? '…' : ''))
  await fillChatInput(page, text)
  await clickSend(page)
  logLive('chat', 'sent, waiting turn…')
  await waitForTurnComplete(page, { timeoutMs: turnTimeoutMs })
  await sleep(postDelayMs)
  const banner = await readMemoryBanner(page)
  const assistantReply = await readLastAssistantReply(page)
  const tools = await readVisibleToolSteps(page)
  logLive('chat', 'ASSISTANT', assistantReply.slice(0, 500) + (assistantReply.length > 500 ? '…' : ''))
  if (banner.length) logLive('chat', 'memory banner', banner.join('|'))
  if (tools.commandHeaders || tools.execHints.length) logLive('chat', 'tools', tools)
  logLive('chat', `turn complete ${Math.round((Date.now() - t0) / 1000)}s`)
  return { banner, assistantReply, tools, elapsedMs: Date.now() - t0 }
}

/** 新建会话：先等空闲，再点侧栏「新任务」；DOM 卡住时回退 Backend API。 */
export async function createNewWork(page, { token = '' } = {}) {
  const viaApi = async () => {
    logLive('ui-e2e', 'createNewWork via API fallback')
    const client = makeBackendClient(token)
    const work = await client.createWork()
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('textarea[data-weworker-chat-input="true"]', { timeout: 90000 })
    return work.id
  }

  try {
    await waitForChatIdle(page, 30000)
  } catch {
    await forceStopStreaming(page).catch(() => {})
  }

  let clicked = false
  try {
    const btn = await Promise.race([
      page.$('button[data-weworker-new-work="true"]'),
      sleep(10000).then(() => null),
    ])
    if (btn) {
      await Promise.race([
        btn.click(),
        sleep(10000).then(() => { throw new Error('new-work click timeout') }),
      ])
      clicked = true
    }
  } catch (e) {
    logLive('ui-e2e', 'new-work DOM path failed', e.message || String(e))
  }

  if (!clicked) return viaApi()

  try {
    await waitForChatIdle(page, 20000)
    await page.waitForSelector('textarea[data-weworker-chat-input="true"]', { timeout: 20000 })
    await page.waitForFunction(() => {
      const input = document.querySelector('textarea[data-weworker-chat-input="true"]')
      const welcome = document.body.innerText.includes('像聊天一样操作网站')
      return input && !input.disabled && !welcome
    }, { timeout: 15000 }).catch(() => {})
    await sleep(500)
    return null
  } catch (e) {
    logLive('ui-e2e', 'new-work post-click wait failed', e.message || String(e))
    return viaApi()
  }
}
