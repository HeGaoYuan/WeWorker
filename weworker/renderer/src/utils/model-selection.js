export function buildModelOptions(models, currentModel, { annotateCurrent = true } = {}) {
  const values = [...new Set((Array.isArray(models) ? models : [])
    .map((model) => String(model || '').trim())
    .filter(Boolean))]
  const current = String(currentModel || '').trim()
  return [
    ...(current && !values.includes(current)
      ? [{ value: current, label: annotateCurrent ? `${current}（当前配置）` : current, currentOnly: true }]
      : []),
    ...values.map((value) => ({ value, label: value, currentOnly: false })),
  ]
}

export function isModelRefreshFailed(catalog) {
  return Boolean(catalog && (
    catalog.source !== 'remote'
    || !Array.isArray(catalog.models)
    || catalog.models.length === 0
  ))
}

export function shouldShowModelRefreshFailure(catalog) {
  return Boolean(catalog?.explicitRefresh && isModelRefreshFailed(catalog))
}

export function getVisibleModelRefreshDetail(catalog) {
  if (!catalog?.explicitRefresh) return ''
  if (catalog.warning) return String(catalog.warning)
  if (catalog.source === 'remote' && Array.isArray(catalog.models) && catalog.models.length === 0) {
    return '远程接口返回空模型列表'
  }
  return ''
}

export function buildProbeResultRows(results) {
  const seen = new Map()
  return (Array.isArray(results) ? results : []).map((result) => {
    const protocol = result?.protocol
    const occurrence = seen.get(protocol) || 0
    seen.set(protocol, occurrence + 1)
    const protocolName = protocol === 'anthropic_messages' ? 'Anthropic' : protocol === 'openai_chat_completions' ? 'OpenAI' : '模型'
    return { ...result, label: occurrence > 0 ? `${protocolName} 结构化输出接口` : `${protocolName} 接口` }
  })
}

export function buildProviderProbeTargets(providerId, openAiBaseUrl) {
  if (providerId === 'custom' && !String(openAiBaseUrl || '').trim()) return ['weworker']
  return ['weworker', 'webwright']
}

export function isProviderVisibleInSettings(provider, stored) {
  if (provider?.builtin) return true
  if (provider?.id === 'builtin' || provider?.id === 'builtin_dev') return true
  if (!stored) return false
  return Boolean(
    stored.visible
    || stored.added
    || stored.has_key
    || String(stored.base_url || '').trim()
    || String(stored.openai_base_url || '').trim(),
  )
}

export function buildSettingsProviderLists(providerList, providers) {
  const allProviders = Array.isArray(providerList) ? providerList : []
  const storedProviders = providers || {}
  const visible = allProviders.filter((provider) => isProviderVisibleInSettings(provider, storedProviders[provider.id]))
  for (const [id, configuration] of Object.entries(storedProviders)) {
    const template = allProviders.find(provider => provider.id === configuration.provider_id)
    if (!template || allProviders.some(provider => provider.id === id)) continue
    visible.push({ ...template, id, providerId: template.id })
  }
  const addable = allProviders.filter((provider) => (
    provider.id !== 'builtin'
    && provider.id !== 'builtin_dev'
  ))
  return { visible, addable }
}
