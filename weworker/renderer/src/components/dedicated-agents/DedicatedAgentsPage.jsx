import React, { useEffect } from 'react'
import { Alert, Button } from 'antd'
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons'
import { useDedicatedAgentsStore } from '../../store/dedicated-agents.js'
import { useSitesStore } from '../../store/sites.js'
import SiteIcon from '../icons/SiteIcon.jsx'
import { agentStatusPresentation, TONE_COLORS } from '../../utils/dedicated-agents.js'
import AgentCreateWizard from './AgentCreateWizard.jsx'
import AgentDetail from './AgentDetail.jsx'
import { showConfirm } from '../../store/dialog.js'
import { contentStyle, hintStyle, listColumnStyle, pageStyle, sectionStyle, titleStyle } from './styles.js'

const LIST_REFRESH_MS = 8000

function AgentListItem({ agent, site, active, onSelect }) {
  const status = agentStatusPresentation(agent)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? 'var(--bg-active)' : 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <SiteIcon site={site || { id: agent.site_id, name: agent.site_id }} size={24} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: TONE_COLORS[status.tone] }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: TONE_COLORS[status.tone] }} />
          {status.label}
        </span>
      </span>
    </button>
  )
}

function Intro({ onCreate, hasAgents }) {
  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={titleStyle}>专属 Agent</h2>
      <div style={{ ...hintStyle, fontSize: 13, margin: '8px 0 20px' }}>
        为某个网站打造一个小而专注的 Agent：它掌握你的专属知识，连接一个企业微信或微信机器人。你在手机上直接和它对话，它独立运行，不影响 WeWorker 的主对话。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          ['1. 选网站', '选一个 WeWorker 已经能操作的网站'],
          ['2. 写专属知识', '用大白话描述，AI 帮你整理成 Skill'],
          ['3. 扫码绑定', '企业微信或微信扫码，一键获得机器人'],
          ['4. 发绑定码', '给机器人发一句话完成配对'],
        ].map(([title, text]) => (
          <div key={title} style={{ ...sectionStyle, marginBottom: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
            <div style={hintStyle}>{text}</div>
          </div>
        ))}
      </div>
      <Button type="primary" size="large" icon={<PlusOutlined />} onClick={onCreate}>新建专属 Agent</Button>
      {hasAgents && <div style={{ ...hintStyle, marginTop: 12 }}>也可以在左侧选择一个已有的 Agent 查看和管理。</div>}
    </div>
  )
}

export default function DedicatedAgentsPage() {
  const agents = useDedicatedAgentsStore((s) => s.agents)
  const view = useDedicatedAgentsStore((s) => s.view)
  const selectedId = useDedicatedAgentsStore((s) => s.selectedId)
  const loaded = useDedicatedAgentsStore((s) => s.loaded)
  const loadError = useDedicatedAgentsStore((s) => s.loadError)
  const loadAgents = useDedicatedAgentsStore((s) => s.loadAgents)
  const startCreate = useDedicatedAgentsStore((s) => s.startCreate)
  const selectAgent = useDedicatedAgentsStore((s) => s.selectAgent)
  const closePage = useDedicatedAgentsStore((s) => s.closePage)
  const sites = useSitesStore((s) => s.sites)
  const loadSites = useSitesStore((s) => s.load)

  useEffect(() => {
    loadAgents()
    if (!sites.length) loadSites()
    const timer = setInterval(loadAgents, LIST_REFRESH_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const siteById = new Map(sites.map((site) => [site.id, site]))
  const showDetail = view === 'detail' && selectedId && agents.some((agent) => agent.id === selectedId)

  return (
    <div style={pageStyle}>
      <div style={listColumnStyle}>
        <div style={{ padding: '10px 8px 4px', borderBottom: '1px solid var(--border)' }}>
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={async () => {
              if (view === 'create' && !await showConfirm('放弃正在创建的专属 Agent？已填写的内容不会保存。')) return
              closePage()
            }}
            style={{ color: 'var(--text-secondary)' }}
          >
            返回主页面
          </Button>
        </div>
        <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>我的专属 Agent</span>
          <Button size="small" type="text" icon={<PlusOutlined />} onClick={startCreate} aria-label="新建专属 Agent" />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {loadError && <Alert type="error" showIcon message={loadError} style={{ margin: 4 }} />}
          {loaded && !agents.length && !loadError && <div style={{ ...hintStyle, padding: '8px 4px' }}>还没有专属 Agent</div>}
          {agents.map((agent) => (
            <AgentListItem
              key={agent.id}
              agent={agent}
              site={siteById.get(agent.site_id)}
              active={view === 'detail' && agent.id === selectedId}
              onSelect={() => selectAgent(agent.id)}
            />
          ))}
        </div>
      </div>
      {showDetail ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AgentDetail key={selectedId} agentId={selectedId} />
        </div>
      ) : (
        <div style={contentStyle}>
          {view === 'create' && <AgentCreateWizard />}
          {view !== 'create' && <Intro onCreate={startCreate} hasAgents={agents.length > 0} />}
        </div>
      )}
    </div>
  )
}
