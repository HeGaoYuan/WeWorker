export function localFileUrl(path) {
  if (!path) return ''
  return `weworker-file://local/?path=${encodeURIComponent(String(path))}`
}
