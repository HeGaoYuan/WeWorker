import { describe, expect, it, vi } from 'vitest'

const runWeWorkerPowerShell = vi.fn(async (options) => ({
  sessionId: 'ps-test',
  command: options.command,
  cwd: options.cwd || 'cwd',
  shell: options.shell || 'bash',
  exitCode: 0,
  signal: null,
  output: 'ok',
  stdout: 'ok',
  stderr: '',
}))

vi.mock('../powershell-runner.js', () => ({
  runWeWorkerPowerShell,
}))

vi.mock('../webcli-runner.js', () => ({
  runWebcliCall: vi.fn(),
}))

describe('MCP tool context', () => {
  it('keeps shell tool work context scoped to each MCP server instance', async () => {
    const { buildMcpServer } = await import('../tools.js')
    const firstAbort = new AbortController()
    const secondAbort = new AbortController()
    const firstServer = buildMcpServer({ workId: 'work-1', abortSignal: firstAbort.signal })
    const secondServer = buildMcpServer({ workId: 'work-2', abortSignal: secondAbort.signal })

    await firstServer.instance._registeredTools.weworker_powershell.handler({ command: 'echo first' })
    await secondServer.instance._registeredTools.weworker_powershell.handler({ command: 'echo second' })
    await firstServer.instance._registeredTools.weworker_powershell.handler({ command: 'echo again' })

    expect(runWeWorkerPowerShell.mock.calls.map(([options]) => ({
      command: options.command,
      workId: options.workId,
      signal: options.signal,
    }))).toEqual([
      { command: 'echo first', workId: 'work-1', signal: firstAbort.signal },
      { command: 'echo second', workId: 'work-2', signal: secondAbort.signal },
      { command: 'echo again', workId: 'work-1', signal: firstAbort.signal },
    ])
  })
})
