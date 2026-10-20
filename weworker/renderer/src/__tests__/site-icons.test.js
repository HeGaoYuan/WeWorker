import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { resolveSiteIcon } from '../utils/site-icon-resolve.js'

registerHooks({
  load(url, context, nextLoad) {
    if (/\.(png|svg)$/.test(url)) {
      return { format: 'module', source: `export default ${JSON.stringify(url)}`, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
const { SITE_ICON_ASSETS } = await import('../utils/site-icon-assets.js')

test('every bundled website has an actual local image and a documented source', () => {
  const profile = JSON.parse(readFileSync(new URL('../../../build-profile.json', import.meta.url), 'utf8'))
  const sources = readFileSync(new URL('../assets/site-icons/SOURCES.md', import.meta.url), 'utf8')
  for (const id of profile.adapters) {
    assert.ok(SITE_ICON_ASSETS[id], `missing icon for ${id}`)
    const url = new URL(SITE_ICON_ASSETS[id])
    const data = readFileSync(url)
    if (url.pathname.endsWith('.png')) {
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    } else {
      assert.match(data.toString(), /^<svg /)
      assert.doesNotMatch(data.toString(), /<script|<foreignObject|href=/i)
    }
    assert.ok(sources.includes(`| ${id} | https://`))
  }
})

test('unknown sites retain their existing generic or custom icon fallback', () => {
  assert.deepEqual(resolveSiteIcon({ id: 'example.com' }), { mode: 'svg', key: 'globe' })
  assert.deepEqual(resolveSiteIcon({ icon: 'mail' }), { mode: 'svg', key: 'mail' })
  assert.deepEqual(resolveSiteIcon({ icon: '⭐' }), { mode: 'literal', text: '⭐' })
})

test('all bundled icons have enough source pixels for the welcome grid on a 2x display', () => {
  // Allow 40 CSS px (the welcome grid uses 34). A rectangular logo is contained,
  // so its longest edge needs at least 80 source pixels at devicePixelRatio 2.
  for (const [id, asset] of Object.entries(SITE_ICON_ASSETS)) {
    const url = new URL(asset)
    if (url.pathname.endsWith('.svg')) continue
    const data = readFileSync(url)
    const width = data.readUInt32BE(16)
    const height = data.readUInt32BE(20)
    assert.ok(Math.max(width, height) >= 80, `${id}: ${width}x${height} is too small for the welcome grid`)
  }
})
