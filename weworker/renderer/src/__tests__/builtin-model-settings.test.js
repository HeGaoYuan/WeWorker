import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { isBuiltinProvider, hasFixedModel, PROVIDERS, useSettingsStore } from '../store/settings.js'
import { buildSettingsProviderLists } from '../utils/model-selection.js'

const initialState = useSettingsStore.getState()
const previousFetch = globalThis.fetch
const previousWindow = globalThis.window
afterEach(() => {
  globalThis.fetch = previousFetch
  globalThis.window = previousWindow
  useSettingsStore.setState(initialState, true)
})

test('built-in metadata is visible before configuration without claiming a key exists', () => {
  assert.ok(PROVIDERS.some(provider => provider.id === 'builtin'))
  assert.ok(PROVIDERS.some(provider => provider.id === 'builtin_dev'))
  assert.equal(initialState.providers.builtin.has_key, false)
  assert.equal(initialState.providers.builtin.readonly, true)
})

test('renderer initial state lists built-ins and the three fixed presets before settings load', () => {
  const { visible } = buildSettingsProviderLists(PROVIDERS, initialState.providers)
  assert.deepEqual(visible.map(provider => provider.id), ['builtin', 'builtin_dev', 'anthropic', 'glm', 'bank_coding', 'deepseek'])
})

test('unavailable built-in activation preserves the previous selection', async () => {
  globalThis.window = {}
  globalThis.fetch = async () => Response.json({ detail: '内置模型服务尚未配置' }, { status: 400 })
  await assert.rejects(useSettingsStore.getState().activateProvider('builtin'), /服务尚未配置/)
  assert.equal(useSettingsStore.getState().activeProvider, initialState.activeProvider)
})

test('built-in activation uses server state and does not send credentials from the renderer', async () => {
  globalThis.window = {}
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/settings/provider/activate'))
    assert.deepEqual(JSON.parse(options.body), { provider: 'builtin' })
    return Response.json({ active_provider: 'builtin', model: 'ark-code-latest', has_api_key: true,
      providers: { builtin: { model: 'ark-code-latest', has_key: true, readonly: true } },
    })
  }
  await useSettingsStore.getState().activateProvider('builtin')
  assert.equal(useSettingsStore.getState().activeProvider, 'builtin')
  assert.equal(useSettingsStore.getState().model, 'ark-code-latest')
})


test('fixed coding provider is fixed, visible and cannot be added twice', () => {
  const { visible, addable } = buildSettingsProviderLists(PROVIDERS, {})
  const entry = visible.find(provider => provider.id === 'bank_coding')
  assert.ok(entry)
  assert.equal(entry.defaultModel, '')
  assert.deepEqual(entry.models, [])
  assert.equal(addable.some(provider => provider.id === 'bank_coding'), false)
  assert.notEqual(initialState.providers.bank_coding.readonly, true)
  assert.equal(isBuiltinProvider('bank_coding'), false)
  assert.equal(initialState.providers.bank_coding.has_key, false)
})

test('user-configured coding provider supports model selection', () => {
  assert.equal(hasFixedModel('bank_coding'), false)
  assert.equal(hasFixedModel('builtin'), true)
  assert.equal(hasFixedModel('builtin_dev'), true)
})
