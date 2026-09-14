export function filterCandidates(candidates, query) {
  const normalizedQuery = String(query || '').toLowerCase()
  if (!normalizedQuery) return candidates
  return candidates.filter((item) => (
    String(item.name || '').toLowerCase().startsWith(normalizedQuery)
    || String(item.value || '').toLowerCase().startsWith(normalizedQuery)
    || String(item.description || '').toLowerCase().includes(normalizedQuery)
  ))
}

export function option(name, description, value = `${name} `) {
  return { name, value, kind: 'option', description }
}

export function subcommand(name, description, value = `${name} `) {
  return { name, value, kind: 'subcommand', description }
}

export function commandCandidate(name, description) {
  return { name, value: `${name} `, isDirectory: false, kind: 'cmd', description }
}
