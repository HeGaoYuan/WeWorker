import AppSwitch from '../common/AppSwitch.jsx'
import React, { useState, useRef, useCallback, useEffect } from 'react'
import QRCode from 'qrcode'
import { useSettingsStore } from '../../store/settings.js'
import { normalizeOwnerUserId, validateOwnerUserId, getOwnerPermissionSelection, hasUnsavedOwnerPermission } from '../../utils/owner-user-id.js'
import { backendFetch } from '../../api/http.js'
import { AppstoreAddOutlined, MessageOutlined, QqOutlined, SendOutlined, WechatOutlined, WechatWorkOutlined } from '@ant-design/icons'
import { DropdownMenuPortal, useDropdownDismiss } from '../common/DropdownMenuPortal.jsx'
import { CHANNEL_TYPES, configuredChannelIds } from '../../utils/channel-configurations.js'
import WecomQrConnect from './WecomQrConnect.jsx'
import AppBotQrSetup from './AppBotQrSetup.jsx'
import AppDropdownSelect from '../common/AppDropdownSelect.jsx'
import { ChannelProbeButton, ChannelProbeChecklist, useChannelProbe } from './ChannelProbe.jsx'

const API = 'http://127.0.0.1:8765'

const OWNER_PERMISSION_OPTIONS = [
  { value: 'qa_only', label: '问答权限', hint: '仅知识问答，与访客相同' },
  { value: 'no_bash', label: '禁用原生命令', hint: '可使用标准 Skill 和文件工具，不能执行 Adapter 或其他 Bash／PowerShell 命令' },
  { value: 'full', label: '完全权限', hint: '包含 Bash 与全部 Agent 能力' },
]

export default function ChannelsTab() {
  const { channels, saveChannels, saveWecomQr, wecomQrPending, wecomQrSaving, appBotQrPending } = useSettingsStore()
  const [addedChannels, setAddedChannels] = useState([])
  const visibleChannels = CHANNEL_TYPES.filter(({ id }) => addedChannels.includes(id) || configuredChannelIds(channels).includes(id) || (id === 'wecom' && wecomQrPending) || appBotQrPending[id])
  const [selectedChannel, setSelectedChannel] = useState(() => configuredChannelIds(channels)[0] || '')
  const currentChannel = visibleChannels.find(({ id }) => id === selectedChannel) || visibleChannels[0]
  const [addOpen, setAddOpen] = useState(false)
  const addTriggerRef = useRef(null)
  const addMenuRef = useRef(null)
  useDropdownDismiss(addOpen, () => setAddOpen(false), addTriggerRef, addMenuRef)
  const addChannel = (id) => {
    setAddedChannels(current => current.includes(id) ? current : [...current, id])
    setSelectedChannel(id)
    setAddOpen(false)
    setSaveMessage(null)
    addTriggerRef.current?.focus()
  }
  const qq = channels?.qq ?? {}
  const weixin = channels?.weixin ?? {}

  const [form, setForm] = useState({
    enabled: qq.enabled ?? false,
    app_id: qq.app_id ?? '',
    app_secret: '',
    owner_user_id: qq.owner_user_id ?? '',
    owner_permission_level: getOwnerPermissionSelection(qq.owner_user_id, qq.owner_permission_level),
  })
  const [wxForm, setWxForm] = useState({
    enabled: weixin.enabled ?? false,
    token: '',
    base_url: weixin.base_url ?? '',
    owner_user_id: weixin.owner_user_id ?? '',
    owner_permission_level: getOwnerPermissionSelection(weixin.owner_user_id, weixin.owner_permission_level),
  })
  const wecom = channels?.wecom ?? {}
  const feishu = channels?.feishu ?? {}
  const [wecomForm, setWecomForm] = useState({
    enabled: wecom.enabled ?? false,
    bot_id: wecom.bot_id ?? '',
    secret: '',
    owner_user_id: wecom.owner_user_id ?? '',
    owner_permission_level: getOwnerPermissionSelection(wecom.owner_user_id, wecom.owner_permission_level),
  })
  const [feishuForm, setFeishuForm] = useState({
    enabled: feishu.enabled ?? false,
    app_id: feishu.app_id ?? '',
    app_secret: '',
    owner_user_id: feishu.owner_user_id ?? '',
    owner_permission_level: getOwnerPermissionSelection(feishu.owner_user_id, feishu.owner_permission_level),
  })
  const [saving, setSaving] = useState(false)
  const [appBotQrBusy, setAppBotQrBusy] = useState({})
  const changeAppBotQrBusy = useCallback((channel, busy) => setAppBotQrBusy(current => current[channel] === busy ? current : { ...current, [channel]: busy }), [])
  const appBotQrActive = Object.values(appBotQrBusy).some(Boolean) || Object.values(appBotQrPending).some(Boolean)
  const [wecomQrBusy, setWecomQrBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const [ownerIdErrors, setOwnerIdErrors] = useState({ qq: '', weixin: '', wecom: '', feishu: '' })

  // WeChat QR login state
  const [qrData, setQrData] = useState(null) // raw URL content to encode as QR
  const [qrStatus, setQrStatus] = useState('') // '' | 'loading' | 'waiting' | 'scaned' | 'confirmed' | 'expired' | 'error'
  const [qrMsg, setQrMsg] = useState('')
  const wxQrBusy = ['loading', 'waiting', 'scaned'].includes(qrStatus)
  const channelProbe = useChannelProbe({ qq: form, feishu: feishuForm, wecom: wecomForm, weixin: wxForm }, channels)
  const probeState = channelProbe.get(currentChannel?.id)
  const pollRef = useRef(null)
  const canvasRef = useRef(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])
  useEffect(() => stopPolling, [stopPolling])

  useEffect(() => {
    setForm((current) => ({
      ...current,
      enabled: qq.enabled ?? false,
      app_id: qq.app_id ?? '',
      owner_user_id: qq.owner_user_id ?? '',
      owner_permission_level: getOwnerPermissionSelection(qq.owner_user_id, qq.owner_permission_level),
    }))
    setWxForm((current) => ({
      ...current,
      enabled: weixin.enabled ?? false,
      base_url: weixin.base_url ?? '',
      owner_user_id: weixin.owner_user_id ?? '',
      owner_permission_level: getOwnerPermissionSelection(weixin.owner_user_id, weixin.owner_permission_level),
    }))
    setWecomForm((current) => ({
      ...current,
      enabled: wecom.enabled ?? false,
      bot_id: wecom.bot_id ?? '',
      owner_user_id: wecom.owner_user_id ?? '',
      owner_permission_level: getOwnerPermissionSelection(wecom.owner_user_id, wecom.owner_permission_level),
    }))
    setFeishuForm((current) => ({
      ...current,
      enabled: feishu.enabled ?? false,
      app_id: feishu.app_id ?? '',
      owner_user_id: feishu.owner_user_id ?? '',
      owner_permission_level: getOwnerPermissionSelection(feishu.owner_user_id, feishu.owner_permission_level),
    }))
  }, [qq.enabled, qq.app_id, qq.owner_user_id, qq.owner_permission_level, weixin.enabled, weixin.base_url, weixin.owner_user_id, weixin.owner_permission_level, wecom.enabled, wecom.bot_id, wecom.owner_user_id, wecom.owner_permission_level, feishu.enabled, feishu.app_id, feishu.owner_user_id, feishu.owner_permission_level])

  // Render QR code to canvas when data changes
  useEffect(() => {
    if (qrData && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrData, { width: 200, margin: 2 }, (err) => {
        if (err) console.error('[weixin] QR render error:', err)
      })
    }
  }, [qrData])

  const startQrLogin = useCallback(async () => {
    stopPolling()
    setQrStatus('loading')
    setQrMsg('')
    setQrData(null)
    try {
      const res = await backendFetch(`${API}/settings/weixin/qr-start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setQrStatus('error'); setQrMsg(data.detail || '获取二维码失败'); return }
      setQrData(data.qrcode_url)
      setQrStatus('waiting')
      setQrMsg('请使用微信扫描二维码')

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const r = await backendFetch(`${API}/settings/weixin/qr-poll`, { method: 'POST' })
          const d = await r.json()
          if (d.status === 'confirmed') {
            stopPolling()
            setQrStatus('confirmed')
            setQrMsg('')
            setQrData(null)
            setWxForm(f => ({ ...f, enabled: true, token: '' }))
            // Reload channels
            useSettingsStore.getState().load()
          } else if (d.status === 'expired') {
            stopPolling()
            setQrStatus('expired')
            setQrMsg('二维码已过期，请重新生成')
            setQrData(null)
          } else if (d.status === 'scaned') {
            setQrStatus('scaned')
            setQrMsg('已扫码，请在微信确认')
          }
        } catch {
          // ignore poll errors
        }
      }, 3000)
    } catch (e) {
      setQrStatus('error')
      setQrMsg(e.message || '网络错误')
    }
  }, [stopPolling])

  const handleSave = async () => {
    const nextErrors = {
      qq: validateOwnerUserId('qq', form.owner_user_id) || '',
      weixin: validateOwnerUserId('weixin', wxForm.owner_user_id) || '',
      wecom: validateOwnerUserId('wecom', wecomForm.owner_user_id) || '',
      feishu: validateOwnerUserId('feishu', feishuForm.owner_user_id) || '',
    }
    setOwnerIdErrors(nextErrors)
    const firstError = nextErrors.qq || nextErrors.weixin || nextErrors.wecom || nextErrors.feishu
    if (firstError) {
      setSelectedChannel(Object.keys(nextErrors).find(id => nextErrors[id]))
      setSaveMessage({ ok: false, text: firstError })
      return
    }

    setSaving(true)
    setSaveMessage(null)
    const payload = {
      qq: {
        enabled: form.enabled,
        app_id: form.app_id,
        owner_user_id: normalizeOwnerUserId(form.owner_user_id),
        owner_permission_level: normalizeOwnerUserId(form.owner_user_id) ? form.owner_permission_level : 'qa_only',
      },
      weixin: {
        enabled: wxForm.enabled,
        base_url: wxForm.base_url,
        owner_user_id: normalizeOwnerUserId(wxForm.owner_user_id),
        owner_permission_level: normalizeOwnerUserId(wxForm.owner_user_id) ? wxForm.owner_permission_level : 'qa_only',
      },
      wecom: {
        enabled: wecomForm.enabled,
        bot_id: wecomForm.bot_id,
        owner_user_id: normalizeOwnerUserId(wecomForm.owner_user_id),
        owner_permission_level: normalizeOwnerUserId(wecomForm.owner_user_id) ? wecomForm.owner_permission_level : 'qa_only',
      },
      feishu: {
        enabled: feishuForm.enabled,
        app_id: feishuForm.app_id,
        owner_user_id: normalizeOwnerUserId(feishuForm.owner_user_id),
        owner_permission_level: normalizeOwnerUserId(feishuForm.owner_user_id) ? feishuForm.owner_permission_level : 'qa_only',
      },
    }
    if (form.app_secret) payload.qq.app_secret = form.app_secret
    if (wxForm.token.trim()) payload.weixin.token = wxForm.token.trim()
    if (wecomForm.secret) payload.wecom.secret = wecomForm.secret
    if (feishuForm.app_secret) payload.feishu.app_secret = feishuForm.app_secret
    try {
      await saveChannels(payload)
      setForm(current => ({ ...current, app_secret: '' }))
      setWxForm(current => ({ ...current, token: '' }))
      setWecomForm(current => ({ ...current, secret: '' }))
      setFeishuForm(current => ({ ...current, app_secret: '' }))
      const configured = []
      if (payload.qq.owner_user_id) configured.push('QQ')
      if (payload.weixin.owner_user_id) configured.push('微信')
      if (payload.wecom.owner_user_id) configured.push('企业微信')
      if (payload.feishu.owner_user_id) configured.push('飞书')
      setSaved(true)
      setSaveMessage({
        ok: true,
        text: configured.length
          ? `已保存。${configured.join('、')} 的主人 ID 已生效，下方权限级别对该 ID 生效。`
          : '已保存。未配置主人 ID 时，所有用户仅有问答权限。',
      })
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="model-settings-layout channel-settings-layout">
      <aside className="model-settings-sidebar" aria-label="机器人列表">
        <div className="model-settings-sidebar__header">
          <div>
            <div className="model-settings-sidebar__title">机器人</div>
            <div className="model-settings-sidebar__count">{visibleChannels.length} 个配置</div>
          </div>
          <button ref={addTriggerRef} type="button" className="settings-btn model-settings-add"
            aria-label="添加机器人" title="添加机器人" aria-haspopup="menu" aria-expanded={addOpen}
            onClick={() => setAddOpen(open => !open)}><AppstoreAddOutlined /></button>
        </div>
        <div className="model-settings-provider-list">
          {visibleChannels.map(channel => (
            <button key={channel.id} type="button" className={`channel-settings-item${currentChannel?.id === channel.id ? ' is-selected' : ''}`}
              aria-pressed={currentChannel?.id === channel.id} onClick={() => { setSelectedChannel(channel.id); setSaveMessage(null) }}>
              <ChannelIcon id={channel.id} /><span>{channel.name}</span>
              <span className={`channel-settings-status${channels?.[channel.id]?.enabled ? ' is-enabled' : ''}`}>
                {channels?.[channel.id]?.enabled ? '已启用' : '未启用'}
              </span>
            </button>
          ))}
          {!visibleChannels.length && <div className="model-settings-provider-empty">暂无机器人，点击上方图标添加</div>}
        </div>
        <DropdownMenuPortal ref={addMenuRef} open={addOpen} anchorRef={addTriggerRef} align="end" minWidth={190}>
          <div role="menu" aria-label="选择机器人类型" onKeyDown={event => {
            if (event.key === 'Escape') { event.stopPropagation(); setAddOpen(false); addTriggerRef.current?.focus() }
          }}>
            {CHANNEL_TYPES.map(channel => <button type="button" role="menuitem" key={channel.id}
              className="app-dropdown-menu-item" onClick={() => addChannel(channel.id)}>
              <ChannelIcon id={channel.id} /><span className="app-dropdown-menu-item__label">{channel.name}</span>
              {visibleChannels.some(item => item.id === channel.id) && <span className="channel-settings-menu-hint">已添加</span>}
            </button>)}
          </div>
        </DropdownMenuPortal>
      </aside>
      <section className="channel-settings-detail" aria-label="机器人配置">
        <header className="channel-settings-toolbar">
          <h4>{currentChannel ? `${currentChannel.name}机器人配置` : '机器人配置'}</h4>
          {currentChannel && <div className="channel-settings-toolbar-actions">
          <ChannelProbeButton state={probeState} disabled={saving || appBotQrBusy[currentChannel.id] || !!appBotQrPending[currentChannel.id] || (currentChannel.id === 'weixin' && wxQrBusy) || (currentChannel.id === 'wecom' && (wecomQrBusy || !!wecomQrPending))} onClick={() => channelProbe.run(currentChannel.id)} />
          <button type="button" onClick={handleSave} disabled={saving || wxQrBusy || wecomQrBusy || !!wecomQrPending || appBotQrActive} className="settings-btn settings-btn-primary">
            {saving ? '保存中…' : saved ? '已保存' : '保存配置'}
          </button></div>}
        </header>
        <div className="channel-settings-body">
          {!currentChannel && <div className="channel-settings-empty"><MessageOutlined /><h4>添加你的第一个机器人</h4><p>从左侧顶部选择 QQ、飞书、企业微信或微信</p></div>}
          {saveMessage && <div role="status" className={`channel-settings-feedback${saveMessage.ok ? ' is-success' : ''}`}>{saveMessage.text}</div>}
          <ChannelProbeChecklist state={probeState} onChange={patch => channelProbe.update(currentChannel.id, patch)} />
      {/* QQ Bot Card */}
      <div className="settings-channel-card" hidden={currentChannel?.id !== 'qq'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>QQ</span>
          <label style={toggleLabelStyle}>
            <AppSwitch checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
            启用
          </label>
        </div>
        <AppBotQrSetup channel="qq" disabled={saving} onBusyChange={changeAppBotQrBusy} onSaved={() => setForm(f => ({ ...f, app_secret: '' }))} />
        <Field label="AppID">
          <input className="settings-input" disabled={appBotQrBusy.qq || !!appBotQrPending.qq} value={appBotQrPending.qq?.app_id ?? form.app_id} onChange={e => setForm(f => ({ ...f, app_id: e.target.value }))} placeholder="你的 AppID" />
        </Field>
        <Field label="AppSecret" hint={qq.has_app_secret ? '已设置（留空保持不变）' : '未设置'}>
          <input className="settings-input" type="password" disabled={appBotQrBusy.qq || !!appBotQrPending.qq} value={form.app_secret} onChange={e => setForm(f => ({ ...f, app_secret: e.target.value }))} placeholder={qq.has_app_secret ? '••••••••••••' : '输入 AppSecret'} />
        </Field>
        <OwnerIdField
          channel="qq"
          savedConfig={qq}
          label="主人 ID"
          hint="留空则所有用户仅有问答权限"
          value={form.owner_user_id}
          error={ownerIdErrors.qq}
          permissionLevel={form.owner_permission_level}
          onChange={(owner_user_id) => {
            setOwnerIdErrors((current) => ({ ...current, qq: '' }))
            setForm((f) => ({ ...f, owner_user_id, owner_permission_level: getOwnerPermissionSelection(owner_user_id, f.owner_permission_level) }))
          }}
        />
        <OwnerPermissionLevelField
          name="qq-owner-permission-level"
          value={form.owner_permission_level}
          disabled={!form.owner_user_id.trim()}
          onChange={(owner_permission_level) => setForm((f) => ({ ...f, owner_permission_level }))}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          在 <a href="https://q.qq.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>QQ 开放平台</a> 创建频道机器人后获取凭证。
          用户在频道中 @ 机器人即可对话，发送 /new 开启新对话，发送 /myid 查看用户 ID。
          未配置主人 ID 时所有用户仅有问答权限；配置后可为主人选择权限级别。
        </div>
      </div>

      {/* Feishu Card */}
      <div className="settings-channel-card" hidden={currentChannel?.id !== 'feishu'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>飞书</span>
          <label style={toggleLabelStyle}>
            <AppSwitch checked={feishuForm.enabled} onChange={e => setFeishuForm(f => ({ ...f, enabled: e.target.checked }))} />
            启用
          </label>
        </div>
        <AppBotQrSetup channel="feishu" disabled={saving} onBusyChange={changeAppBotQrBusy} onSaved={() => setFeishuForm(f => ({ ...f, app_secret: '' }))} />
        <Field label="App ID">
          <input className="settings-input" disabled={appBotQrBusy.feishu || !!appBotQrPending.feishu} value={appBotQrPending.feishu?.app_id ?? feishuForm.app_id} onChange={e => setFeishuForm(f => ({ ...f, app_id: e.target.value }))} placeholder="飞书应用 App ID" />
        </Field>
        <Field label="App Secret" hint={feishu.has_app_secret ? '已设置（留空保持不变）' : '未设置'}>
          <input className="settings-input" type="password" disabled={appBotQrBusy.feishu || !!appBotQrPending.feishu} value={feishuForm.app_secret} onChange={e => setFeishuForm(f => ({ ...f, app_secret: e.target.value }))} placeholder={feishu.has_app_secret ? '••••••••••••' : '输入飞书应用 App Secret'} />
        </Field>
        <OwnerIdField
          channel="feishu"
          savedConfig={feishu}
          label="主人 ID"
          hint="留空则所有用户仅有问答权限"
          value={feishuForm.owner_user_id}
          error={ownerIdErrors.feishu}
          permissionLevel={feishuForm.owner_permission_level}
          onChange={(owner_user_id) => {
            setOwnerIdErrors((current) => ({ ...current, feishu: '' }))
            setFeishuForm((f) => ({ ...f, owner_user_id, owner_permission_level: getOwnerPermissionSelection(owner_user_id, f.owner_permission_level) }))
          }}
        />
        <OwnerPermissionLevelField
          name="feishu-owner-permission-level"
          value={feishuForm.owner_permission_level}
          disabled={!feishuForm.owner_user_id.trim()}
          onChange={(owner_permission_level) => setFeishuForm((f) => ({ ...f, owner_permission_level }))}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          在 <a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>飞书开放平台</a> 创建企业自建应用，启用机器人并配置事件订阅的长连接模式，获取 App ID 和 App Secret。
          用户在飞书中私聊机器人或在群聊中 @ 机器人即可对话，发送 /new 开启新对话，发送 /myid 查看用户 ID。
          未配置主人 ID 时所有用户仅有问答权限；配置后可为主人选择权限级别。
        </div>
      </div>

      {/* WeChat Card */}
      <div className="settings-channel-card" hidden={currentChannel?.id !== 'weixin'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>微信</span>
          <label style={toggleLabelStyle}>
            <AppSwitch checked={wxForm.enabled} onChange={e => setWxForm(f => ({ ...f, enabled: e.target.checked }))} />
            启用
          </label>
        </div>

        {/* Status indicator */}
        <div className="channel-connection-row">
          <span>说明</span>
          <span className={`channel-connection-status${weixin.has_token ? ' is-connected' : ''}`} role="status">
            <span className="channel-connection-status__dot" aria-hidden="true" />
            <span>{weixin.has_token ? '已连接' : '未连接'}</span>
          </span>
        </div>

        <Field label="服务地址" hint="留空使用微信官方地址；仅支持已允许的服务地址">
          <input className="settings-input" aria-label="微信服务地址" disabled={wxQrBusy || saving}
            value={wxForm.base_url} onChange={e => setWxForm(f => ({ ...f, base_url: e.target.value }))}
            placeholder="留空使用官方服务" />
        </Field>
        <Field label="Token" hint={weixin.has_token ? '已设置（留空保持不变）' : '可手动填写，或通过下方扫码获取'}>
          <input className="settings-input" type="password" aria-label="微信 Token" autoComplete="new-password" disabled={wxQrBusy || saving}
            value={wxForm.token} onChange={e => setWxForm(f => ({ ...f, token: e.target.value }))}
            placeholder={weixin.has_token ? '已设置，留空保持不变' : '输入微信 ClawBot Token'} />
        </Field>

        {/* QR Login */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={startQrLogin} disabled={wxQrBusy || saving} style={{ ...btnSmallStyle, marginBottom: 8 }}>
            {qrStatus === 'loading' ? '获取中...' : weixin.has_token ? '重新扫码登录' : '扫码登录'}
          </button>

          {qrData && (
            <div style={{ textAlign: 'center', padding: 12, background: '#fff', borderRadius: 8, marginBottom: 8 }}>
              <canvas ref={canvasRef} />
            </div>
          )}

          {qrMsg && qrStatus !== 'confirmed' && (
            <div style={{ fontSize: 12, color: qrStatus === 'error' || qrStatus === 'expired' ? '#ef4444' : 'var(--text-secondary)', marginTop: 4 }}>
              {qrMsg}
            </div>
          )}
        </div>

        <OwnerIdField
          channel="weixin"
          savedConfig={weixin}
          label="主人 ID"
          hint="留空则所有用户仅有问答权限"
          value={wxForm.owner_user_id}
          error={ownerIdErrors.weixin}
          permissionLevel={wxForm.owner_permission_level}
          onChange={(owner_user_id) => {
            setOwnerIdErrors((current) => ({ ...current, weixin: '' }))
            setWxForm((f) => ({ ...f, owner_user_id, owner_permission_level: getOwnerPermissionSelection(owner_user_id, f.owner_permission_level) }))
          }}
        />
        <OwnerPermissionLevelField
          name="weixin-owner-permission-level"
          value={wxForm.owner_permission_level}
          disabled={!wxForm.owner_user_id.trim()}
          onChange={(owner_permission_level) => setWxForm((f) => ({ ...f, owner_permission_level }))}
        />

        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          通过微信 ClawBot 插件连接。扫码后微信用户发消息给 ClawBot 即可与 WeWorker 对话，发送 /new 开启新对话，发送 /myid 查看用户 ID。
          未配置主人 ID 时所有用户仅有问答权限；配置后可为主人选择权限级别。
        </div>
      </div>

      {/* WeCom Card */}
      <div className="settings-channel-card" hidden={currentChannel?.id !== 'wecom'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>企业微信</span>
          <label style={toggleLabelStyle}>
            <AppSwitch checked={wecomForm.enabled} onChange={e => setWecomForm(f => ({ ...f, enabled: e.target.checked }))} />
            启用
          </label>
        </div>
        {wecomQrPending && <div role="status" className="channel-settings-feedback">
          {wecomQrSaving ? '正在保存机器人配置…' : '机器人已创建，配置尚未保存。请重试保存，无需重新扫码。'}
          {!wecomQrSaving && <button type="button" className="settings-btn settings-btn-secondary" onClick={async () => {
            setSaveMessage(null)
            try {
              await saveWecomQr()
              setWecomForm(current => ({ ...current, secret: '' }))
              setSaveMessage({ ok: true, text: '机器人配置已保存。' })
            }
            catch (error) { setSaveMessage({ ok: false, text: error.message }) }
          }}>重试保存</button>}
        </div>}
        <WecomQrConnect disabled={!!wecomQrPending} onBusyChange={setWecomQrBusy} onImport={async credentials => {
          setSaveMessage(null)
          try {
            await saveWecomQr(credentials)
            setWecomForm(current => ({ ...current, secret: '' }))
            setSaveMessage({ ok: true, text: '机器人配置已自动保存并启用。' })
          }
          finally { setWecomQrBusy(false) }
        }} />
        <Field label="BotID">
          <input className="settings-input" disabled={wecomQrBusy || !!wecomQrPending} value={wecomQrPending?.bot_id ?? wecomForm.bot_id} onChange={e => setWecomForm(f => ({ ...f, bot_id: e.target.value }))} placeholder="智能机器人 BotID" />
        </Field>
        <Field label="Secret" hint={wecom.has_secret ? '已设置（留空保持不变）' : '未设置'}>
          <input className="settings-input" type="password" disabled={wecomQrBusy || !!wecomQrPending} value={wecomForm.secret} onChange={e => setWecomForm(f => ({ ...f, secret: e.target.value }))} placeholder={wecom.has_secret || wecomQrPending ? '••••••••••••' : '输入长连接专用 Secret'} />
        </Field>
        <OwnerIdField
          channel="wecom"
          savedConfig={wecom}
          label="主人 ID"
          hint="留空则所有用户仅有问答权限"
          value={wecomForm.owner_user_id}
          error={ownerIdErrors.wecom}
          permissionLevel={wecomForm.owner_permission_level}
          onChange={(owner_user_id) => {
            setOwnerIdErrors((current) => ({ ...current, wecom: '' }))
            setWecomForm((f) => ({ ...f, owner_user_id, owner_permission_level: getOwnerPermissionSelection(owner_user_id, f.owner_permission_level) }))
          }}
        />
        <OwnerPermissionLevelField
          name="wecom-owner-permission-level"
          value={wecomForm.owner_permission_level}
          disabled={!wecomForm.owner_user_id.trim()}
          onChange={(owner_permission_level) => setWecomForm((f) => ({ ...f, owner_permission_level }))}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          在 <a href="https://work.weixin.qq.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>企业微信管理后台</a> 创建智能机器人，开启长连接 API 模式后获取 BotID 和 Secret。
          用户在企业微信中 @ 机器人或私聊即可对话，发送 /new 开启新对话，发送 /myid 查看用户 ID。
          未配置主人 ID 时所有用户仅有问答权限；配置后可为主人选择权限级别。
        </div>
      </div>

        </div>
      </section>
    </div>
  )
}

function ChannelIcon({ id }) {
  if (id === 'qq') return <QqOutlined aria-hidden="true" />
  if (id === 'wecom') return <WechatWorkOutlined aria-hidden="true" />
  if (id === 'weixin') return <WechatOutlined aria-hidden="true" />
  return <SendOutlined aria-hidden="true" />
}

function OwnerIdField({ channel, label, hint, value, error, permissionLevel, savedConfig, onChange }) {
  const trimmed = normalizeOwnerUserId(value)
  const validationError = error || validateOwnerUserId(channel, value)
  const configured = trimmed && !validationError
  const pending = hasUnsavedOwnerPermission(value, permissionLevel, savedConfig)
  const permissionLabel = OWNER_PERMISSION_OPTIONS.find((option) => option.value === permissionLevel)?.label || '问答权限'

  return (
    <Field label={label} hint={hint}>
      <input
        className="settings-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="发送 /myid 获取你的用户 ID"
        style={validationError && trimmed ? { borderColor: 'var(--error, #ef4444)' } : undefined}
      />
      {validationError && trimmed && (
        <div style={{ fontSize: 11, color: 'var(--error, #ef4444)', marginTop: 6 }}>{validationError}</div>
      )}
      {!validationError && (configured || pending) && (
        <div role="status" style={{ fontSize: 11, color: pending ? 'var(--text-secondary)' : 'var(--success, #22c55e)', marginTop: 6 }}>
          {pending ? '权限更改待保存，请点击右上角“保存配置”后生效。' : `已保存：该主人拥有${permissionLabel}，其他用户仅有问答权限。`}
        </div>
      )}
    </Field>
  )
}

function OwnerPermissionLevelField({ value, onChange, disabled }) {
  const selectedValue = disabled ? 'qa_only' : value
  const selected = OWNER_PERMISSION_OPTIONS.find(option => option.value === selectedValue) || OWNER_PERMISSION_OPTIONS[0]
  return (
    <Field label="主人拥有的权限级别" hint={disabled ? '请先填写主人 ID；留空保存后所有用户仅有问答权限' : undefined}>
      <AppDropdownSelect
        ariaLabel="主人权限级别"
        className="channel-permission-select"
        minMenuWidth={200}
        value={selected.value}
        options={OWNER_PERMISSION_OPTIONS}
        disabled={disabled}
        onChange={onChange}
      />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{selected.hint}</div>
    </Field>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="channel-settings-field">
      <label className="channel-settings-field__label">
        {label}
        {hint && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>{hint}</span>}
      </label>
      <div className="channel-settings-field__control">{children}</div>
    </div>
  )
}

const toggleLabelStyle = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }
const btnSmallStyle = {
  border: '1px solid var(--border)',
  borderRadius: 7,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 500,
  background: 'var(--bg-secondary)',
}
