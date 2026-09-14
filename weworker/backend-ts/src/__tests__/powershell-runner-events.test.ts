import { describe, expect, it, vi } from 'vitest'

vi.mock('../notifier.js', () => ({
  broadcastSSE: vi.fn(),
}))

describe('WeWorker Shell terminal events', () => {
  it('adds the bundled webcli directory to the terminal PATH', async () => {
    const { buildTerminalEnv } = await import('../powershell-runner.js')
    const { resolveWebcliDir } = await import('../webcli-path.js')
    const env = buildTerminalEnv({ PATH: 'original-path' })
    const pathValue = env.PATH || env.Path || ''

    expect(pathValue.split(process.platform === 'win32' ? ';' : ':')).toContain(resolveWebcliDir())
  })

  it('uses PowerShell as the only Windows default and bash elsewhere', async () => {
    const { getDefaultTerminalShell, inferTerminalShell } = await import('../powershell-runner.js')

    expect(getDefaultTerminalShell('win32')).toBe('powershell')
    expect(inferTerminalShell('ls -l', undefined, 'win32')).toBe('powershell')
    expect(inferTerminalShell('ls -l', 'bash', 'win32')).toBe('powershell')
    expect(getDefaultTerminalShell('darwin')).toBe('bash')
    expect(inferTerminalShell('ls -l', undefined, 'darwin')).toBe('bash')
  })

  it('uses UTF-8 as the default terminal output encoding', async () => {
    const { decodeTerminalOutputChunk } = await import('../powershell-runner.js')
    const gbkText = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])

    expect(decodeTerminalOutputChunk(gbkText)).not.toBe('\u4e2d\u6587')
  })

  it('decodes terminal output with the selected encoding', async () => {
    const { decodeTerminalOutputChunk } = await import('../powershell-runner.js')
    const gbkText = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])

    expect(decodeTerminalOutputChunk(gbkText, 'gbk')).toBe('\u4e2d\u6587')
    expect(decodeTerminalOutputChunk(gbkText, 'gb18030')).toBe('\u4e2d\u6587')
  })

  it('normalizes terminal output encoding labels', async () => {
    const { normalizeTerminalOutputEncoding } = await import('../powershell-runner.js')

    expect(normalizeTerminalOutputEncoding()).toBe('utf-8')
    expect(normalizeTerminalOutputEncoding('utf8')).toBe('utf-8')
    expect(normalizeTerminalOutputEncoding(' GBK ')).toBe('gbk')
  })

  it.runIf(process.platform === 'win32')('infers GBK for Windows native command output', async () => {
    const { inferTerminalOutputEncoding, inferTerminalShell } = await import('../powershell-runner.js')

    expect(inferTerminalShell('dir')).toBe('powershell')
    expect(inferTerminalShell('dir', 'bash')).toBe('powershell')
    expect(inferTerminalShell('ls -l')).toBe('powershell')
    expect(inferTerminalOutputEncoding('xcopy /E /I /Y a b', 'powershell')).toBe('gbk')
    expect(inferTerminalOutputEncoding('cmd.exe /c dir', 'powershell')).toBe('gbk')
    expect(inferTerminalOutputEncoding('node -e "console.log(1)"', 'powershell')).toBe('utf-8')
    expect(inferTerminalOutputEncoding('xcopy /E /I /Y a b', 'powershell', 'utf-8')).toBe('utf-8')
  })

  it('rejects unsupported terminal output encodings before running a command', async () => {
    const { normalizeTerminalOutputEncoding } = await import('../powershell-runner.js')

    expect(() => normalizeTerminalOutputEncoding('not-an-encoding')).toThrow(/Unsupported terminal output encoding/)
  })

  it('decodes selected terminal output encoding through streaming chunks', async () => {
    const { createTerminalOutputDecoder } = await import('../powershell-runner.js')
    const decoder = createTerminalOutputDecoder('gbk')
    const gbkText = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])

    expect(decoder.decode(gbkText)).toBe('\u4e2d\u6587')
    expect(decoder.flush()).toBe('')
  })

  it('notifies local listeners in addition to global SSE clients', async () => {
    const { emitTerminalEventForTest, onTerminalEvent } = await import('../powershell-runner.js')
    const received: Record<string, unknown>[] = []
    const unsubscribe = onTerminalEvent((event) => {
      received.push(event)
    })

    emitTerminalEventForTest({
      event: 'output',
      sessionId: 'ps-1',
      workId: 'work-1',
      command: 'echo hello',
      chunk: 'hello\n',
    })
    unsubscribe()
    emitTerminalEventForTest({
      event: 'output',
      sessionId: 'ps-1',
      workId: 'work-1',
      command: 'echo hello',
      chunk: 'ignored\n',
    })

    expect(received).toEqual([{
      event: 'output',
      sessionId: 'ps-1',
      workId: 'work-1',
      command: 'echo hello',
      chunk: 'hello\n',
    }])
  })
})
