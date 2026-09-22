import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildModelOptions, buildSettingsProviderLists, getVisibleModelRefreshDetail, isModelRefreshFailed, shouldShowModelRefreshFailure } from '../utils/model-selection.js'

describe('provider model selection', () => {
  it('keeps an unlisted current model as an enabled option', () => {
    assert.deepEqual(buildModelOptions(['deepseek-v4-flash'], 'deepseek-chat'), [
      { value: 'deepseek-chat', label: 'deepseek-chat（当前配置）', currentOnly: true },
      { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash', currentOnly: false },
    ])
  })

  it('can omit the current-config suffix for compact chat selectors', () => {
    assert.deepEqual(
      buildModelOptions(['deepseek-v4-flash'], 'deepseek-chat', { annotateCurrent: false }),
      [
        { value: 'deepseek-chat', label: 'deepseek-chat', currentOnly: true },
        { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash', currentOnly: false },
      ],
    )
    assert.deepEqual(buildModelOptions(['deepseek-v4-flash'], 'deepseek-chat', { annotateCurrent: true })[0].label, 'deepseek-chat（当前配置）')
  })
  it('deduplicates catalog models without relabeling a listed current model', () => {
    assert.deepEqual(buildModelOptions(['model-a', 'model-a', 'model-b'], 'model-a'), [
      { value: 'model-a', label: 'model-a', currentOnly: false },
      { value: 'model-b', label: 'model-b', currentOnly: false },
    ])
  })

  it('reports refresh failure for fallback and empty remote catalogs', () => {
    assert.equal(isModelRefreshFailed({ source: 'fallback', models: ['model-a'] }), true)
    assert.equal(isModelRefreshFailed({ source: 'remote', models: [] }), true)
    assert.equal(isModelRefreshFailed({ source: 'remote', models: ['model-a'] }), false)
    assert.equal(isModelRefreshFailed(null), false)
  })

  it('shows refresh failure only after an explicit refresh', () => {
    assert.equal(shouldShowModelRefreshFailure({ source: 'fallback', models: [], explicitRefresh: false }), false)
    assert.equal(shouldShowModelRefreshFailure({ source: 'fallback', models: [], explicitRefresh: true }), true)
    assert.equal(shouldShowModelRefreshFailure({ source: 'remote', models: [], explicitRefresh: true }), true)
    assert.equal(shouldShowModelRefreshFailure({ source: 'remote', models: ['model-a'], explicitRefresh: true }), false)
  })

  it('shows the remote response detail only after an explicit refresh', () => {
    const detail = 'OpenAI 接口：HTTP 401 Unauthorized\n{"error":{"message":"invalid key"}}'
    assert.equal(getVisibleModelRefreshDetail({ source: 'fallback', models: [], warning: detail, explicitRefresh: false }), '')
    assert.equal(getVisibleModelRefreshDetail({ source: 'fallback', models: [], warning: detail, explicitRefresh: true }), detail)
    assert.equal(getVisibleModelRefreshDetail({ source: 'remote', models: [], explicitRefresh: true }), '远程接口返回空模型列表')
  })

  it('shows added and legacy-configured providers in settings', () => {
    const providerList = [
      { id: 'anthropic' },
      { id: 'deepseek' },
      { id: 'custom' },
    ]
    const { visible, addable } = buildSettingsProviderLists(providerList, {
      anthropic: { added: true },
      deepseek: { has_key: true },
      custom: { base_url: 'https://gateway.example/v1' },
    })
    assert.deepEqual(visible.map(({ id }) => id), ['anthropic', 'deepseek', 'custom'])
    assert.deepEqual(addable.map(({ id }) => id), ['anthropic', 'deepseek', 'custom'])
  })

  it('keeps unconfigured third-party providers out of settings until selected', () => {
    const providerList = [{ id: 'anthropic' }, { id: 'custom' }]
    const { visible, addable } = buildSettingsProviderLists(providerList, {})
    assert.deepEqual(visible.map(({ id }) => id), [])
    assert.deepEqual(addable.map(({ id }) => id), ['anthropic', 'custom'])
  })

  it('keeps the supplier selectable and shows multiple independent models', () => {
    const providerList = [{ id: 'deepseek', name: 'DeepSeek' }, { id: 'custom' }]
    const { visible, addable } = buildSettingsProviderLists(providerList, {
      deepseek: { has_key: true, model: 'legacy' },
      'model-first': { provider_id: 'deepseek', model: 'model-one' },
      'model-second': { provider_id: 'deepseek', model: 'model-two' },
      'model-custom': { provider_id: 'custom', model: 'gateway-model' },
    })
    assert.deepEqual(visible.map(({ id }) => id), ['deepseek', 'model-first', 'model-second', 'model-custom'])
    assert.deepEqual(visible.slice(1).map(({ providerId }) => providerId), ['deepseek', 'deepseek', 'custom'])
    assert.deepEqual(addable.map(({ id }) => id), ['deepseek', 'custom'])
  })
})
