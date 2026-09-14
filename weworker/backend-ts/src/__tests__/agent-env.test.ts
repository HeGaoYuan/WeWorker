import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildConfiguredModelEnv } from '../agent.js'

const managedKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
]

const previous = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of managedKeys) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('buildConfiguredModelEnv', () => {
  it('uses WeWorker settings instead of inherited model auth env vars or .claude.json env', () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-token'
    process.env.ANTHROPIC_BASE_URL = 'https://env.example.com'
    process.env.ANTHROPIC_MODEL = 'env-model'
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'env-oauth'
    process.env.CLAUDE_CONFIG_DIR = 'C:\\Users\\someone\\.claude'

    const env = buildConfiguredModelEnv({
      api_key: 'settings-key',
      base_url: 'https://api.deepseek.com/anthropic/',
    })

    expect(env.ANTHROPIC_API_KEY).toBe('settings-key')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.ANTHROPIC_MODEL).toBeUndefined()
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(env.CLAUDE_CONFIG_DIR).toContain('.weworker')
    expect(env.CLAUDE_CONFIG_DIR).not.toBe('C:\\Users\\someone\\.claude')
    expect(fs.statSync(path.join(env.CLAUDE_CONFIG_DIR!, 'skills')).isDirectory()).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(env.CLAUDE_CONFIG_DIR!, '.claude.json'), 'utf8')).env).toEqual({})
  })

  it('removes inherited custom base url when settings use the default Anthropic endpoint', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://env.example.com'

    const env = buildConfiguredModelEnv({
      api_key: 'settings-key',
      base_url: 'https://api.anthropic.com',
    })

    expect(env.ANTHROPIC_API_KEY).toBe('settings-key')
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
  })

  it('allows the user-configured custom model base url at runtime', () => {
    const env = buildConfiguredModelEnv({
      api_key: 'settings-key',
      base_url: 'https://llm.example.com/anthropic/',
    })

    expect(env.ANTHROPIC_API_KEY).toBe('settings-key')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://llm.example.com/anthropic')
  })
})
