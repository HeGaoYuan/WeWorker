import path from 'node:path'
import os from 'node:os'

export const DEFAULT_DOWNLOAD_SUBDIRECTORY = 'download'

function expandHomePath(input: string): string {
  if (!input) return ''
  if (input === '~') return os.homedir()
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(os.homedir(), input.slice(2))
  }
  return input
}

function sanitizeRelativeSubpath(input: string): string {
  const normalized = path.normalize(input.replace(/\\/g, '/'))
  const parts = normalized.split(/[/\\]/).filter(Boolean)
  if (parts.some((part) => part === '..')) {
    throw new Error('download subdirectory cannot contain ..')
  }
  const joined = parts.join(path.sep)
  if (!joined || joined === '.') {
    throw new Error('download subdirectory is required')
  }
  return joined
}

export function normalizeDownloadSubdirectory(raw: string | undefined, userRoot: string): string {
  const fallback = DEFAULT_DOWNLOAD_SUBDIRECTORY
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return fallback

  const root = path.resolve(userRoot)
  const looksAbsolute = trimmed.includes(':') || trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.startsWith('~')
  if (looksAbsolute) {
    const resolved = path.resolve(expandHomePath(trimmed))
    const relative = path.relative(root, resolved)
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return sanitizeRelativeSubpath(relative)
    }
    return fallback
  }

  return sanitizeRelativeSubpath(trimmed)
}

export function resolveDownloadDirectory(userRoot: string, rawSubdirectory: string | undefined): string {
  const subpath = normalizeDownloadSubdirectory(rawSubdirectory, userRoot)
  return path.join(path.resolve(userRoot), subpath)
}
