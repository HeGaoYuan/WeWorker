import { describe, expect, it } from 'vitest'
import { hasLegacyProviderConfig, isProviderVisible, normalizeAddedProviders } from '../provider-visibility.js'

describe('provider visibility', () => {
  it('retains providers explicitly added by the user', () => {
    expect(normalizeAddedProviders(['deepseek', 'deepseek', 'unknown', 'custom'])).toEqual(['deepseek', 'custom'])
    expect(isProviderVisible('deepseek', {
      addedProviders: ['deepseek'],
      activeProvider: 'anthropic',
      legacy: {},
    })).toBe(true)
  })

  it('retains historical custom OpenAI configuration after an upgrade', () => {
    expect(hasLegacyProviderConfig({
      hasKey: false,
      model: '',
      baseUrl: '',
      openaiBaseUrl: 'https://gateway.example/v1',
    })).toBe(true)
    expect(isProviderVisible('custom', {
      addedProviders: [],
      activeProvider: 'anthropic',
      legacy: {
        custom: {
          hasKey: false,
          model: '',
          openaiBaseUrl: 'https://gateway.example/v1',
        },
      },
    })).toBe(true)
  })

  it('hides untouched defaults and providers outside the registered profile', () => {
    expect(isProviderVisible('deepseek', {
      addedProviders: [], activeProvider: 'anthropic',
      legacy: { deepseek: { hasKey: false, model: 'deepseek-v4-flash', defaultModels: ['deepseek-v4-flash'] } },
    })).toBe(false)
    expect(isProviderVisible('unregistered', {
      addedProviders: ['unregistered'], activeProvider: 'unregistered',
      legacy: { unregistered: { hasKey: true, model: 'fixture-model' } },
    })).toBe(false)
    expect(normalizeAddedProviders(['unregistered', 'anthropic'])).toEqual(['anthropic'])
  })

  it('retains the current registered provider before its first save', () => {
    expect(isProviderVisible('anthropic', {
      addedProviders: [], activeProvider: 'anthropic', legacy: {},
    })).toBe(true)
  })
})
