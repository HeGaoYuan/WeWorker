import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process'

export interface ClaudeSpawnArgs {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}

const activeClaudeProcesses = new Set<ChildProcess>()
let cleanupHandlersInstalled = false

function collectDescendantPids(rootPid: number): number[] {
  let output = ''
  try {
    output = execFileSync('ps', ['-axo', 'pid=,ppid='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return []
  }

  const childrenByParent = new Map<number, number[]>()
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (!match) continue
    const pid = Number(match[1])
    const parentPid = Number(match[2])
    const children = childrenByParent.get(parentPid) ?? []
    children.push(pid)
    childrenByParent.set(parentPid, children)
  }

  const descendants: number[] = []
  const visit = (parentPid: number) => {
    for (const childPid of childrenByParent.get(parentPid) ?? []) {
      visit(childPid)
      descendants.push(childPid)
    }
  }
  visit(rootPid)
  return descendants
}

function terminateProcessGroup(
  child: ChildProcess,
  signal: NodeJS.Signals | number = 'SIGTERM',
  platform = process.platform,
): boolean {
  if (!child.pid) return false

  if (platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return result.status === 0
  }

  let terminated = false
  for (const descendantPid of collectDescendantPids(child.pid)) {
    try {
      process.kill(descendantPid, signal)
      terminated = true
    } catch {}
  }
  try {
    process.kill(-child.pid, signal)
    return true
  } catch {
    try {
      process.kill(child.pid, signal)
      return true
    } catch {
      return terminated
    }
  }
}

function terminateAllClaudeProcesses(): void {
  for (const child of activeClaudeProcesses) {
    terminateProcessGroup(child)
  }
}

function installCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return
  cleanupHandlersInstalled = true

  process.once('exit', terminateAllClaudeProcesses)
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      terminateAllClaudeProcesses()
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })
  }
}

export function spawnManagedClaudeCodeProcess(
  spawnArgs: ClaudeSpawnArgs,
  extraEnv: Record<string, string> = {},
): ChildProcess {
  installCleanupHandlers()
  const child = spawn(spawnArgs.command, spawnArgs.args, {
    cwd: spawnArgs.cwd,
    env: { ...spawnArgs.env, ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  } satisfies SpawnOptions)

  activeClaudeProcesses.add(child)
  child.once('exit', () => activeClaudeProcesses.delete(child))

  const originalKill = child.kill.bind(child)
  child.kill = ((signal: NodeJS.Signals | number = 'SIGTERM') => {
    if (terminateProcessGroup(child, signal)) return true
    return originalKill(signal)
  }) as ChildProcess['kill']

  const abort = () => child.kill('SIGTERM')
  if (spawnArgs.signal?.aborted) abort()
  else spawnArgs.signal?.addEventListener('abort', abort, { once: true })
  child.once('exit', () => spawnArgs.signal?.removeEventListener('abort', abort))

  return child
}
