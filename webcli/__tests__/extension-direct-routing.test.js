import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const EXTENSION_DIR = resolve(process.cwd(), '../extension')

describe('extension direct routing boundary', () => {
  it('direct storage_get keeps URL origin scope and retries candidate tabs', () => {
    const source = readFileSync(resolve(EXTENSION_DIR, 'background', 'service-worker.js'), 'utf8')

    expect(source).toContain('function getRuntimeStorageScopeFromPayload')
    expect(source).toContain('url.origin')
    expect(source).toContain('function storageScopeMatchesTab')
    expect(source).toContain('async function findStorageContextTabs')
    expect(source).toContain('for (const tab of tabs)')
    expect(source).toContain('direct storage_get tab failed')
    expect(source).toContain('refreshDirectRuntimeStorageInBackgroundTab')
    expect(source).toContain('direct storage_get refreshed from background tab')
  })
})
