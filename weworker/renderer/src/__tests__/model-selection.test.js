import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildModelOptions, buildProbeResultRows, getVisibleModelRefreshDetail, isModelRefreshFailed, shouldShowModelRefreshFailure } from '../utils/model-selection.js'

describe('provider model selection', () => {
  it('keeps an unlisted current model as an enabled option', () => {
    assert.deepEqual(buildModelOptions(['deepseek-v4-flash'], 'deepseek-chat'), [
      { value: 'deepseek-chat', label: 'deepseek-chat（当前配置）', currentOnly: true },
      { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash', currentOnly: false },
    ])
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

  it('labels probe results with protocols and no internal product names', () => {
    const rows = buildProbeResultRows([
      { protocol: 'anthropic_messages', ok: true },
      { protocol: 'openai_chat_completions', ok: false },
    ])
    assert.deepEqual(rows.map((row) => row.label), ['Anthropic 接口', 'OpenAI 接口'])
    assert.doesNotMatch(JSON.stringify(rows), /weworker|webwright/i)
  })

  it('distinguishes two Anthropic endpoints without internal product names', () => {
    const rows = buildProbeResultRows([
      { protocol: 'anthropic_messages', ok: true },
      { protocol: 'anthropic_messages', ok: true },
    ])
    assert.deepEqual(rows.map((row) => row.label), ['Anthropic 接口', 'Anthropic 结构化输出接口'])
  })
})
