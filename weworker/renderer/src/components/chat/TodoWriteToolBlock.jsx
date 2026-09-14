import React, { useState } from 'react'
import ToolRunningIndicator from './ToolRunningIndicator.jsx'
import { ToolExecIcon, ToolRowChevron } from './ToolRowIcons.jsx'

function normalizeStatus(status) {
  const value = String(status ?? 'pending').toLowerCase().replace(/\s+/g, '_')
  if (value === 'completed') return 'completed'
  if (value === 'in_progress') return 'in_progress'
  return 'pending'
}

function statusLabel(status) {
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '执行中'
  return '待执行'
}

function getTodos(block) {
  const todos = block?.args?.todos
  return Array.isArray(todos) ? todos : []
}

export default function TodoWriteToolBlock({ block, streaming = false }) {
  const [open, setOpen] = useState(false)
  const running = streaming && block.status === 'running'
  const todos = getTodos(block)
  const completed = todos.filter((todo) => normalizeStatus(todo?.status) === 'completed').length
  const active = todos.find((todo) => normalizeStatus(todo?.status) === 'in_progress')
  const label = running
    ? '更新 Todo'
    : todos.length
      ? `更新 Todo ${completed}/${todos.length}`
      : '更新 Todo'
  const summary = active?.activeForm || active?.content || active?.subject || ''

  return (
    <div className="tool-todo-panel">
      <button
        type="button"
        className="tool-row-header tool-todo-panel__header"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="tool-row-header__icon" aria-hidden="true">
          {running ? <ToolRunningIndicator /> : <ToolExecIcon />}
        </span>
        <span className="tool-row-header__body">
          <span className="tool-exec-group__header-label">{label}</span>
          {summary && <span className="tool-todo-panel__summary" title={summary}>{summary}</span>}
          <span className="tool-row-header__chevron tool-todo-panel__chevron" aria-hidden="true">
            <ToolRowChevron expanded={open} />
          </span>
        </span>
      </button>

      {open && (
        <div className="tool-todo-panel__list">
          {todos.length ? todos.map((todo, index) => {
            const status = normalizeStatus(todo?.status)
            const text = String(todo?.content || todo?.subject || `Todo ${index + 1}`)
            return (
              <div key={`${text}-${index}`} className={`tool-todo-panel__item tool-todo-panel__item--${status}`}>
                <span className="tool-todo-panel__status">{statusLabel(status)}</span>
                <span className="tool-todo-panel__text" title={text}>{text}</span>
              </div>
            )
          }) : (
            <span className="tool-exec-group__detail-placeholder">等待 Todo 参数...</span>
          )}
        </div>
      )}
    </div>
  )
}
