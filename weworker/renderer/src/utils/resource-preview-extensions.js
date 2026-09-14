export const DEFAULT_RESOURCE_PREVIEW_EXTENSIONS = [
  '.adoc', '.bash', '.bat', '.c', '.cc', '.cfg', '.cmake', '.clj', '.cljs', '.cmd',
  '.conf', '.cpp', '.cs', '.css', '.csv', '.cxx', '.dart', '.env', '.erl', '.ex',
  '.exs', '.fish', '.fs', '.fsx', '.go', '.gradle', '.graphql', '.gql', '.h', '.hpp',
  '.hs', '.htm', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.kt', '.kts',
  '.less', '.log', '.lua', '.m', '.make', '.md', '.mdx', '.mjs', '.mk', '.mm',
  '.ndjson', '.php', '.pl', '.pm', '.properties', '.proto', '.ps1', '.py', '.r',
  '.rb', '.rs', '.rst', '.sass', '.scala', '.scss', '.sh', '.sql', '.svg', '.svelte',
  '.swift', '.tex', '.toml', '.ts', '.tsv', '.tsx', '.txt', '.vb', '.vue', '.xml',
  '.yaml', '.yml', '.zsh',
]

export function getEffectivePreviewExtensions(stored) {
  if (stored === null || stored === undefined) {
    return [...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS]
  }
  return normalizePreviewExtensions(stored)
}

export function normalizePreviewExtension(raw) {
  const trimmed = String(raw || '').trim().toLowerCase()
  if (!trimmed) return null
  const withDot = trimmed.startsWith('.') ? trimmed : `.${trimmed}`
  if (withDot.length < 2 || withDot.includes('/') || withDot.includes('\\') || withDot.includes(' ')) {
    return null
  }
  return withDot
}

export function normalizePreviewExtensions(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const normalized = normalizePreviewExtension(String(item))
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      out.push(normalized)
    }
  }
  return out
}

export function buildPreviewExtensionSet(extensions) {
  return new Set(normalizePreviewExtensions(extensions))
}

export function isReadableResourceName(name, previewExtensions) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  const ext = name.slice(dot).toLowerCase()
  const set = previewExtensions instanceof Set
    ? previewExtensions
    : buildPreviewExtensionSet(previewExtensions)
  return set.has(ext)
}

export function enrichResourcesForPreview(resources, previewExtensions) {
  if (!Array.isArray(resources)) return []
  return resources.map((resource) => {
    if (!resource || resource.is_directory) return resource
    if (resource.readable === true && typeof resource.content === 'string') return resource
    if (!isReadableResourceName(resource.name, previewExtensions)) return resource
    return { ...resource, readable: true }
  })
}
