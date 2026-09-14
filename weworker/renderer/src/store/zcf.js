import { create } from 'zustand'
import { backendFetch } from '../api/http.js'

const API = 'http://127.0.0.1:8765'

const LEGACY_WORKFLOW_MODES = new Set(['sixStep', 'feat', 'git', 'init-project'])

export function normalizeZcfModeId(modeId) {
  if (!modeId || modeId === 'direct') return 'direct'
  if (modeId === 'auto-plan') return 'auto-plan'
  if (LEGACY_WORKFLOW_MODES.has(modeId)) return 'auto-plan'
  return 'direct'
}

export const useZcfStore = create((set, get) => ({
  roles: [],
  coreStyles: [],
  extensionStyles: [],
  builtinRoles: [],
  customRoles: [],
  enabledRoleIds: [],
  modes: [],
  packageVersion: '',
  syncMeta: null,
  lang: 'zh-CN',
  loaded: false,
  syncing: false,

  loadCatalog: async () => {
    try {
      const res = await backendFetch(`${API}/zcf/catalog`)
      if (!res.ok) throw new Error('failed to load zcf catalog')
      const data = await res.json()
      set({
        roles: data.roles ?? [],
        coreStyles: data.core_styles ?? [],
        extensionStyles: data.extension_styles ?? [],
        builtinRoles: data.builtin_roles ?? [],
        customRoles: data.custom_roles ?? [],
        enabledRoleIds: data.enabled_role_ids ?? [],
        modes: data.modes ?? [],
        packageVersion: data.package_version ?? '',
        syncMeta: data.sync ?? null,
        lang: data.lang ?? 'zh-CN',
        loaded: true,
      })
    } catch (e) {
      console.error('[zcf] loadCatalog failed:', e)
    }
  },

  syncTemplates: async (lang) => {
    set({ syncing: true })
    try {
      const res = await backendFetch(`${API}/zcf/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: lang ?? get().lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'sync failed')
      set({
        roles: data.roles ?? get().roles,
        coreStyles: data.roles?.filter((role) => role.core) ?? get().coreStyles,
        extensionStyles: data.roles?.filter((role) => role.extension) ?? get().extensionStyles,
        builtinRoles: data.roles ?? get().builtinRoles,
        modes: data.modes ?? get().modes,
        packageVersion: data.package_version ?? data.version ?? get().packageVersion,
        syncMeta: data,
        lang: data.lang ?? lang ?? get().lang,
        loaded: true,
      })
      return data
    } catch (e) {
      throw e
    } finally {
      set({ syncing: false })
    }
  },

  roleLabel: (roleId) => {
    const allRoles = [...get().builtinRoles, ...get().customRoles, ...get().roles]
    const role = allRoles.find((item) => item.id === roleId)
    return role?.label || roleId || '风格'
  },

  resolvePickerRole: (roleId, fallback = 'default') => {
    const pickerIds = new Set(get().roles.map((item) => item.id))
    if (roleId && pickerIds.has(roleId)) return roleId
    if (pickerIds.has(fallback)) return fallback
    return get().roles[0]?.id || fallback
  },

  modeLabel: (modeId) => {
    const normalized = normalizeZcfModeId(modeId)
    const mode = get().modes.find((item) => item.id === normalized)
    return mode?.label || normalized || '模式'
  },
}))
