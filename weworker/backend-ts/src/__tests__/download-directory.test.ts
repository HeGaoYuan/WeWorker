import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOWNLOAD_SUBDIRECTORY,
  normalizeDownloadSubdirectory,
  resolveDownloadDirectory,
} from '../download-directory.js'

describe('download-directory', () => {
  const userRoot = path.join(os.tmpdir(), 'weworker-user-root')

  it('defaults empty values to download', () => {
    expect(normalizeDownloadSubdirectory('', userRoot)).toBe(DEFAULT_DOWNLOAD_SUBDIRECTORY)
    expect(normalizeDownloadSubdirectory(undefined, userRoot)).toBe(DEFAULT_DOWNLOAD_SUBDIRECTORY)
  })

  it('accepts relative subdirectories under the user directory', () => {
    expect(normalizeDownloadSubdirectory('download', userRoot)).toBe('download')
    expect(normalizeDownloadSubdirectory('work/inbox', userRoot)).toBe(path.join('work', 'inbox'))
  })

  it('rejects path traversal in subdirectories', () => {
    expect(() => normalizeDownloadSubdirectory('../outside', userRoot)).toThrow(/cannot contain/)
  })

  it('maps absolute paths inside the user directory to relative subpaths', () => {
    const inside = path.join(userRoot, 'archive')
    expect(normalizeDownloadSubdirectory(inside, userRoot)).toBe('archive')
  })

  it('falls back to download for paths outside the user directory', () => {
    const outside = path.join(os.tmpdir(), 'outside-downloads')
    expect(normalizeDownloadSubdirectory(outside, userRoot)).toBe(DEFAULT_DOWNLOAD_SUBDIRECTORY)
  })

  it('resolves the full download directory under the user directory', () => {
    expect(resolveDownloadDirectory(userRoot, 'download')).toBe(path.join(userRoot, 'download'))
  })
})
