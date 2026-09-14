import { describe, expect, it } from 'vitest'
import { normalizeOwnerUserId, validateOwnerUserId } from '../utils/owner-user-id.js'

describe('owner-user-id', () => {
  it('accepts empty owner id', () => {
    expect(validateOwnerUserId('wecom', '')).toBeNull()
    expect(validateOwnerUserId('wecom', '   ')).toBeNull()
  })

  it('rejects short or malformed owner ids', () => {
    expect(validateOwnerUserId('wecom', 'err')).toMatch(/过短/)
    expect(validateOwnerUserId('qq', 'abc!@#')).toMatch(/格式不正确/)
  })

  it('accepts typical channel owner ids', () => {
    expect(validateOwnerUserId('wecom', 'wohR_KCgAAbIrAnDRuaTZORF5QxppMXA')).toBeNull()
    expect(validateOwnerUserId('weixin', 'ilink-user-001')).toBeNull()
    expect(normalizeOwnerUserId(' owner-qq ')).toBe('owner-qq')
  })
})
