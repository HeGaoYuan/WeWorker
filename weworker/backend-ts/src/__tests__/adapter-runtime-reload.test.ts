import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../adapter-parser.js', () => ({
  clearAdapterCache: vi.fn(),
}))

import { clearAdapterCache } from '../adapter-parser.js'
import {
  configureAdapterRuntimeReload,
  resetAdapterRuntimeReloadForTest,
  scheduleAdapterRuntimeReload,
  waitForAdapterRuntimeReload,
} from '../adapter-runtime-reload.js'

describe('adapter runtime reload', () => {
  beforeEach(() => {
    resetAdapterRuntimeReloadForTest()
    vi.mocked(clearAdapterCache).mockClear()
  })

  it('clears discovery cache and installs a newly generated site Skill', async () => {
    const installer = vi.fn(async () => undefined)
    configureAdapterRuntimeReload(installer)

    await scheduleAdapterRuntimeReload('todo.example.com')
    await waitForAdapterRuntimeReload()

    expect(installer).toHaveBeenCalledWith('todo.example.com')
    expect(clearAdapterCache).toHaveBeenCalledTimes(2)
  })

  it('serializes repeated scaffold reloads', async () => {
    let releaseFirst: (() => void) | undefined
    let markFirstStarted: (() => void) | undefined
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve })
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve })
    const calls: string[] = []
    configureAdapterRuntimeReload(async (siteKey) => {
      calls.push(siteKey)
      if (siteKey === 'first.example.com') {
        markFirstStarted?.()
        await firstPending
      }
    })

    const first = scheduleAdapterRuntimeReload('first.example.com')
    const second = scheduleAdapterRuntimeReload('second.example.com')
    await firstStarted
    expect(calls).toEqual(['first.example.com'])

    releaseFirst?.()
    await Promise.all([first, second])
    expect(calls).toEqual(['first.example.com', 'second.example.com'])
  })

  it('rejects unsafe adapter ids', async () => {
    configureAdapterRuntimeReload(async () => undefined)
    await expect(scheduleAdapterRuntimeReload('../bad')).rejects.toThrow('Invalid adapter id')
  })

  it('does not poison later chat waits when installation fails', async () => {
    configureAdapterRuntimeReload(async () => {
      throw new Error('install failed')
    })

    await expect(scheduleAdapterRuntimeReload('broken.example.com')).rejects.toThrow('install failed')
    await expect(waitForAdapterRuntimeReload()).resolves.toBeUndefined()
  })
})
