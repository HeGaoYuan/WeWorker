import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function manifestPaths(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, 'manifest.json'))
    .filter((file) => fs.existsSync(file))
}

describe('Adapter display metadata', () => {
  it('does not expose generated or migration placeholder descriptions', () => {
    const manifests = [
      ...manifestPaths(path.join(repoRoot, 'adapters')),
      ...manifestPaths(path.join(repoRoot, 'extension', 'adapters')),
    ]

    const placeholders = [
      /OpenCLI\s*对齐能力/,
      /Generated adapter shell/i,
    ]

    const failures = manifests
      .map((file) => ({ file, manifest: readJson(file) }))
      .filter(({ manifest }) => placeholders.some((pattern) => pattern.test(manifest.description || '')))
      .map(({ file, manifest }) => `${path.relative(repoRoot, file)}: ${manifest.description}`)

    expect(failures).toEqual([])
  })

  it('keeps scenario tool references aligned with actual commands', () => {
    const manifests = manifestPaths(path.join(repoRoot, 'adapters'))
    const failures = []

    for (const file of manifests) {
      const manifest = readJson(file)
      const commandIds = new Set((manifest.commands || []).map((command) => command.id))
      for (const scenario of manifest.scenarios || []) {
        for (const toolName of scenario.tool_names || []) {
          if (!commandIds.has(toolName)) {
            failures.push(`${path.relative(repoRoot, file)} scenario ${scenario.id || scenario.title} references missing command ${toolName}`)
          }
        }
      }
    }

    expect(failures).toEqual([])
  })
})
