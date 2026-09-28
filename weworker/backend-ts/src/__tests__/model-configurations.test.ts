import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Settings } from '../config.js'
import { createModelConfiguration, getModelConfiguration, activateModelConfiguration, updateModelConfiguration, publicModelConfigurations } from '../model-configurations.js'
import { applySecrets, clearSecretsOnDisk, extractSecrets } from '../settings-secrets.js'
import { resolveWebwrightModelConfig, suggestExplorationBaseUrl } from '../webwright-model-config.js'

function legacySettings(): Settings {
  return {
    active_provider: 'anthropic', api_key: 'fixture-active-key', model: 'claude-sonnet-4-6',
    api_key_deepseek: 'legacy-key', model_deepseek: 'legacy-model', added_providers: ['deepseek'],
    custom_auth_type: 'api_key', base_url_custom: 'https://example.com/legacy', openai_base_url_custom: 'https://example.com/legacy/v1',
  } as Settings
}

describe('multiple model configurations', () => {
  it('does not combine a cleared per-configuration OpenAI URL with the legacy full URL mode', () => {
    const legacy = { ...legacySettings(), openai_base_url_custom: 'https://example.com/inference/?version=1', openai_base_url_is_full_custom: true }
    const first = createModelConfiguration(legacy, 'custom')
    let state = { ...legacy, ...first.updates }
    state = { ...state, ...updateModelConfiguration(state, first.id, {
      api_key: 'fixture-key', openai_base_url: '', openai_base_url_is_full: false,
    }) }
    const second = createModelConfiguration(state, 'custom')
    expect(second.updates.model_configurations[second.id]).toMatchObject({ openai_base_url: '', openai_base_url_is_full: false })
  })

  it('saves and activates two models of the same provider independently', () => {
    const legacy = legacySettings()
    const first = createModelConfiguration(legacy, 'deepseek')
    let state = { ...legacy, ...first.updates }
    state = { ...state, ...updateModelConfiguration(state, first.id, { api_key: 'first-key', model: 'first-model', context_limit: 200000 }) }
    const second = createModelConfiguration(state, 'deepseek')
    state = { ...state, ...second.updates }
    expect(first.id).not.toBe(second.id)
    state = { ...state, ...activateModelConfiguration(state, second.id) }
    expect(state).toMatchObject({ api_key: 'first-key', model: 'deepseek-v4-flash' })
    state = { ...state, ...updateModelConfiguration(state, second.id, { api_key: 'second-key', model: 'second-model', context_limit: 400000 }) }
    state = { ...state, ...activateModelConfiguration(state, first.id) }
    expect(state).toMatchObject({ api_key: 'first-key', model: 'first-model', context_limit: 200000 })
    state = { ...state, ...updateModelConfiguration(state, second.id, { model: 'edited-second' }) }
    expect(state.model).toBe('first-model')
    state = { ...state, ...activateModelConfiguration(state, second.id) }
    expect(state).toMatchObject({ api_key: 'second-key', model: 'edited-second', context_limit: 400000 })
    expect(state.model_configurations[first.id].model).toBe('first-model')
    expect(state.api_key_deepseek).toBe('legacy-key')
    expect(state.model_deepseek).toBe('legacy-model')
  })

  it('isolates custom endpoints and authentication and keeps advanced settings when saving only a model', () => {
    const created = createModelConfiguration(legacySettings(), 'custom')
    let state = { ...legacySettings(), ...created.updates }
    state = { ...state, ...updateModelConfiguration(state, created.id, {
      api_key: 'custom-key', model: 'custom-model', base_url: 'https://example.org/anthropic',
      openai_base_url: 'https://example.org/v1', auth_type: 'auth_token',
    }) }
    state = { ...state, ...activateModelConfiguration(state, created.id) }
    state = { ...state, ...updateModelConfiguration(state, created.id, { model: 'changed-model', api_key: '' }) }
    expect(state).toMatchObject({ model: 'changed-model', api_key: 'custom-key', active_auth_type: 'auth_token', custom_auth_type: 'api_key' })
    expect(resolveWebwrightModelConfig(state)).toMatchObject({ base_url: 'https://example.org/v1', model: 'changed-model' })
    expect(state.openai_base_url_custom).toBe('https://example.com/legacy/v1')
    expect(() => updateModelConfiguration(state, created.id, { base_url: '' })).toThrow()
    expect(() => updateModelConfiguration(state, created.id, { context_limit: -1 })).toThrow()
    expect(() => createModelConfiguration(state, 'builtin')).toThrow()
  })

  it('redacts each key from public responses and includes it in encrypted secret storage', () => {
    const created = createModelConfiguration(legacySettings(), 'deepseek')
    const state = { ...legacySettings(), ...created.updates }
    state.model_configurations[created.id].api_key = 'private-entry-key'
    const secrets = extractSecrets(state)
    const publicSettings = clearSecretsOnDisk(state)
    expect(JSON.stringify(publicSettings)).not.toContain('private-entry-key')
    expect(JSON.stringify(publicModelConfigurations(state))).not.toContain('private-entry-key')
    expect(publicModelConfigurations(state)[created.id].has_key).toBe(true)
    expect(applySecrets(publicSettings, secrets).model_configurations?.[created.id].api_key).toBe('private-entry-key')
  })

  it('uses each custom configuration address while preserving an independent exploration service', () => {
    const created = createModelConfiguration(legacySettings(), 'custom')
    let state = { ...legacySettings(), ...created.updates }
    state = { ...state, ...updateModelConfiguration(state, created.id, {
      api_key: 'fixture-config-key', model: 'fixture-config-model',
      base_url: 'https://example.org/custom', openai_base_url: '',
    }) }
    state = { ...state, ...activateModelConfiguration(state, created.id) }
    expect(resolveWebwrightModelConfig(state)).toMatchObject({
      base_url: 'https://example.org/custom', api_key: 'fixture-config-key', model: 'fixture-config-model',
    })
    expect(suggestExplorationBaseUrl(state)).toEqual({ url: 'https://example.org/custom/v1', generated: true })
    const independent = { ...state, exploration_base_url: 'https://example.com/exploration',
      exploration_use_main_key: false, exploration_api_key: 'fixture-exploration-key', exploration_model: 'fixture-exploration-model' }
    expect(resolveWebwrightModelConfig(independent)).toMatchObject({ base_url: 'https://example.com/exploration',
      api_key: 'fixture-exploration-key', model: 'fixture-exploration-model' })
    expect(suggestExplorationBaseUrl(independent)).toEqual({ url: 'https://example.com/exploration', generated: false })
  })

  it('rejects malformed configuration endpoints and providers outside the registered profile', () => {
    const created = createModelConfiguration(legacySettings(), 'custom')
    const state = { ...legacySettings(), ...created.updates }
    for (const base_url of ['file:///tmp/fixture', 'https://example.com/?token=fixture', 'https://example.com/v1/messages']) {
      expect(() => updateModelConfiguration(state, created.id, { base_url })).toThrow()
    }
    state.model_configurations[created.id].provider_id = 'unregistered'
    expect(getModelConfiguration(state, created.id)).toBeUndefined()
    expect(publicModelConfigurations(state)).toEqual({})
    expect(() => activateModelConfiguration(state, created.id)).toThrow()
    expect(() => createModelConfiguration(state, 'unregistered')).toThrow()
  })

  it('persists and reloads multiple models, credentials and the active context limit in an isolated settings directory', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-model-config-test-'))
    const homedir = vi.spyOn(os, 'homedir').mockReturnValue(directory)
    const { setMasterKeyForTests } = await import('../secret-store.js')
    setMasterKeyForTests('0123456789abcdef0123456789abcdef')
    try {
      const config = await import('../config.js')
      const initial = config.getSettings()
      const first = createModelConfiguration(initial, 'deepseek')
      let state = config.updateSettings(first.updates)
      state = config.updateSettings(updateModelConfiguration(state, first.id, { model: 'saved-one', api_key: 'persisted-one', context_limit: 250000 }))
      const second = createModelConfiguration(state, 'deepseek')
      state = config.updateSettings(second.updates)
      state = config.updateSettings(updateModelConfiguration(state, second.id, { model: 'saved-two', api_key: 'persisted-two', context_limit: 500000 }))
      config.updateSettings(activateModelConfiguration(state, first.id))
      const custom = createModelConfiguration(config.getSettings(), 'custom')
      state = config.updateSettings(custom.updates)
      config.updateSettings(updateModelConfiguration(state, custom.id, {
        base_url: 'https://example.com/arbitrary/endpoint?version=1', base_url_is_full: true,
        openai_base_url: 'https://example.com/openai/custom?version=2', openai_base_url_is_full: true,
        api_key: 'custom-test-key', model: 'custom-test-model',
      }))
      const raw = fs.readFileSync(path.join(directory, '.weworker', 'settings.json'), 'utf8')
      expect(raw).not.toContain('persisted-one')
      expect(raw).not.toContain('persisted-two')
      config.resetSettingsStateForTests()
      const restored = config.getSettings()
      expect(restored.active_model_configuration).toBe(first.id)
      expect(restored.context_limit).toBe(250000)
      expect(restored.model_configurations?.[first.id]).toMatchObject({ model: 'saved-one', api_key: 'persisted-one' })
      expect(restored.model_configurations?.[second.id]).toMatchObject({ model: 'saved-two', api_key: 'persisted-two' })
      expect(restored.model_deepseek).toBe(initial.model_deepseek)
      expect(restored.model_configurations?.[custom.id]).toMatchObject({
        base_url: 'https://example.com/arbitrary/endpoint?version=1', base_url_is_full: true,
        openai_base_url: 'https://example.com/openai/custom?version=2', openai_base_url_is_full: true,
      })
    } finally {
      homedir.mockRestore()
      setMasterKeyForTests(null)
    }
  })
})
