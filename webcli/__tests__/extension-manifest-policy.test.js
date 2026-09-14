import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifestPath = path.resolve(__dirname, '../../extension/manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

describe('extension manifest website exploration policy', () => {
  it('grants the website coverage required by the exploration content script', () => {
    expect(manifest.host_permissions).toContain('<all_urls>')
    expect(manifest.content_scripts?.[0]?.matches).toContain('<all_urls>')
    expect(manifest.web_accessible_resources?.[0]?.matches).toContain('<all_urls>')
  })

  it('keeps injected script and web accessible resources aligned to host permissions', () => {
    expect(manifest.content_scripts?.[0]?.matches).toEqual(manifest.host_permissions)
    expect(manifest.web_accessible_resources?.[0]?.matches).toEqual(manifest.host_permissions)
  })
})
