import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { syncPackageExtension } from '../scripts/prepare-package-extension.js'

const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('prepare package extension', () => {
  it('copies the sibling extension into the webcli package without dependencies or scaffold artifacts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webcli-pack-'))
    tempDirs.push(root)
    const webcliDir = path.join(root, 'webcli')
    const sourceExtensionDir = path.join(root, 'extension')
    const siteGeneratedDir = path.join(sourceExtensionDir, 'adapters', 'site.test', 'webcli-generated')
    fs.mkdirSync(path.join(sourceExtensionDir, 'adapters', 'site.test'), { recursive: true })
    fs.mkdirSync(siteGeneratedDir, { recursive: true })
    fs.mkdirSync(path.join(sourceExtensionDir, 'node_modules', 'left-pad'), { recursive: true })
    fs.mkdirSync(path.join(sourceExtensionDir, 'test'), { recursive: true })
    fs.writeFileSync(path.join(sourceExtensionDir, 'manifest.json'), '{"version":"1"}\n')
    fs.writeFileSync(path.join(sourceExtensionDir, 'adapters', 'site.test', 'manifest.json'), '{"id":"site.test"}\n')
    fs.writeFileSync(path.join(siteGeneratedDir, 'site.test.index-snippet.generated.txt'), 'snippet')
    fs.writeFileSync(path.join(siteGeneratedDir, 'site.test.integration.generated.md'), '# integration\n')
    fs.writeFileSync(path.join(sourceExtensionDir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = null\n')
    fs.writeFileSync(path.join(sourceExtensionDir, 'test', 'site.test.mjs'), 'import test from "node:test"\n')
    fs.mkdirSync(path.join(webcliDir, 'extension', 'stale'), { recursive: true })
    fs.writeFileSync(path.join(webcliDir, 'extension', 'stale', 'old.txt'), 'old')

    const result = syncPackageExtension({ webcliDir, sourceExtensionDir })

    expect(result.fileCount).toBe(2)
    expect(fs.existsSync(path.join(webcliDir, 'extension', 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(webcliDir, 'extension', 'adapters', 'site.test', 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(webcliDir, 'extension', 'adapters', 'site.test', 'webcli-generated', 'site.test.index-snippet.generated.txt'))).toBe(false)
    expect(fs.existsSync(path.join(webcliDir, 'extension', 'adapters', 'site.test', 'webcli-generated', 'site.test.integration.generated.md'))).toBe(false)
    expect(fs.existsSync(path.join(webcliDir, 'extension', 'node_modules'))).toBe(false)
    expect(fs.existsSync(path.join(webcliDir, 'extension', 'test'))).toBe(false)
    expect(fs.existsSync(path.join(webcliDir, 'extension', 'stale'))).toBe(false)
  })
})
