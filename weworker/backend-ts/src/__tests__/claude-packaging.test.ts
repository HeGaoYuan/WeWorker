import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildClaudeNativeShellEnv, resolvePackagedClaudeEntrypoint } from '../agent.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function createTempResourcesDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-claude-resources-'))
  tempDirs.push(dir)
  return dir
}

describe('packaged Claude Code entrypoint', () => {
  it('uses the bundled Windows native binary instead of the removed cli.js entrypoint', () => {
    const resourcesDir = createTempResourcesDir()
    const nativeBin = path.join(resourcesDir, 'claude-code', 'bin', 'claude.exe')
    fs.mkdirSync(path.dirname(nativeBin), { recursive: true })
    fs.writeFileSync(nativeBin, '')

    expect(resolvePackagedClaudeEntrypoint(resourcesDir, 'win32')).toBe(nativeBin)
  })

  it('uses the single bundled native binary on macOS', () => {
    const resourcesDir = createTempResourcesDir()
    const nativeBin = path.join(resourcesDir, 'claude-code', 'bin', 'claude.exe')
    fs.mkdirSync(path.dirname(nativeBin), { recursive: true })
    fs.writeFileSync(nativeBin, '')

    expect(resolvePackagedClaudeEntrypoint(resourcesDir, 'darwin')).toBe(nativeBin)
  })

  it('enables the native PowerShell tool on Windows without configuring Git Bash', () => {
    expect(buildClaudeNativeShellEnv('win32')).toEqual({ CLAUDE_CODE_USE_POWERSHELL_TOOL: '1' })
    expect(buildClaudeNativeShellEnv('darwin')).toEqual({})
  })

  it('keeps Claude Code as a build-only dependency and packages one explicit copy', () => {
    const packageJsonPath = path.resolve(process.cwd(), '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
      build?: {
        extraResources?: Array<{ from?: string; to?: string; filter?: string[] }>
      }
    }

    const sharedClaudeResource = packageJson.build?.extraResources?.find((entry) => entry.to === 'claude-code')

    expect(packageJson.dependencies?.['@anthropic-ai/claude-code']).toBeUndefined()
    expect(packageJson.devDependencies?.['@anthropic-ai/claude-code']).toBeDefined()
    expect(sharedClaudeResource?.from).toBe('node_modules/@anthropic-ai/claude-code')
    expect(sharedClaudeResource?.filter).toEqual(expect.arrayContaining([
      'bin/**',
      'cli-wrapper.cjs',
      'package.json',
    ]))
    expect(packageJson.scripts?.['ensure:bash-runtime']).toBeUndefined()
    expect(packageJson.scripts?.['build:win']).not.toContain('ensure:bash-runtime')
    expect(packageJson.build?.extraResources?.some((entry) => entry.to === 'runtime/git-bash')).toBe(false)
  })

  it('packages bundled ZCF templates at the runtime lookup path', () => {
    const packageJsonPath = path.resolve(process.cwd(), '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      build?: {
        extraResources?: Array<{ from?: string; to?: string; filter?: string[] }>
      }
    }

    const bundledZcfResource = packageJson.build?.extraResources?.find((entry) => entry.to === 'bundled')

    expect(bundledZcfResource?.from).toBe('backend-ts/bundled/')
    expect(bundledZcfResource?.filter).toEqual(expect.arrayContaining(['zcf/**']))
  })
})
