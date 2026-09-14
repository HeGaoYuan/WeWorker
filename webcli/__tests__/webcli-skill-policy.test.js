import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const skillPath = path.resolve(__dirname, '../skills/webcli/SKILL.md')
const skill = fs.readFileSync(skillPath, 'utf8')

describe('bundled webcli skill security policy', () => {
  it('declares only commands allowed by WeWorker agent policy', () => {
    expect(skill).toContain('allowed-tools: Bash(webcli call *), Bash(npm view *)')
    expect(skill).not.toContain('Bash(webcli *)')
    expect(skill).not.toContain('Bash(npm install *)')
    expect(skill).not.toContain('npm install -g')
  })
})
