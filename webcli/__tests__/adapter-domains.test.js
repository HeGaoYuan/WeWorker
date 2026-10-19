import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateV2Manifest } from '../adapter-package-validation.js'
import { adapterPermissions } from '../adapter-catalog.js'
import { buildAllowedOpenBrowserOrigins } from '../open-browser-policy.js'
import { isAutologinPage } from '../site-login.js'
import { managedAdapterSkill } from '../adapter-views.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function manifest(extra = {}, command = {}) {
  return {
    schema_version: 2, name: 'shop.example.com', version: '1.0.0', description: 'Fixture',
    match: ['www.example.com'],
    commands: [{ id: 'orders', runtime: 'extension', module: 'extension/commands/orders.js', description: 'Orders', safety: 'read', schema: { type: 'object' }, ...command }],
    ...extra,
  }
}

describe('manifest site domains', () => {
  it('accepts site domains and route hosts anywhere inside them', () => {
    expect(() => validateV2Manifest(manifest({ domains: ['example.com', 'example.hk'] }, { routeDomain: 'order.example.hk' }), 'shop.example.com')).not.toThrow()
    expect(() => validateV2Manifest(manifest({ domains: ['example.com'], auth: { login_url: 'https://passport.example.com/login' } }), 'shop.example.com')).not.toThrow()
  })

  it.each([
    [{ domains: [] }, /1 to 16/],
    [{ domains: 'example.com' }, /1 to 16/],
    [{ domains: ['com'] }, /at least two labels/],
    [{ domains: ['co.uk'] }, /public suffix/],
    [{ domains: ['github.io'] }, /public suffix/],
    [{ domains: ['*.example.com'] }, /bare domain/],
    [{ domains: ['Example.com'] }, /lower case/],
    [{ domains: ['example.com', 'example.com'] }, /duplicate/],
    [{ domains: ['10.0.0.1'] }, /IP address/],
  ])('rejects %j', (extra, error) => {
    expect(() => validateV2Manifest(manifest(extra), 'shop.example.com')).toThrow(error)
  })

  it('still requires route hosts to be inside the scope', () => {
    expect(() => validateV2Manifest(manifest({ domains: ['example.com'] }, { routeDomain: 'order.example.net' }), 'shop.example.com'))
      .toThrow(/match host or a host inside domains/)
    expect(() => validateV2Manifest(manifest({}, { routeDomain: 'order.example.com' }), 'shop.example.com'))
      .toThrow(/match host or a host inside domains/)
  })

  it('makes a new site domain a permission change for installed Adapters', () => {
    const before = adapterPermissions(manifest())
    const after = adapterPermissions(manifest({ domains: ['example.com'] }))
    expect(after.filter((permission) => !before.includes(permission))).toEqual(['domain:example.com'])
  })

  it('open_browser allows the apex and www host of each site domain only', () => {
    const origins = buildAllowedOpenBrowserOrigins([manifest({ domains: ['example.hk'] })], '')
    expect(origins.has('https://example.hk')).toBe(true)
    expect(origins.has('https://www.example.hk')).toBe(true)
    expect(origins.has('https://order.example.hk')).toBe(false)
  })

  it('auto-login and the Skill text use the same scope', () => {
    const site = manifest({ domains: ['example.hk'] })
    expect(isAutologinPage(site, 'https://login.example.hk/')).toBe(true)
    expect(isAutologinPage(site, 'https://login.example.net/')).toBe(false)
    expect(managedAdapterSkill({ ...site, id: site.name, commands: [], tools: [] })).toContain('Websites: www.example.com, *.example.hk')
  })

  it('JD declares its regional domain instead of every page host', () => {
    const jd = JSON.parse(fs.readFileSync(path.join(repo, 'adapters/jd.com/manifest.json'), 'utf8'))
    expect(jd.match).toEqual(['www.jd.com'])
    expect(jd.domains).toEqual(['jd.com', 'jd.hk'])
    expect(() => validateV2Manifest(jd, 'jd.com')).not.toThrow()
  })
})
