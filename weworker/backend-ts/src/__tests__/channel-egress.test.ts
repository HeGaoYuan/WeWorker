import { describe, expect, it } from 'vitest'
import {
  buildAllowedWeixinBaseUrls,
  assertAllowedWeixinBaseUrl,
} from '../channel-egress.js'

describe('channel egress allowlist', () => {
  it('allows the default Weixin iLink endpoint', () => {
    const allowed = buildAllowedWeixinBaseUrls()
    expect(assertAllowedWeixinBaseUrl('', allowed)).toBe('https://ilinkai.weixin.qq.com')
    expect(assertAllowedWeixinBaseUrl('https://ilinkai.weixin.qq.com/', allowed)).toBe('https://ilinkai.weixin.qq.com')
  })

  it('rejects unlisted Weixin base URLs', () => {
    const allowed = buildAllowedWeixinBaseUrls()
    expect(() => assertAllowedWeixinBaseUrl('https://attacker.example', allowed)).toThrow(/not allowed/i)
    expect(() => assertAllowedWeixinBaseUrl('http://127.0.0.1:9999', allowed)).toThrow(/not allowed|invalid/i)
  })

  it('allows explicitly listed enterprise Weixin endpoints', () => {
    const allowed = buildAllowedWeixinBaseUrls('https://weixin-proxy.example.com/ilink')
    expect(assertAllowedWeixinBaseUrl('https://weixin-proxy.example.com/ilink/', allowed)).toBe('https://weixin-proxy.example.com/ilink')
  })
})
