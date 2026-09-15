import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSiteCatalog } from './prepare-sites.mjs'

const base = {
  version: 1,
  updated_at: '2026-01-01',
  groups: [{ name: 'Public', sites: [{ id: 'public.example', name: 'Public site' }] }],
}

test('site overlay prepends private groups without changing the base catalog', () => {
  const merged = mergeSiteCatalog(base, {
    prependGroups: [{ name: 'Private', sites: [{ id: 'private.example', name: 'Private site' }] }],
  })
  assert.deepEqual(merged.groups.map((group) => group.name), ['Private', 'Public'])
  assert.deepEqual(base.groups.map((group) => group.name), ['Public'])
})

test('site overlay rejects duplicate site ids', () => {
  assert.throws(() => mergeSiteCatalog(base, {
    appendGroups: [{ name: 'Duplicate', sites: [{ id: 'public.example', name: 'Duplicate' }] }],
  }), /duplicate site id/)
})
