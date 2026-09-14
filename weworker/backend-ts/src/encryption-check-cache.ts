/**
 * Work-scoped cache for check_file_encryption results.
 *
 * Keyed by (workId, absolute path, mtimeMs) so that:
 *  - `decrypt_file` rewriting a file changes its mtime → instant cache miss → re-check.
 *  - results expire after ENCRYPTION_CHECK_CACHE_TTL_MS (bounded staleness, 30 min).
 * A size cap prevents unbounded growth on long-running servers.
 */

export interface EncryptionCheckResult {
  text: string
  cached: boolean
}

const ENCRYPTION_CHECK_CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const ENCRYPTION_CHECK_CACHE_MAX = 256

const _cache = new Map<string, { text: string; expiresAt: number }>()

function buildKey(workId: string | null, filePath: string, mtimeMs: number): string {
  return `${workId ?? 'global'}|${filePath}|${mtimeMs}`
}

/**
 * Run a (possibly cached) encryption check. `runCheck` spawns sd_decrypt.exe on
 * a cache miss; on a hit it is never called.
 */
export async function checkFileEncryptionCached(
  workId: string | null,
  filePath: string,
  mtimeMs: number,
  runCheck: () => Promise<string>,
): Promise<EncryptionCheckResult> {
  const key = buildKey(workId, filePath, mtimeMs)
  const hit = _cache.get(key)
  if (hit !== undefined && Date.now() < hit.expiresAt) {
    return { text: hit.text, cached: true }
  }
  const text = await runCheck()
  if (_cache.size >= ENCRYPTION_CHECK_CACHE_MAX) _cache.clear()
  _cache.set(key, { text, expiresAt: Date.now() + ENCRYPTION_CHECK_CACHE_TTL_MS })
  return { text, cached: false }
}

export function clearEncryptionCheckCache(): void {
  _cache.clear()
}
