import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { useSettingsStore } from '../store/settings.js'

const initialState = useSettingsStore.getState()
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.window = originalWindow
  useSettingsStore.setState(initialState, true)
})

test('failed initialization exposes an error and can be retried successfully', async () => {
  globalThis.window = {}
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await useSettingsStore.getState().load()
  assert.equal(useSettingsStore.getState().loaded, false)
  assert.ok(useSettingsStore.getState().loadError)
  globalThis.fetch = async (url) => Response.json(url.endsWith('/channels') ? {} : {
    active_provider: 'anthropic', onboarding_completed: true, model: 'test-model',
  })
  await useSettingsStore.getState().load()
  assert.equal(useSettingsStore.getState().loaded, true)
  assert.equal(useSettingsStore.getState().loadError, '')
})

test('HTTP errors do not masquerade as successfully loaded settings', async () => {
  globalThis.window = {}
  globalThis.fetch = async () => Response.json({ detail: 'Forbidden origin' }, { status: 403 })
  await useSettingsStore.getState().load()
  assert.equal(useSettingsStore.getState().loaded, false)
  assert.match(useSettingsStore.getState().loadError, /403/)
})
