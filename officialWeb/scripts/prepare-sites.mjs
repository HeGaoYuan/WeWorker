import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const officialWebRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function assertGroup(group, field) {
  if (!group || typeof group !== 'object' || typeof group.name !== 'string' || !Array.isArray(group.sites)) {
    throw new Error(`${field} must contain groups with a name and sites array`)
  }
  for (const site of group.sites) {
    if (!site || typeof site !== 'object' || typeof site.id !== 'string' || typeof site.name !== 'string') {
      throw new Error(`${field} contains a site without string id/name`)
    }
  }
}

export function mergeSiteCatalog(base, overlay = {}) {
  if (!base || typeof base !== 'object' || !Array.isArray(base.groups)) {
    throw new Error('base site catalog must contain a groups array')
  }
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
    throw new Error('site overlay must be an object')
  }

  const prependGroups = overlay.prependGroups ?? []
  const appendGroups = overlay.appendGroups ?? []
  if (!Array.isArray(prependGroups) || !Array.isArray(appendGroups)) {
    throw new Error('prependGroups and appendGroups must be arrays')
  }
  base.groups.forEach((group, index) => assertGroup(group, `base.groups[${index}]`))
  prependGroups.forEach((group, index) => assertGroup(group, `prependGroups[${index}]`))
  appendGroups.forEach((group, index) => assertGroup(group, `appendGroups[${index}]`))

  const groups = [...prependGroups, ...base.groups, ...appendGroups]
  const groupNames = new Set()
  const siteIds = new Set()
  for (const group of groups) {
    if (groupNames.has(group.name)) throw new Error(`duplicate site group: ${group.name}`)
    groupNames.add(group.name)
    for (const site of group.sites) {
      if (siteIds.has(site.id)) throw new Error(`duplicate site id: ${site.id}`)
      siteIds.add(site.id)
    }
  }

  return {
    ...base,
    updated_at: overlay.updated_at ?? base.updated_at,
    groups,
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (error) {
    throw new Error(`failed to read ${label} at ${filePath}: ${error.message}`)
  }
}

export function prepareSites({
  basePath = path.resolve(officialWebRoot, 'src/lib/sites.json'),
  outputPath = path.resolve(officialWebRoot, 'src/lib/sites.generated.json'),
  overlayPath = process.env.WEWORKER_SITES_OVERLAY || '',
} = {}) {
  const base = readJson(basePath, 'site catalog')
  const overlay = overlayPath ? readJson(path.resolve(overlayPath), 'site overlay') : {}
  const merged = mergeSiteCatalog(base, overlay)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8')
  return {
    outputPath,
    groupCount: merged.groups.length,
    siteCount: merged.groups.reduce((total, group) => total + group.sites.length, 0),
    overlay: overlayPath ? path.resolve(overlayPath) : null,
  }
}

const scriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const result = prepareSites()
    console.log(
      `[prepare-sites] Generated ${result.groupCount} groups / ${result.siteCount} sites` +
      (result.overlay ? ` with overlay ${result.overlay}` : '') +
      `.`,
    )
  } catch (error) {
    console.error(`[prepare-sites] ERROR: ${error.message}`)
    process.exit(1)
  }
}
