import { describe, expect, it } from 'vitest'
import {
  normalizeOpenBrowserAllowedOrigin,
  normalizeOpenBrowserAllowedOrigins,
} from '../config.js'

describe('open_browser permissions settings', () => {
  it('normalizes URL inputs to exact origins', () => {
    expect(normalizeOpenBrowserAllowedOrigin('http://127.0.0.1:8765/logs?x=1#top')).toBe('http://127.0.0.1:8765')
    expect(normalizeOpenBrowserAllowedOrigin('https://internal.example.com/app')).toBe('https://internal.example.com')
  })

  it('drops invalid protocols and duplicates', () => {
    expect(normalizeOpenBrowserAllowedOrigins([
      'http://127.0.0.1:8765/logs',
      'http://127.0.0.1:8765',
      'file:///tmp/a',
      'not-a-url',
    ])).toEqual(['http://127.0.0.1:8765'])
  })
})
