function sanitizeSkillPathSegment(value) {
  return (value || 'custom')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+$/, '_')
    .trim() || 'custom'
}

export function deriveWeworkerRoot(userDirectory) {
  if (!userDirectory) return ''
  const normalized = String(userDirectory).replace(/\\/g, '/').replace(/\/+$/, '')
  const marker = '/.weworker'
  const idx = normalized.toLowerCase().lastIndexOf(marker)
  if (idx < 0) return ''
  return normalized.slice(0, idx + marker.length)
}

export function buildPublicSkillDirectory(skillId, userDirectory) {
  const root = deriveWeworkerRoot(userDirectory)
  if (!root || !skillId) return ''
  return `${root}/claude-config/skills/${sanitizeSkillPathSegment(skillId)}`
}

export function buildCustomSkillDirectory(siteId, skillId, userDirectory, skillName = '') {
  const root = deriveWeworkerRoot(userDirectory)
  if (!root || !siteId || !skillId) return ''
  const folderName = `webcli-${sanitizeSkillPathSegment(skillName || skillId)}`
  return `${root}/claude-config/skills/${folderName}`
}

export function resolveSkillDirectoryPath({ source, skillId, siteId, userDirectory, skillName }) {
  if (source === 'public-custom') {
    return buildPublicSkillDirectory(skillId, userDirectory)
  }
  if (source === 'custom') {
    return buildCustomSkillDirectory(siteId, skillId, userDirectory, skillName)
  }
  return ''
}
