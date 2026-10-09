import React from 'react'
import Tooltip from '../Tooltip.jsx'
import { useToolPackagePageStore } from '../../store/tool-package-page.js'
import { useExplorationPageStore } from '../../store/exploration-page.js'
import { useWebsiteExplorationStore } from '../../store/website-exploration.js'
import { useStatusStore } from '../../store/status.js'

export default function AppRail({ activeSection, onOpenConversation, onOpenTasks, onOpenSkills, onOpenExploration, onOpenWebsiteExploration, onOpenExtension, onOpenFiles, onOpenSettings }) {
  const skillsOpen = useToolPackagePageStore((s) => s.open)
  const explorationOpen = useExplorationPageStore((s) => s.open)
  const websiteOpen = useWebsiteExplorationStore((s) => s.open)
  const extension = useStatusStore((s) => s.extension)
  const activeKey = skillsOpen ? 'skills' : explorationOpen ? 'exploration' : websiteOpen ? 'website' : activeSection

  return (
    <aside className="app-rail" aria-label="主导航">
      <nav className="app-rail__nav" aria-label="工作区">
        <RailButton label="对话" active={activeKey === 'conversation'} onClick={onOpenConversation}>
          <ConversationIcon />
        </RailButton>
        <RailButton label="定时任务" active={activeKey === 'tasks'} onClick={onOpenTasks}>
          <ClockIcon />
        </RailButton>
        <RailButton label="SKILLS与场景" active={activeKey === 'skills'} onClick={onOpenSkills}>
          <SkillsIcon />
        </RailButton>
        <RailButton label="API 探索" active={activeKey === 'exploration'} onClick={onOpenExploration}>
          <ExploreIcon />
        </RailButton>
        <RailButton label="网站探索agent" active={activeKey === 'website'} onClick={onOpenWebsiteExploration}>
          <GlobeIcon />
        </RailButton>
      </nav>

      <div className="app-rail__spacer" />

      <nav className="app-rail__nav app-rail__nav--bottom" aria-label="工具">
        <RailButton label={extension === 'connected' ? '扩展已连接' : '检查浏览器扩展'} onClick={onOpenExtension}>
          <ExtensionIcon connected={extension === 'connected'} />
        </RailButton>
        <RailButton label="用户目录" onClick={onOpenFiles}>
          <MoreIcon />
        </RailButton>
        <RailButton label="设置" onClick={onOpenSettings}>
          <SettingsIcon />
        </RailButton>
      </nav>
    </aside>
  )
}

function RailButton({ label, active = false, onClick, children }) {
  return (
    <Tooltip text={label} placement="right">
      <button
        type="button"
        className={`app-rail__button${active ? ' is-active' : ''}`}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function ConversationIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-5.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><path d="M7 10h10M7 13h6" /></svg>
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg>
}

function SkillsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5-8 4.5-8-4.5z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></svg>
}

function ExploreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6M11 8v6" /></svg>
}

function GlobeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.8 9h16.4M3.8 15h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5s-1.1 6.2-3.2 8.5c-2.1-2.3-3.2-5.1-3.2-8.5S9.9 5.8 12 3.5Z" /></svg>
}

function ExtensionIcon({ connected = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" style={connected ? { color: 'var(--success)' } : undefined}><path d="M8.5 3.5h3v3a2 2 0 1 0 4 0v-3h3A2 2 0 0 1 20.5 5.5v3h-3a2 2 0 1 0 0 4h3v6a2 2 0 0 1-2 2h-6v-3a2 2 0 1 0-4 0v3h-3a2 2 0 0 1-2-2v-3h3a2 2 0 1 0 0-4h-3v-5a2 2 0 0 1 2-2h3Z" /></svg>
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4h-.1a1.7 1.7 0 0 0-1.6 1Z" /></svg>
}
