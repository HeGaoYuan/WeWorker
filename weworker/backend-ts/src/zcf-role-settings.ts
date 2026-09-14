export const DEFAULT_STYLE_ID = 'default'

export const CORE_STYLE_ID = 'weworker-clear'

export const DEFAULT_BUNDLED_EXTENSION_STYLE_ID = 'engineer-professional'

export interface ZcfCustomRole {
  id: string
  label: string
  prompt: string
}

export const DEFAULT_ZCF_ENABLED_ROLES = [CORE_STYLE_ID]

export const AUTO_PLAN_MODE_ID = 'auto-plan'

export const DEFAULT_ZCF_MODE = 'direct'

const LEGACY_WORKFLOW_MODE_IDS = new Set(['sixStep', 'feat', 'git', 'init-project'])

export function normalizeZcfMode(modeId: string | null | undefined): string {
  if (!modeId || modeId === DEFAULT_ZCF_MODE) return DEFAULT_ZCF_MODE
  if (modeId === AUTO_PLAN_MODE_ID) return AUTO_PLAN_MODE_ID
  if (LEGACY_WORKFLOW_MODE_IDS.has(modeId)) return AUTO_PLAN_MODE_ID
  return DEFAULT_ZCF_MODE
}

function slugifyRoleLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'style'
}

export function isCustomRoleId(roleId: string): boolean {
  return roleId.startsWith('custom-')
}

export function migrateLegacyDefaultRole(roleId: string | null | undefined): string {
  if (!roleId) return DEFAULT_STYLE_ID
  return roleId
}

export function normalizeZcfCustomRoles(roles: unknown): ZcfCustomRole[] {
  if (!Array.isArray(roles)) return []
  const seen = new Set<string>()
  const normalized: ZcfCustomRole[] = []
  for (const raw of roles) {
    if (!raw || typeof raw !== 'object') continue
    const label = String((raw as ZcfCustomRole).label ?? '').trim()
    const prompt = String((raw as ZcfCustomRole).prompt ?? '').trim()
    if (!label || !prompt) continue
    let id = String((raw as ZcfCustomRole).id ?? '').trim()
    if (!id) id = `custom-${slugifyRoleLabel(label)}`
    else if (!id.startsWith('custom-')) id = `custom-${id.replace(/^custom-/, '')}`
    let uniqueId = id
    let suffix = 2
    while (seen.has(uniqueId)) {
      uniqueId = `${id}-${suffix}`
      suffix++
    }
    seen.add(uniqueId)
    normalized.push({ id: uniqueId, label, prompt })
  }
  return normalized
}

/** Styles are mutually exclusive — persist exactly one active style id. */
export function normalizeZcfEnabledRoles(
  enabled: unknown,
  customRoles: ZcfCustomRole[],
  availableStyleIds: string[] = [DEFAULT_STYLE_ID, CORE_STYLE_ID, DEFAULT_BUNDLED_EXTENSION_STYLE_ID],
  defaultRole?: string,
): string[] {
  const customIds = new Set(customRoles.map((role) => role.id))
  const allowed = new Set([DEFAULT_STYLE_ID, CORE_STYLE_ID, ...availableStyleIds, ...customIds])
  let candidate = DEFAULT_STYLE_ID
  if (defaultRole && allowed.has(defaultRole)) candidate = defaultRole
  else if (Array.isArray(enabled) && enabled.length > 0) {
    const valid = enabled.filter((id): id is string => typeof id === 'string' && allowed.has(id))
    if (valid.length >= 1) candidate = valid[0]
  }

  if (!allowed.has(candidate)) candidate = DEFAULT_STYLE_ID
  return [candidate]
}

export function resolveEnabledRoleFallback(enabledRoles: string[]): string {
  return enabledRoles[0] || DEFAULT_STYLE_ID
}
