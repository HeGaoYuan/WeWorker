import { create } from 'zustand'
import {
  DEFAULT_RESOURCE_PREVIEW_EXTENSIONS,
  getEffectivePreviewExtensions,
} from '../utils/resource-preview-extensions.js'
import { backendFetch } from '../api/http.js'

const API = 'http://127.0.0.1:8765'

// Provider UI styling (keyed by id)
const PROVIDER_STYLES = {
  anthropic: { subtitle: 'Claude 系列', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
  glm: { subtitle: '智谱 AI', color: '#339CFF', bg: 'rgba(51,156,255,0.12)' },
  deepseek: { subtitle: '深度求索', color: '#06B6D4', bg: 'rgba(6,182,212,0.12)' },
  custom: { subtitle: 'LiteLLM / 代理', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
}

const DEFAULT_STYLE = { subtitle: '', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' }
const DEFAULT_WELCOME_FEATURED_SITE_LIMIT = 50
const DEFAULT_PASTE_TEXT_ATTACHMENT_THRESHOLD = 20000

function settingsPatch(data, fallback = {}) {
  const hasPreviewApi = Object.prototype.hasOwnProperty.call(data, 'resource_preview_extensions')
  const defaultResourcePreviewExtensions = data.default_resource_preview_extensions?.length
    ? data.default_resource_preview_extensions
    : (fallback.defaultResourcePreviewExtensions?.length
        ? fallback.defaultResourcePreviewExtensions
        : [...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS])
  const resourcePreviewExtensions = hasPreviewApi
    ? getEffectivePreviewExtensions(data.resource_preview_extensions)
    : (fallback.resourcePreviewExtensions?.length
        ? fallback.resourcePreviewExtensions
        : [...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS])

  return {
    activeProvider: data.active_provider,
    baseUrl: data.base_url,
    model: data.model,
    contextLimit: data.context_limit || fallback.contextLimit || 1000000,
    hasApiKey: data.has_api_key,
    userDirectory: data.user_directory || fallback.userDirectory || '',
    downloadSubdirectory: data.download_subdirectory || fallback.downloadSubdirectory || 'download',
    downloadDirectory: data.download_directory || fallback.downloadDirectory || '',
    maxChatAttachments: data.max_chat_attachments || fallback.maxChatAttachments || 60,
    pasteTextAttachmentThreshold: data.paste_text_attachment_threshold || fallback.pasteTextAttachmentThreshold || DEFAULT_PASTE_TEXT_ATTACHMENT_THRESHOLD,
    welcomeFeaturedSiteLimit: data.welcome_featured_site_limit || fallback.welcomeFeaturedSiteLimit || DEFAULT_WELCOME_FEATURED_SITE_LIMIT,
    userDirectoryBlacklist: data.user_directory_blacklist ?? fallback.userDirectoryBlacklist ?? [],
    defaultOpenBrowserAllowedOrigins: data.default_open_browser_allowed_origins ?? fallback.defaultOpenBrowserAllowedOrigins ?? [],
    openBrowserAllowedOrigins: data.open_browser_allowed_origins ?? fallback.openBrowserAllowedOrigins ?? [],
    resourcePreviewExtensions,
    resourcePreviewExtensionsCustomized: hasPreviewApi
      ? (data.resource_preview_extensions_customized ?? false)
      : (fallback.resourcePreviewExtensionsCustomized ?? false),
    defaultResourcePreviewExtensions,
    providers: data.providers ?? {},
    zcfDefaultRole: data.zcf_default_role || fallback.zcfDefaultRole || 'weworker-clear',
    zcfDefaultMode: data.zcf_default_mode || fallback.zcfDefaultMode || 'auto-plan',
    zcfLang: data.zcf_lang || fallback.zcfLang || 'zh-CN',
    zcfEnabledRoles: data.zcf_enabled_roles ?? fallback.zcfEnabledRoles ?? ['weworker-clear'],
    zcfCustomRoles: data.zcf_custom_roles ?? fallback.zcfCustomRoles ?? [],
    zcfPackageVersion: data.zcf_package_version || fallback.zcfPackageVersion || '',
    zcfSync: data.zcf_sync ?? fallback.zcfSync ?? null,
  }
}

// Build PROVIDERS from injected constants (dev mode fallback when not defined)
const BUILD_PROVIDERS = typeof __BUILD_PROVIDERS__ !== 'undefined'
  ? __BUILD_PROVIDERS__
  : [
      { id: 'builtin', name: '内置模型', models: ['ark-code-latest'], defaultModel: 'ark-code-latest' },
      { id: 'builtin_dev', name: '内置模型（开发）', models: ['deepseek-v4-flash'], defaultModel: 'deepseek-v4-flash' },
      { id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'], defaultModel: 'claude-sonnet-4-6' },
      { id: 'glm', name: '智谱 coding plan', models: ['glm-5.2', 'glm-4.7'], defaultModel: 'glm-5.2' },
      { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro'], defaultModel: 'deepseek-v4-flash' },
      { id: 'custom', name: '自定义', models: [], defaultModel: '' },
    ]

const BUILD_DEFAULT_PROVIDER = typeof __BUILD_DEFAULT_PROVIDER__ !== 'undefined'
  ? __BUILD_DEFAULT_PROVIDER__
  : 'anthropic'

export const BUILTIN_PROVIDER_IDS = BUILD_PROVIDERS.filter(p => p.id === 'builtin' || p.id === 'builtin_dev').map(p => p.id)
export const isBuiltinProvider = (id) => BUILTIN_PROVIDER_IDS.includes(id)

export const PROVIDERS = BUILD_PROVIDERS.map(p => ({
  ...p,
  ...(PROVIDER_STYLES[p.id] || DEFAULT_STYLE),
}))

export const useSettingsStore = create((set, get) => ({
  activeProvider: BUILD_DEFAULT_PROVIDER,
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-6',
  contextLimit: 1000000,
  hasApiKey: false,
  userDirectory: '',
  downloadSubdirectory: 'download',
  downloadDirectory: '',
  maxChatAttachments: 60,
  pasteTextAttachmentThreshold: DEFAULT_PASTE_TEXT_ATTACHMENT_THRESHOLD,
  welcomeFeaturedSiteLimit: DEFAULT_WELCOME_FEATURED_SITE_LIMIT,
  resourcePreviewExtensions: [...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS],
  resourcePreviewExtensionsCustomized: false,
  defaultResourcePreviewExtensions: [...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS],
  userDirectoryBlacklist: [],
  defaultOpenBrowserAllowedOrigins: [],
  openBrowserAllowedOrigins: [],
  zcfDefaultRole: 'weworker-clear',
  zcfDefaultMode: 'auto-plan',
  zcfLang: 'zh-CN',
  zcfEnabledRoles: ['weworker-clear'],
  zcfCustomRoles: [],
  zcfPackageVersion: '',
  zcfSync: null,
  providers: {
    builtin:   { has_key: false, model: 'ark-code-latest', context_limit: 1000000, readonly: true, added: true, visible: true },
    builtin_dev: { has_key: false, model: 'deepseek-v4-flash', context_limit: 1000000, readonly: true, added: true, visible: true },
    anthropic: { has_key: false, model: 'claude-sonnet-4-6', context_limit: 1000000, added: true, visible: true },
    glm:       { has_key: false, model: 'glm-5.2', context_limit: 1000000, added: false, visible: false },
    deepseek:  { has_key: false, model: 'deepseek-v4-flash', context_limit: 1000000, added: false, visible: false },
    custom:    { has_key: false, model: '', context_limit: 1000000, base_url: '', openai_base_url: '', auth_type: 'auth_token', added: false, visible: false },
  },
  loaded: false,
  explorationModelRevision: 0,
  channels: { qq: { enabled: false, app_id: '', has_app_secret: false, owner_user_id: '' }, weixin: { enabled: false, has_token: false, base_url: '', owner_user_id: '' }, wecom: { enabled: false, bot_id: '', has_secret: false, owner_user_id: '' }, feishu: { enabled: false, app_id: '', has_app_secret: false, owner_user_id: '' } },

  load: async () => {
    try {
      const [res, chRes] = await Promise.all([
        backendFetch(`${API}/settings`),
        backendFetch(`${API}/settings/channels`),
      ])
      const data = await res.json()
      const chData = await chRes.json()
      set({ ...settingsPatch(data), loaded: true, channels: chData })
    } catch {}
  },

  // Save config for one provider (does not switch active)
  addProvider: async (provider) => {
    const res = await backendFetch(`${API}/settings/provider/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '添加模型失败')
    set(settingsPatch(data, get()))
    return data.created_provider
  },

  saveProvider: async (provider, updates) => {
    const res = await backendFetch(`${API}/settings/provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, ...updates }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
  },

  // Switch which provider is active
  activateProvider: async (provider) => {
    const res = await backendFetch(`${API}/settings/provider/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '切换失败')
    set(settingsPatch(data, get()))
  },

  saveUserDirectory: async (userDirectory) => {
    const res = await backendFetch(`${API}/settings/user-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_directory: userDirectory }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
    return data.user_directory || ''
  },

  saveDownloadDirectory: async (downloadSubdirectory) => {
    const res = await backendFetch(`${API}/settings/download-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ download_subdirectory: downloadSubdirectory }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
    return {
      downloadSubdirectory: data.download_subdirectory || downloadSubdirectory,
      downloadDirectory: data.download_directory || get().downloadDirectory,
    }
  },

  saveMaxChatAttachments: async (maxChatAttachments) => {
    const res = await backendFetch(`${API}/settings/chat-attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_chat_attachments: maxChatAttachments }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
    return data.max_chat_attachments || 60
  },

  savePasteTextAttachmentThreshold: async (pasteTextAttachmentThreshold) => {
    const res = await backendFetch(`${API}/settings/paste-text-attachment-threshold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paste_text_attachment_threshold: pasteTextAttachmentThreshold }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '淇濆瓨澶辫触')
    set(settingsPatch(data, get()))
    return data.paste_text_attachment_threshold || DEFAULT_PASTE_TEXT_ATTACHMENT_THRESHOLD
  },

  saveWelcomeFeaturedSiteLimit: async (welcomeFeaturedSiteLimit) => {
    const res = await backendFetch(`${API}/settings/welcome-featured-sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ welcome_featured_site_limit: welcomeFeaturedSiteLimit }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
    return data.welcome_featured_site_limit || DEFAULT_WELCOME_FEATURED_SITE_LIMIT
  },

  saveResourcePreviewExtensions: async (resourcePreviewExtensions) => {
    const res = await backendFetch(`${API}/settings/resource-preview-extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_preview_extensions: resourcePreviewExtensions }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
    return data.resource_preview_extensions || []
  },

  resetResourcePreviewExtensions: async () => {
    const res = await backendFetch(`${API}/settings/resource-preview-extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '恢复默认失败')
    set(settingsPatch(data, get()))
    return data.resource_preview_extensions || []
  },

  saveUserDirectoryBlacklist: async (userDirectoryBlacklist) => {
    const res = await backendFetch(`${API}/settings/user-directory-blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_directory_blacklist: userDirectoryBlacklist }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    const entries = data.user_directory_blacklist || userDirectoryBlacklist
    set({ userDirectoryBlacklist: entries })
    return { entries, dropped: Number(data.blacklist_dropped || 0) }
  },

  savePermissions: async ({ openBrowserAllowedOrigins }) => {
    const res = await backendFetch(`${API}/settings/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_browser_allowed_origins: openBrowserAllowedOrigins }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
    return data.open_browser_allowed_origins || []
  },

  saveChannels: async (updates) => {
    const res = await backendFetch(`${API}/settings/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set({ channels: data })
  },

  saveZcfDefaults: async ({ zcfDefaultRole, zcfDefaultMode, zcfLang }) => {
    const body = {}
    if (zcfDefaultRole !== undefined) body.zcf_default_role = zcfDefaultRole
    if (zcfDefaultMode !== undefined) body.zcf_default_mode = zcfDefaultMode
    if (zcfLang !== undefined) body.zcf_lang = zcfLang
    const res = await backendFetch(`${API}/settings/zcf-defaults`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
  },

  saveZcfRoles: async ({ zcfDefaultRole, zcfEnabledRoles, zcfCustomRoles }) => {
    const activeStyle = zcfDefaultRole || zcfEnabledRoles?.[0] || 'default'
    const body = {
      zcf_default_role: activeStyle,
      zcf_enabled_roles: [activeStyle],
    }
    if (zcfCustomRoles !== undefined) body.zcf_custom_roles = zcfCustomRoles
    const res = await backendFetch(`${API}/settings/zcf-roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    set(settingsPatch(data, get()))
  },
}))



export function detectProvider(baseUrl) {
  if (!baseUrl || baseUrl === 'https://api.anthropic.com') return 'anthropic'
  if (baseUrl.includes('bigmodel.cn')) return 'glm'
  if (baseUrl.includes('deepseek.com')) return 'deepseek'
  return 'custom'
}
