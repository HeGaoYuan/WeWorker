import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validatePublicConfig } from '../check-public-config.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('public Adapter registry, build profile, and versions stay consistent', () => {
  assert.deepEqual(validatePublicConfig(repoRoot), [])
})
