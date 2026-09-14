import React, { useEffect, useRef, useState } from 'react'
import { EXTENSION_PATH, useExtensionSteps, StepList } from './ExtensionSteps.jsx'

export default function ExtensionGuide({ onClose }) {
  const [copied, setCopied] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const steps = useExtensionSteps()

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
          <div style={{ fontWeight: 700, fontSize: 16 }}>如何连接 Chrome 扩展</div>
          <button onClick={requestClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '4px 8px', borderRadius: 4 }}>×</button>
        </div>

        {/* Already installed tip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 16,
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              ✅ 如果已安装扩展，只需<strong>打开 Chrome</strong>，"扩展已连接"提示会自动消失。
            </span>
          </div>
          <button
            onClick={() => window.electronAPI?.openChrome()}
            style={{
              flexShrink: 0, background: 'rgba(34,197,94,0.2)',
              border: '1px solid rgba(34,197,94,0.4)', borderRadius: 6,
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', color: 'var(--success)', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            打开 Chrome
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>未安装扩展？按以下步骤操作：</div>

        <StepList steps={steps} onCopy={handleCopy} copied={copied} />

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={requestClose} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
