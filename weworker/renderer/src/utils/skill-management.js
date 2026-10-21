export function skillDirectoryName(tool) {
  if (tool.directoryName) return tool.directoryName
  if (tool.source === 'custom') return `webcli-${tool.name}`
  return tool.id || tool.name
}

export function withInstalledSkillState(tool, installed) {
  const directoryName = skillDirectoryName(tool)
  const entry = installed.find(item => item.name === directoryName)
  return {
    ...tool, directoryName, enabled: entry?.enabled === true, draft: entry?.draft === true, installed: !!entry,
    createdAt: entry?.createdAt ?? tool.createdAt,
    creationOrderKey: entry?.creationOrderKey ?? tool.creationOrderKey,
  }
}

export function publicSkillEntries(entries, siteSkills) {
  const siteNames = new Set(siteSkills.map(skillDirectoryName))
  return entries.filter(entry => !siteNames.has(entry.name))
}
