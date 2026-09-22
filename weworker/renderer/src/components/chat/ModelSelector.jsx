import React, { useEffect, useRef, useState } from 'react'
import { PROVIDERS, useSettingsStore } from '../../store/settings.js'
import { isBuiltinProvider } from '../../store/settings.js'
import { fetchProviderModels } from '../../api/provider-models.js'
import { buildModelOptions, buildSettingsProviderLists } from '../../utils/model-selection.js'
import AppDropdownSelect from '../common/AppDropdownSelect.jsx'
import './model-selector.css'

export default function ModelSelector({ disabled, onPendingChange }) {
  const activeProvider = useSettingsStore(state => state.activeProvider)
  const model = useSettingsStore(state => state.model)
  const providers = useSettingsStore(state => state.providers)
  const loaded = useSettingsStore(state => state.loaded)
  const activateProvider = useSettingsStore(state => state.activateProvider)
  const saveProvider = useSettingsStore(state => state.saveProvider)
  const [catalog, setCatalog] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const pendingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setCatalog(null)
    if (!loaded || isBuiltinProvider(activeProvider)) return () => controller.abort()
    fetchProviderModels({ provider: activeProvider }, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setCatalog({ ...data, provider: activeProvider })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [activeProvider, providers, loaded])

  const changeSelection = async (value, kind) => {
    if (disabled || !loaded || pendingRef.current) return
    if (kind === 'provider' && !isBuiltinProvider(value) && !providers[value]?.has_key) return
    if (kind === 'model' && isBuiltinProvider(activeProvider)) return
    if (value === (kind === 'provider' ? activeProvider : model)) return
    pendingRef.current = true
    setPending(true)
    onPendingChange(true)
    setError('')
    try {
      if (kind === 'provider') await activateProvider(value)
      else await saveProvider(activeProvider, { model: value })
    } catch (failure) {
      setError(failure.message || '模型切换失败')
    } finally {
      pendingRef.current = false
      setPending(false)
      onPendingChange(false)
    }
  }

  const configuredProviders = buildSettingsProviderLists(PROVIDERS, providers).visible
  const visibleProviders = configuredProviders.filter(
    item => isBuiltinProvider(item.id) || providers[item.id]?.has_key,
  )
  if (
    activeProvider
    && !visibleProviders.some(item => item.id === activeProvider)
  ) {
    const fallback = configuredProviders.find(item => item.id === activeProvider)
    visibleProviders.unshift({ id: activeProvider, name: fallback?.name || activeProvider })
  }
  const providerOptions = visibleProviders.map(item => ({
    value: item.id,
    label: item.providerId ? `${item.name} · ${providers[item.id]?.model || '未配置'}` : item.name,
  }))

  const provider = configuredProviders.find(item => item.id === activeProvider)
  const modelSource = catalog?.provider === activeProvider
    ? catalog.models
    : provider?.models
  const modelOptions = buildModelOptions(modelSource, model, { annotateCurrent: false })
  const unavailable = disabled || pending || !loaded
  const errorTitle = error ? `模型切换失败：${error}` : undefined

  return (
    <div className="chat-model-selector" aria-busy={pending} title={errorTitle}>
      <AppDropdownSelect
        className="chat-model-selector__provider"
        menuClassName="app-dropdown-menu chat-model-selector-menu"
        value={activeProvider}
        options={providerOptions}
        onChange={value => changeSelection(value, 'provider')}
        disabled={unavailable}
        ariaLabel="模型供应商选择"
        placement="top"
        minMenuWidth={150}
      />
      <AppDropdownSelect
        className="chat-model-selector__model"
        menuClassName="app-dropdown-menu chat-model-selector-menu"
        value={model || ''}
        options={modelOptions}
        onChange={value => changeSelection(value, 'model')}
        disabled={unavailable || isBuiltinProvider(activeProvider)}
        ariaLabel="模型选择"
        placement="top"
        minMenuWidth={170}
      />
    </div>
  )
}
