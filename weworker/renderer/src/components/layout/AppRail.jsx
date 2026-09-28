import React from 'react'
import Tooltip from '../Tooltip.jsx'
import { useToolPackagePageStore } from '../../store/tool-package-page.js'

export default function AppRail({ activeSection, onOpenConversation, onOpenTasks, onOpenSkills, onOpenFiles, onOpenSettings }) {
  const skillsOpen = useToolPackagePageStore((s) => s.open)
  const activeKey = skillsOpen ? 'skills' : activeSection

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
      </nav>

      <div className="app-rail__spacer" />

      <nav className="app-rail__nav app-rail__nav--bottom" aria-label="工具">
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

function MoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4h-.1a1.7 1.7 0 0 0-1.6 1Z" /></svg>
}
