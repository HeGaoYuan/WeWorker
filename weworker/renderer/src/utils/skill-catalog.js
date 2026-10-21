import { matchesSkillSearch } from './skill-tags.js'

const nameCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

export function skillSelectionKey(skill) {
  // Public folder names can change; site Skills already have stable IDs.
  if (skill.source?.startsWith('public-') && skill.creationOrderKey) {
    return `${skill.source}:directory:${skill.creationOrderKey}`
  }
  return `${skill.source}:${skill.siteId || ''}:${skill.id || skill.name}`
}

export function findSelectedSkill(skills, key) {
  return skills.find(skill => skillSelectionKey(skill) === key)
    || skills.find(skill => `${skill.source}:${skill.siteId || ''}:${skill.id || skill.name}` === key)
    || null
}

function creationTime(skill) {
  return Number.isFinite(skill.createdAt) && skill.createdAt > 0 ? skill.createdAt : 0
}

export function formatSkillCreatedAt(skill) {
  const timestamp = creationTime(skill)
  const date = new Date(timestamp)
  if (!timestamp || !Number.isFinite(date.getTime())) return ''
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function stableKey(skill) {
  return skill.creationOrderKey || `${skill.source}:${skill.siteId || ''}:${skill.id || skill.directoryName || ''}`
}

export function selectCatalogSkills(skills, { filter = 'all', sort = 'created', query = '', getTags = () => [] } = {}) {
  return skills.filter(skill => (
    (filter !== 'custom' || skill.source === 'custom' || skill.source === 'public-custom')
    && matchesSkillSearch(skill, query, getTags(skill))
  )).sort((a, b) => {
    if (sort === 'name') {
      const byName = nameCollator.compare(a.name || '', b.name || '')
      if (byName) return byName
    }
    return creationTime(b) - creationTime(a) || nameCollator.compare(stableKey(a), stableKey(b))
  })
}
