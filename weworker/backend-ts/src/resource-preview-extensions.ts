/**
 * Default file suffixes that trigger automatic text preview for skill resources.
 *
 * Persistence behavior:
 * - `resource_preview_extensions: null` in settings → use this default list.
 * - Non-null array in settings → replaces defaults entirely (user's complete list).
 * - Force-preview (eye icon) still works for files outside the list.
 */
export const DEFAULT_RESOURCE_PREVIEW_EXTENSIONS = [
  '.adoc',
  '.bash',
  '.bat',
  '.c',
  '.cc',
  '.cfg',
  '.cmake',
  '.clj',
  '.cljs',
  '.cmd',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.cxx',
  '.dart',
  '.env',
  '.erl',
  '.ex',
  '.exs',
  '.fish',
  '.fs',
  '.fsx',
  '.go',
  '.gradle',
  '.graphql',
  '.gql',
  '.h',
  '.hpp',
  '.hs',
  '.htm',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.kts',
  '.less',
  '.log',
  '.lua',
  '.m',
  '.make',
  '.md',
  '.mdx',
  '.mjs',
  '.mk',
  '.mm',
  '.ndjson',
  '.php',
  '.pl',
  '.pm',
  '.properties',
  '.proto',
  '.ps1',
  '.py',
  '.r',
  '.rb',
  '.rs',
  '.rst',
  '.sass',
  '.scala',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.svelte',
  '.swift',
  '.tex',
  '.toml',
  '.ts',
  '.tsv',
  '.tsx',
  '.txt',
  '.vb',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
] as const

export function normalizePreviewExtension(raw: string): string | null {
  const trimmed = String(raw || '').trim().toLowerCase()
  if (!trimmed) return null
  const withDot = trimmed.startsWith('.') ? trimmed : `.${trimmed}`
  if (withDot.length < 2 || withDot.includes('/') || withDot.includes('\\') || withDot.includes(' ')) {
    return null
  }
  return withDot
}

export function normalizePreviewExtensions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const normalized = normalizePreviewExtension(String(item))
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      out.push(normalized)
    }
  }
  return out
}

export function getEffectivePreviewExtensions(stored: string[] | null | undefined): string[] {
  if (stored === null || stored === undefined) {
    return [...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS]
  }
  return normalizePreviewExtensions(stored)
}

export function getPreviewExtensionSet(stored: string[] | null | undefined): Set<string> {
  return new Set(getEffectivePreviewExtensions(stored))
}

export function isPreviewableExtension(ext: string, stored: string[] | null | undefined): boolean {
  const normalized = normalizePreviewExtension(ext)
  if (!normalized) return false
  return getPreviewExtensionSet(stored).has(normalized)
}
