import { describe, expect, it } from 'vitest'
import { isAllowedBridgeOrigin, isBrowserExtensionOrigin } from '../websocket-origin-policy.js'

describe('bridge websocket origin policy', () => {
  it('allows non-browser clients and browser extensions', () => {
    expect(isAllowedBridgeOrigin(undefined)).toBe(true)
    expect(isAllowedBridgeOrigin('chrome-extension://abcdefghijklmnop')).toBe(true)
    expect(isAllowedBridgeOrigin('moz-extension://abcdefghijklmnop')).toBe(true)
  })

  it('rejects ordinary web page origins and opaque origins', () => {
    expect(isAllowedBridgeOrigin('https://attacker.example')).toBe(false)
    expect(isAllowedBridgeOrigin('http://localhost:5173')).toBe(false)
    expect(isAllowedBridgeOrigin('null')).toBe(false)
  })

  it('distinguishes browser extension origins from no-origin CLI clients', () => {
    expect(isBrowserExtensionOrigin('chrome-extension://abcdefghijklmnop')).toBe(true)
    expect(isBrowserExtensionOrigin('moz-extension://abcdefghijklmnop')).toBe(true)
    expect(isBrowserExtensionOrigin(undefined)).toBe(false)
    expect(isBrowserExtensionOrigin('https://attacker.example')).toBe(false)
  })
})
