import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js')
  let tmpDir = ''
  return {
    ...actual,
    getConfigDirectory: () => tmpDir,
    __setTmpDir: (dir: string) => { tmpDir = dir },
  }
})

import * as config from '../config.js'
import { ensureRuntimeSkillsDir, getRuntimeSkillsDir } from '../runtime-skills-dir.js'

describe('runtime skills directory', () => {
  let tmpDir = ''
  let homeDir = ''

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-runtime-skills-config-'))
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-runtime-skills-home-'))
    ;(config as unknown as { __setTmpDir: (dir: string) => void }).__setTmpDir(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(homeDir, { recursive: true, force: true })
  })

  it('uses the same claude-config tree that CLAUDE_CONFIG_DIR points at', () => {
    expect(getRuntimeSkillsDir()).toBe(path.join(tmpDir, 'claude-config', 'skills'))
  })

  it('copies existing legacy skill directories without overwriting runtime skills', () => {
    const legacyDir = path.join(homeDir, '.weworker', '.claude', 'skills')
    fs.mkdirSync(path.join(legacyDir, 'public-test'), { recursive: true })
    fs.writeFileSync(path.join(legacyDir, 'public-test', 'SKILL.md'), 'legacy public skill', 'utf8')

    const runtimeDir = getRuntimeSkillsDir()
    fs.mkdirSync(path.join(runtimeDir, 'webcli'), { recursive: true })
    fs.writeFileSync(path.join(runtimeDir, 'webcli', 'SKILL.md'), 'runtime webcli', 'utf8')
    fs.mkdirSync(path.join(legacyDir, 'webcli'), { recursive: true })
    fs.writeFileSync(path.join(legacyDir, 'webcli', 'SKILL.md'), 'legacy webcli', 'utf8')

    expect(ensureRuntimeSkillsDir({ runtimeDir, legacyDir })).toBe(runtimeDir)

    expect(fs.readFileSync(path.join(runtimeDir, 'public-test', 'SKILL.md'), 'utf8')).toBe('legacy public skill')
    expect(fs.readFileSync(path.join(runtimeDir, 'webcli', 'SKILL.md'), 'utf8')).toBe('runtime webcli')
  })
})
