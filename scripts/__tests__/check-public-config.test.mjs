import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validatePublicConfig } from '../check-public-config.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('public Adapter registry, build profile, and versions stay consistent', () => {
  assert.deepEqual(validatePublicConfig(repoRoot), [])
})

function buildFixtureRepo({ webcliVersion = '1.0.4', ledgerOverrides = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-public-config-'))
  const writeJson = (relativePath, value) => {
    const target = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`)
  }
  const appVersion = '1.0.0'
  fs.mkdirSync(path.join(root, 'adapters'), { recursive: true })
  writeJson('weworker/build-profile.json', { adapters: [] })
  for (const relativePath of [
    'weworker/package.json',
    'weworker/renderer/package.json',
    'weworker/backend-ts/package.json',
    'officialWeb/package.json',
    'metrics-server/package.json',
  ]) {
    writeJson(relativePath, { version: appVersion })
  }
  writeJson('extension/manifest.json', { version: appVersion })
  writeJson('weworker/changelog.json', [{ version: appVersion }])
  const downloadConfig = path.join(root, 'officialWeb', 'src', 'lib', 'downloadConfig.js')
  fs.mkdirSync(path.dirname(downloadConfig), { recursive: true })
  fs.writeFileSync(downloadConfig, `export const APP_VERSION = '${appVersion}'\n`)

  writeJson('webcli/package.json', { version: webcliVersion })
  writeJson('webcli/version.json', { version: ledgerOverrides.versionJson ?? webcliVersion })
  writeJson('webcli/.claude-plugin/plugin.json', { version: ledgerOverrides.pluginJson ?? webcliVersion })
  const skill = path.join(root, 'webcli', 'skills', 'webcli', 'SKILL.md')
  fs.mkdirSync(path.dirname(skill), { recursive: true })
  fs.writeFileSync(skill, `---\nname: webcli\nversion: ${ledgerOverrides.skillMd ?? webcliVersion}\n---\n`)
  return root
}

test('webcli version may diverge from the app version but its release ledger must match', () => {
  const root = buildFixtureRepo()
  try {
    assert.deepEqual(validatePublicConfig(root), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('webcli ledger drift is reported per file', () => {
  const root = buildFixtureRepo({ ledgerOverrides: { versionJson: '1.0.3', skillMd: '1.0.2' } })
  try {
    assert.deepEqual(validatePublicConfig(root), [
      'webcli/version.json version is 1.0.3, expected 1.0.4',
      'webcli/skills/webcli/SKILL.md version must be 1.0.4',
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
