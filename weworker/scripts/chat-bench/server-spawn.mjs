// self 模式：独立启动 backend-ts dev 后端（无 token，http-security.ts:23 放行），
// 轮询 GET /status 直到就绪。stopBackend 在 win32 用 taskkill /T 清整棵进程树（tsx→node 孙进程）。
import { spawn } from 'node:child_process'
import path from 'node:path'

/**
 * 轮询后端就绪。
 * @param {() => Promise<any>} getStatus  返回非空即视为就绪
 * @param {{timeout?:number, interval?:number}} opts
 */
export async function waitForReady(getStatus, { timeout = 60000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout
  let lastErr = null
  while (Date.now() < deadline) {
    const s = await getStatus().catch((e) => { lastErr = e; return null })
    if (s) return true
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(
    `后端未在 ${timeout / 1000}s 内就绪（${lastErr ? lastErr.message : 'GET /status 无响应'}）。` +
    `请确认 ~/.weworker/settings.json 已配置 provider，且 backend-ts 已执行 npm install。`,
  )
}

/**
 * 用当前 node 直接跑 backend-ts 内置的 tsx CLI（node_modules/tsx/dist/cli.mjs），
 * 执行 `src/server.ts`（cwd=backendDir，--experimental-sqlite 启用 node:sqlite）。
 * 直接 spawn node + .mjs 入口，规避 Windows 上 spawn `npx.cmd` 的 EINVAL。
 * 不注入 WEWORKER_HTTP_TOKEN（后端放行）/ WEWORKER_PACKAGED（走 dev 路径）。
 */
export function startBackend({ backendDir }) {
  const tsxEntry = path.join(backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const child = spawn(process.execPath, [tsxEntry, '--experimental-sqlite', 'src/server.ts'], {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })
  const prefix = '[backend]'
  const pipe = (stream, log) => stream?.on('data', (d) => {
    String(d).split('\n').forEach((l) => { if (l.trimEnd()) log(`${prefix} ${l}`) })
  })
  pipe(child.stdout, console.log)
  pipe(child.stderr, console.error)
  child.on('exit', (code) => console.log(`${prefix} exited code=${code}`))
  return child
}

/** 停止后端（win32 需 /T /F 杀整棵树）。 */
export function stopBackend(child) {
  if (!child || child.exitCode != null) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 2000)
    }
  } catch {}
}
