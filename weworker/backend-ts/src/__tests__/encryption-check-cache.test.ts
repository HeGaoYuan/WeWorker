/**
 * A3: check_file_encryption 结果缓存（work 级，key=path+mtime，30 分钟 TTL）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkFileEncryptionCached,
  clearEncryptionCheckCache,
} from '../encryption-check-cache.js'

const TTL_MS = 30 * 60 * 1000

describe('A3: check_file_encryption cache', () => {
  beforeEach(() => {
    clearEncryptionCheckCache()
    vi.useRealTimers()
  })

  it('returns cached result and skips the exe spawn on the second call', async () => {
    let spawns = 0
    const run = async () => { spawns++; return '{"encrypted":false}' }

    const a = await checkFileEncryptionCached('work-1', '/u/a.txt', 1000, run)
    const b = await checkFileEncryptionCached('work-1', '/u/a.txt', 1000, run)

    expect(a.cached).toBe(false)
    expect(b.cached).toBe(true)
    expect(a.text).toBe(b.text)
    expect(spawns).toBe(1) // second call served from cache
  })

  it('invalidates when mtime changes (decrypt_file rewrites the file)', async () => {
    let spawns = 0
    const run = async () => { spawns++; return `{"encrypted":${spawns === 1}}` }

    const before = await checkFileEncryptionCached('work-1', '/u/a.txt', 1000, run)
    const after = await checkFileEncryptionCached('work-1', '/u/a.txt', 2000, run) // mtime bumped

    expect(before.cached).toBe(false)
    expect(after.cached).toBe(false)
    expect(spawns).toBe(2) // different mtime → re-spawn
  })

  it('isolates caches per work', async () => {
    let spawns = 0
    const run = async () => { spawns++; return '{"encrypted":false}' }

    await checkFileEncryptionCached('work-1', '/u/a.txt', 1000, run)
    const other = await checkFileEncryptionCached('work-2', '/u/a.txt', 1000, run)

    expect(other.cached).toBe(false)
    expect(spawns).toBe(2)
  })

  it('re-runs after the 30-minute TTL expires', async () => {
    vi.useFakeTimers()
    let spawns = 0
    const run = async () => { spawns++; return '{"encrypted":false}' }

    const fresh = await checkFileEncryptionCached('work-1', '/u/a.txt', 1000, run)
    const hit = await checkFileEncryptionCached('work-1', '/u/a.txt', 1000, run)

    vi.advanceTimersByTime(TTL_MS + 1) // past TTL

    const expired = await checkFileEncryptionCached('work-1', '/u/a.txt', 1000, run)

    expect(fresh.cached).toBe(false)
    expect(hit.cached).toBe(true)
    expect(expired.cached).toBe(false) // TTL expired → re-spawn
    expect(spawns).toBe(2)
  })

  it('clears on overflow once the size cap is reached', async () => {
    const run = async (p: string) => `{"path":"${p}"}`

    // Fill up to the cap (256) — each distinct path is a fresh miss.
    for (let i = 0; i < 256; i++) {
      await checkFileEncryptionCached('work-1', `/u/f${i}.txt`, 1000, () => run(`/u/f${i}.txt`))
    }
    // The 257th distinct entry triggers the overflow clear.
    await checkFileEncryptionCached('work-1', '/u/f256.txt', 1000, () => run('/u/f256.txt'))

    // Previously-cached entry was evicted → must re-run.
    let spawns = 0
    const rechecked = await checkFileEncryptionCached('work-1', '/u/f0.txt', 1000, () => {
      spawns++
      return run('/u/f0.txt')
    })
    expect(rechecked.cached).toBe(false)
    expect(spawns).toBe(1)
  })
})
