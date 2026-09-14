import { describe, expect, it } from 'vitest'
import {
  isAllowedHost,
  isAllowedOrigin,
  isAuthorizedHttpRequest,
  redactSensitive,
} from '../http-security.js'

describe('local HTTP security boundary', () => {
  it('allows only loopback host headers for the backend port', () => {
    expect(isAllowedHost('127.0.0.1:8765')).toBe(true)
    expect(isAllowedHost('localhost:8765')).toBe(true)
    expect(isAllowedHost('evil.example.com:8765')).toBe(false)
    expect(isAllowedHost('127.0.0.1:9999')).toBe(false)
  })

  it('allows only local renderer origins and non-browser callers', () => {
    expect(isAllowedOrigin(undefined)).toBe(true)
    expect(isAllowedOrigin('null')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true)
    expect(isAllowedOrigin('https://attacker.example')).toBe(false)
  })

  it('requires the exact launch token when auth is enabled', () => {
    expect(isAuthorizedHttpRequest('launch-token', 'launch-token')).toBe(true)
    expect(isAuthorizedHttpRequest('', 'launch-token')).toBe(false)
    expect(isAuthorizedHttpRequest('wrong-token', 'launch-token')).toBe(false)
    expect(isAuthorizedHttpRequest('', '')).toBe(true)
  })

  it('redacts API keys, bearer headers, tokens and secrets from log lines', () => {
    const line = 'x-api-key: sk-testSECRET api_key=abc123 authorization: BearerXYZ token=tokValue secret=mySecret'
    const redacted = redactSensitive(line)
    expect(redacted).not.toContain('sk-testSECRET')
    expect(redacted).not.toContain('abc123')
    expect(redacted).not.toContain('BearerXYZ')
    expect(redacted).not.toContain('tokValue')
    expect(redacted).not.toContain('mySecret')
    expect(redacted).toContain('[REDACTED]')
  })
})
