import React, { useEffect, useRef, useState } from 'react'
import { EXTENSION_PATH, useExtensionSteps, StepList } from './ExtensionSteps.jsx'
import { useStatusStore } from '../store/status.js'
import { describeDedicatedBrowserStatus } from '../utils/dedicated-browser.js'

const actionButtonStyle = {
  flexShrink: 0, background: 'var(--accent-soft)',
  border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))', borderRadius: 6,
  padding: '5px 12px', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

/** Polls WeWorker 浏览器 status while the panel is open; null outside the desktop app. */
function useDedicatedBrowserStatus() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.getDedicatedBrowserStatus) return undefined
    let cancelled = false
    const refresh = () => api.getDedicatedBrowserStatus().then((value) => { if (!cancelled) setStatus(value || null) }).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  return [status, setStatus]
}

function DedicatedBrowserCard({ status, onStatus }) {
  const [busy, setBusy] = useState(false)
  const view = describeDedicatedBrowserStatus(status)
  const run = async (action) => {
    setBusy(true)
    try {
      const next = await action()
      if (next) onStatus(next)
    } finally {
      setBusy(false)
    }
  }
  const tones = {
    ok: ['rgba(34,197,94,0.1)', 'rgba(34,197,94,0.3)'],
    error: ['rgba(248,113,113,0.1)', 'rgba(248,113,113,0.35)'],
    warn: ['rgba(245,158,11,0.1)', 'rgba(245,158,11,0.3)'],
    pending: ['var(--bg-secondary)', 'var(--border)'],
  }
  const [background, border] = tones[view.tone] || tones.pending
  return (
    <div style={{ background, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{view.text}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 4 }}>
        网站操作在 WeWorker 浏览器中进行，它的窗口在屏幕外，不会打扰你；登录状态与你自己的 Chrome 分开保存。需要登录网站时，点击「显示 WeWorker 浏览器」完成登录，完成后点击「隐藏」即可。
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {view.canShow && (
          <button type="button" disabled={busy} style={actionButtonStyle} onClick={() => run(() => window.electronAPI.showDedicatedBrowser())}>
            显示 WeWorker 浏览器
          </button>
        )}
        {view.canShow && (
          <button type="button" disabled={busy} style={actionButtonStyle} onClick={() => run(() => window.electronAPI.hideDedicatedBrowser())}>
            隐藏
          </button>
        )}
        {view.canRestart && (
          <button type="button" disabled={busy} style={actionButtonStyle} onClick={() => run(() => window.electronAPI.restartDedicatedBrowser())}>
            重新启动
          </button>
        )}
      </div>
    </div>
  )
}

export default function ExtensionGuide({ onClose }) {
  const [copied, setCopied] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const steps = useExtensionSteps()
  const extension = useStatusStore((state) => state.extension)
  const extensionInstance = useStatusStore((state) => state.extensionInstance)
  const connected = extension === 'connected'
  const [browserStatus, setBrowserStatus] = useDedicatedBrowserStatus()
  const dedicatedMode = browserStatus?.mode === 'dedicated'
  // In WeWorker 浏览器 the extension is installed automatically; manual steps only help when it cannot start.
  const showInstallSteps = !connected && (!dedicatedMode || browserStatus?.status === 'unavailable')

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onClose?.(), 150)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(EXTENSION_PATH).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const connectedText = extensionInstance === 'dedicated'
    ? '扩展已连接（WeWorker 浏览器），可以使用浏览器自动化能力。'
    : dedicatedMode
      ? '扩展已连接（你自己的 Chrome）。WeWorker 浏览器就绪后会优先使用它。'
      : '扩展已连接，可以使用浏览器自动化能力。'

  return (
    <div
      className={`extension-guide-overlay ${closing ? 'extension-guide-overlay--closing' : ''}`}
      onClick={requestClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div
        className={`extension-guide-panel ${closing ? 'extension-guide-panel--closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 500, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>浏览器扩展</div>
          <button onClick={requestClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '4px 8px', borderRadius: 4 }}>×</button>
        </div>

        {dedicatedMode && <DedicatedBrowserCard status={browserStatus} onStatus={setBrowserStatus} />}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: connected ? 'rgba(34,197,94,0.1)' : 'var(--bg-secondary)',
          border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
          borderRadius: 8, padding: '10px 12px', marginBottom: 16,
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {connected
                ? connectedText
                : dedicatedMode
                  ? 'WeWorker 浏览器启动后，扩展会自动安装并连接，无需手动操作。'
                  : '未检测到扩展。安装完成后打开 Chrome，左侧拼图图标会显示已连接。'}
            </span>
          </div>
          {!connected && !dedicatedMode && <button
            onClick={() => window.electronAPI?.openChrome()}
            style={actionButtonStyle}
          >
            打开 Chrome
          </button>}
        </div>

        {showInstallSteps && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {dedicatedMode ? '也可以把扩展安装到你自己的 Chrome（需在设置中改用“我自己的 Chrome”）：' : '按以下步骤安装扩展：'}
        </div>}

        {showInstallSteps && <StepList steps={steps} onCopy={handleCopy} copied={copied} />}

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={requestClose} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
