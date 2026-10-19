import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const skillPath = path.resolve(__dirname, '../skills/webcli/SKILL.md')
const skill = fs.readFileSync(skillPath, 'utf8')

describe('bundled webcli skill security policy', () => {
  it('declares only commands allowed by WeWorker agent policy', () => {
    // SKILL.md 以内部版为底稿重写：允许 `webcli *`（覆盖 --version/call 等）
    // 与 `npm install *`/`npm view *`（agent 自动安装/检查 CLI 版本，无需询问用户）。
    expect(skill).toContain('allowed-tools: Bash(webcli *), Bash(npm install *), Bash(npm view *)')
    expect(skill).not.toContain('Bash(*)')
    expect(skill).not.toContain('Bash(npm *)')
    expect(skill).not.toContain('Bash(sudo')
    expect(skill).not.toContain('Bash(curl')
  })
})
