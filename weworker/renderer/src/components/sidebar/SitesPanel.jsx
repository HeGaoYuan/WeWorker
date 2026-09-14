import React, { useState, useEffect } from 'react'
import { useStatusStore } from '../../store/status.js'
import { backendFetch } from '../../api/http.js'

const EMOJI = {
  'mail.google.com': '📧',
  'mail.163.com': '📮',
  'www.jd.com': '🛒',
  'www.xiaohongshu.com': '📕',
}

export default function SitesPanel() {
  const [expanded, setExpanded] = useState(false)
  const [domains, setDomains] = useState([])
  const extension = useStatusStore((s) => s.extension)
  const connected = extension === 'connected'

  const loadTools = () => {
    backendFetch('/tools')
      .then((r) => r.json())
      .then((data) => {
        // Group flat tool list by domain
        const tools = data.tools ?? []
        const map = new Map()
        for (const t of tools) {
          const domain = t.name.split('.').slice(0, -1).join('.') || t.name
          if (!map.has(domain)) map.set(domain, { domain, tools: [], tab_count: 1 })
          map.get(domain).tools.push(t)
        }
        setDomains([...map.values()])
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!expanded) return
    loadTools()
  }, [expanded])

  // Also refresh when extension connects
  useEffect(() => {
    if (connected && expanded) loadTools()
  }, [connected])

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', background: 'none', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer',
          padding: '4px 12px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', fontSize: 11,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}
      >
        <span>已加载工具</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '4px 0' }}>
          {domains.length === 0 ? (
            <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)' }}>
              {connected ? '暂无工具（请打开支持的网站）' : '扩展未连接'}
            </div>
          ) : (
            domains.map((d) => <DomainItem key={d.domain} data={d} />)
          )}
        </div>
      )}
    </div>
  )
}

function DomainItem({ data }) {
  const [open, setOpen] = useState(false)
  const emoji = EMOJI[data.domain] || '🌐'

  return (
    <div style={{ padding: '2px 0' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6,
          borderRadius: 4,
        }}
      >
        <span style={{ fontSize: 13 }}>{emoji}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, textAlign: 'left' }}>{data.domain}</span>
        <span style={{ fontSize: 10, color: 'var(--success)', fontFamily: 'monospace', marginRight: 4 }}>
          {data.tools.length}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ margin: '2px 12px 6px', borderLeft: '2px solid var(--border)', paddingLeft: 10, maxHeight: 300, overflowY: 'auto' }}>
          {data.tools.map((t) => {
            const shortName = t.name.split('.').pop()
            return (
              <div key={t.name} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 600 }}>
                  {shortName}
                </div>
                {t.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                    {t.description}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
