import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  importSkillDirectoryResources,
  listSkillDirectoryResources,
  readResourceFilePreview,
  saveSkillDirectoryResources,
} from '../custom-skills.js'

function makeTempSkillDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-skill-dir-'))
}

describe('public skill directory resources', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('saves readable resources and lists them without SKILL.md', () => {
    const root = makeTempSkillDir()
    roots.push(root)
    fs.writeFileSync(path.join(root, 'SKILL.md'), '# Demo', 'utf-8')

    saveSkillDirectoryResources(root, [
      {
        name: 'notes.txt',
        relativePath: 'notes.txt',
        readable: true,
        content: 'hello',
        is_directory: false,
      },
    ])

    const resources = listSkillDirectoryResources(root)
    expect(resources.some((item) => item.relativePath === 'notes.txt')).toBe(true)
    expect(resources.some((item) => item.relativePath === 'SKILL.md')).toBe(false)
    expect(fs.readFileSync(path.join(root, 'notes.txt'), 'utf-8')).toBe('hello')
  })

  it('imports local files into the skill directory', () => {
    const root = makeTempSkillDir()
    roots.push(root)
    const source = path.join(root, 'source.txt')
    fs.writeFileSync(source, 'import-me', 'utf-8')

    importSkillDirectoryResources(root, [source])
    const resources = listSkillDirectoryResources(root)
    expect(resources.some((item) => item.name === 'source.txt')).toBe(true)
    expect(fs.readFileSync(path.join(root, 'source.txt'), 'utf-8')).toBe('import-me')
  })

  it('ignores unsafe relative paths when saving', () => {
    const root = makeTempSkillDir()
    roots.push(root)

    saveSkillDirectoryResources(root, [
      {
        name: 'escape.txt',
        relativePath: '../escape.txt',
        readable: true,
        content: 'nope',
        is_directory: false,
      },
    ])

    expect(fs.existsSync(path.join(path.dirname(root), 'escape.txt'))).toBe(false)
    expect(listSkillDirectoryResources(root)).toHaveLength(0)
  })

  it('prunes removed resources while keeping SKILL.md', () => {
    const root = makeTempSkillDir()
    roots.push(root)
    fs.writeFileSync(path.join(root, 'SKILL.md'), '# Demo', 'utf-8')

    saveSkillDirectoryResources(root, [
      {
        name: 'keep.txt',
        relativePath: 'keep.txt',
        readable: true,
        content: 'stay',
        is_directory: false,
      },
      {
        name: 'drop.txt',
        relativePath: 'drop.txt',
        readable: true,
        content: 'gone',
        is_directory: false,
      },
    ])

    saveSkillDirectoryResources(root, [
      {
        name: 'keep.txt',
        relativePath: 'keep.txt',
        readable: true,
        content: 'stay',
        is_directory: false,
      },
    ])

    expect(fs.existsSync(path.join(root, 'keep.txt'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'drop.txt'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'SKILL.md'))).toBe(true)
  })

  it('reads forced preview for non-whitelisted text files', () => {
    const root = makeTempSkillDir()
    roots.push(root)
    fs.mkdirSync(path.join(root, 'animation'), { recursive: true })
    fs.writeFileSync(path.join(root, 'animation', 'mod.rs'), 'pub mod player;', 'utf-8')

    const preview = readResourceFilePreview(root, 'animation/mod.rs')
    expect(preview.isBinary).toBe(false)
    expect(preview.content).toContain('pub mod player')
  })

  it('auto-previews whitelisted extensions like .rs and .java', () => {
    const root = makeTempSkillDir()
    roots.push(root)
    fs.writeFileSync(path.join(root, 'Main.java'), 'class Main {}', 'utf-8')
    fs.writeFileSync(path.join(root, 'lib.rs'), 'fn main() {}', 'utf-8')

    const resources = listSkillDirectoryResources(root)
    const java = resources.find((item) => item.relativePath === 'Main.java')
    const rust = resources.find((item) => item.relativePath === 'lib.rs')
    expect(java?.readable).toBe(true)
    expect(java?.content).toContain('class Main')
    expect(rust?.readable).toBe(true)
    expect(rust?.content).toContain('fn main')
  })

  it('reports binary files as non-text previews', () => {
    const root = makeTempSkillDir()
    roots.push(root)
    fs.writeFileSync(path.join(root, 'demo.jar'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))

    const preview = readResourceFilePreview(root, 'demo.jar')
    expect(preview.isBinary).toBe(true)
    expect(preview.content).toMatch(/二进制文件/)
  })
})
