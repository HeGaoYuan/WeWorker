import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getConfigDirectory } from './config.js'

export function getRuntimeSkillsDir(): string {
  return path.join(getConfigDirectory(), 'claude-config', 'skills')
}

export function getLegacySkillsDir(): string {
  return path.join(os.homedir(), '.weworker', '.claude', 'skills')
}

function copyDirectoryIfMissing(src: string, dest: string): void {
  if (fs.existsSync(dest)) return
  fs.cpSync(src, dest, { recursive: true })
}

export function ensureRuntimeSkillsDir(options?: { runtimeDir?: string; legacyDir?: string }): string {
  const runtimeDir = options?.runtimeDir ?? getRuntimeSkillsDir()
  fs.mkdirSync(runtimeDir, { recursive: true })

  const legacyDir = options?.legacyDir ?? getLegacySkillsDir()
  if (fs.existsSync(legacyDir) && path.resolve(legacyDir) !== path.resolve(runtimeDir)) {
    for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      copyDirectoryIfMissing(path.join(legacyDir, entry.name), path.join(runtimeDir, entry.name))
    }
  }

  return runtimeDir
}
