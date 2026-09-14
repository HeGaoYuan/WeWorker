import { parseSkillMarkdownMeta } from './skill-markdown-meta.js'

export function resolveRequestedCustomSkillName(skill) {
  const meta = parseSkillMarkdownMeta(skill?.markdown || '')
  return (meta.name || skill?.name || '').trim()
}

export function findDuplicateCustomSkillName(skills) {
  const seen = new Map()
  for (const skill of skills || []) {
    const name = resolveRequestedCustomSkillName(skill)
    if (!name) continue
    const key = name.toLowerCase()
    const previousId = seen.get(key)
    if (previousId && previousId !== skill.id) return name
    seen.set(key, skill.id)
  }
  return ''
}

export function findDuplicateCustomSkillNameForSkill(skills, skillId) {
  const target = (skills || []).find((skill) => skill?.id === skillId || skill?.name === skillId)
  const targetName = resolveRequestedCustomSkillName(target)
  if (!targetName) return ''

  const targetKey = targetName.toLowerCase()
  const duplicate = (skills || []).find((skill) => (
    skill !== target && resolveRequestedCustomSkillName(skill).toLowerCase() === targetKey
  ))
  return duplicate ? targetName : ''
}
