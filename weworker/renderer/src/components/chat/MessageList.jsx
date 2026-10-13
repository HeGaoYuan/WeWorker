import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import MessageItem from './MessageItem.jsx'
import SaveCodewordModal from './SaveCodewordModal.jsx'
import ComplexTaskPlanPanel from './ComplexTaskPlanPanel.jsx'
import { useWorksStore } from '../../store/works.js'
import { applyPausedTodoState, applyStreamingTodoProgress, buildDisplayTodoSnapshots, buildTodoWriteState } from '../../utils/todowrite-state.js'
import { backendFetch } from '../../api/http.js'
import { showConfirm } from '../../store/dialog.js'

const API = 'http://127.0.0.1:8765'
const TIME_GAP_MS = 5 * 60 * 1000 // 5 minutes

function formatTimeSeparator(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (isToday) return `${hh}:${mm}`
  if (isYesterday) return `昨天 ${hh}:${mm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

function shouldShowTime(prevMsg, currMsg) {
  if (!prevMsg?.created_at || !currMsg?.created_at) return !!currMsg?.created_at
  return new Date(currMsg.created_at) - new Date(prevMsg.created_at) > TIME_GAP_MS
}

export default function MessageList({ messages, streaming, compactionStatus, workId, onChoice, onSelectModeChange, onShellCommand }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [selectionToolbarRect, setSelectionToolbarRect] = useState(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showNewMsg, setShowNewMsg] = useState(false)
  const isNearBottomRef = useRef(true)
  const planSentinelRef = useRef(null)
  const [planPinned, setPlanPinned] = useState(false)
  const [planExpanded, setPlanExpanded] = useState(false)
  const [planStepDetails, setPlanStepDetails] = useState({})

  // Reset scroll state when switching conversations
  const prevWorkIdRef = useRef(workId)
  useEffect(() => {
    if (prevWorkIdRef.current !== workId) {
      prevWorkIdRef.current = workId
      isNearBottomRef.current = true
      setShowNewMsg(false)
      setPlanExpanded(false)
      setPlanStepDetails({})
      setPlanPinned(false)
      setSelectMode(false)
      setSelected(new Set())
      // Scroll to bottom on conversation switch
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView()
      })
    }
  }, [workId])

  useEffect(() => () => onSelectModeChange?.(false), [onSelectModeChange])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowNewMsg(false)
  }

  const enterSelectMode = (i) => {
    setSelectMode(true)
    onSelectModeChange?.(true)
    setSelected(new Set([i]))
  }
  const exitSelectMode = () => {
    setSelectMode(false)
    onSelectModeChange?.(false)
    setSelected(new Set())
  }
  const toggleSelect = (i) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const handleExtract = () => { if (selected.size > 0) setShowSaveModal(true) }

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    const ids = [...selected].sort((a, b) => a - b).map(i => messages[i]?.id).filter(Boolean)
    if (!ids.length || !await showConfirm(`确定删除 ${ids.length} 条消息？`, '删除消息')) return
    exitSelectMode()
    try {
      await backendFetch(`${API}/works/${workId}/messages/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: ids }),
      })
      useWorksStore.getState().selectWork(workId)
    } catch (e) { console.error('Delete failed:', e) }
  }

  const handleDeleteSingle = async (i) => {
    const msg = messages[i]
    if (!msg?.id || !await showConfirm('确定删除这条消息？', '删除消息')) return
    try {
      await backendFetch(`${API}/works/${workId}/messages/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: [msg.id] }),
      })
      useWorksStore.getState().selectWork(workId)
    } catch (e) { console.error('Delete failed:', e) }
  }

  const selectedMessages = [...selected].sort((a, b) => a - b).map(i => messages[i]).filter(Boolean)

  const todoState = useMemo(
    () => buildTodoWriteState(messages, { streaming }),
    [messages, streaming],
  )

  const planAnchor = useMemo(
    () => todoState
      ? { plan: todoState.plan, messageIndex: todoState.anchorIndex }
      : null,
    [todoState],
  )

  const displayPlan = useMemo(() => {
    if (!planAnchor?.plan) return null
    const plan = planAnchor.plan
    return streaming ? applyStreamingTodoProgress(plan, { streaming: true }) : applyPausedTodoState(plan)
  }, [planAnchor, streaming])

  const effectivePlanSnapshots = useMemo(
    () => buildDisplayTodoSnapshots(todoState, displayPlan),
    [displayPlan, todoState],
  )

  const shouldKeepPlanSticky = !!displayPlan && !displayPlan.locked && displayPlan.status !== 'completed'

  const planAnchorIndex = planAnchor?.messageIndex ?? null
  const prevPlanAnchorIndexRef = useRef(planAnchorIndex)

  useEffect(() => {
    if (
      prevPlanAnchorIndexRef.current != null
      && planAnchorIndex != null
      && prevPlanAnchorIndexRef.current !== planAnchorIndex
    ) {
      setPlanExpanded(false)
      setPlanStepDetails({})
      setPlanPinned(false)
    }
    prevPlanAnchorIndexRef.current = planAnchorIndex
  }, [planAnchorIndex])

  const updatePlanPinned = useCallback(() => {
    const root = containerRef.current
    const sentinel = planSentinelRef.current
    if (!root || !sentinel || !displayPlan) {
      setPlanPinned(false)
      return
    }
    const rootRect = root.getBoundingClientRect()
    const sentinelRect = sentinel.getBoundingClientRect()
    setPlanPinned(sentinelRect.bottom <= rootRect.top + 4)
  }, [displayPlan])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const threshold = 80
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (isNearBottomRef.current) setShowNewMsg(false)
    updatePlanPinned()
  }

  useEffect(() => {
    if (!displayPlan) {
      setPlanPinned(false)
    }
  }, [displayPlan])

  useEffect(() => {
    updatePlanPinned()
    const root = containerRef.current
    const sentinel = planSentinelRef.current
    if (!root || !sentinel || !displayPlan) return undefined

    const observer = new IntersectionObserver(
      () => updatePlanPinned(),
      { root, threshold: [0, 1] },
    )
    observer.observe(sentinel)
    window.addEventListener('resize', updatePlanPinned)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePlanPinned)
    }
  }, [displayPlan, planAnchor?.messageIndex, messages.length, streaming, updatePlanPinned])

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setShowNewMsg(true)
    }
    requestAnimationFrame(updatePlanPinned)
  }, [messages, compactionStatus, updatePlanPinned])

  useEffect(() => {
    if (!selectMode) {
      setSelectionToolbarRect(null)
      return undefined
    }

    const updateRect = () => {
      const inputSurface = document.querySelector('[data-chat-input-surface]')
      const rect = inputSurface?.getBoundingClientRect()
      if (!rect) return
      setSelectionToolbarRect({
        left: rect.left,
        width: rect.width,
        bottom: Math.max(12, window.innerHeight - rect.top + 8),
      })
    }

    updateRect()
    const frame = requestAnimationFrame(updateRect)
    window.addEventListener('resize', updateRect)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateRect)
    }
  }, [selectMode])

  return (
    <div className="message-list-shell">
      <div ref={containerRef} onScroll={handleScroll} className="message-list-scroll">
      <div className="message-list-scroll__inner">
      {messages.map((msg, i) => {
        const showTime = i === 0 || shouldShowTime(messages[i - 1], msg)
        return (
          <React.Fragment key={msg.id ?? i}>
            {showTime && msg.created_at && (
              <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: 11, color: 'var(--text-muted)' }}>
                {formatTimeSeparator(msg.created_at)}
              </div>
            )}
            <MessageItem
              message={msg}
              isLast={i === messages.length - 1}
              streaming={streaming && i === messages.length - 1}
              compacting={compactionStatus === 'compacting'}
              compactAssistant={msg.role === 'assistant' && messages[i - 1]?.role === 'assistant'}
              plan={planAnchor?.messageIndex === i ? displayPlan : null}
              planSnapshot={effectivePlanSnapshots[i] ?? null}
              planSentinelRef={planAnchor?.messageIndex === i && shouldKeepPlanSticky ? planSentinelRef : null}
              hideEmbeddedPlan={planPinned && planAnchor?.messageIndex === i}
              hideLivePlan={!(planAnchor?.messageIndex === i && shouldKeepPlanSticky)}
              planExpanded={planAnchor?.messageIndex === i && displayPlan ? planExpanded : undefined}
              onPlanExpandedChange={planAnchor?.messageIndex === i && displayPlan ? setPlanExpanded : undefined}
              planStepDetails={planAnchor?.messageIndex === i && displayPlan ? planStepDetails : undefined}
              onPlanStepDetailsChange={planAnchor?.messageIndex === i && displayPlan ? setPlanStepDetails : undefined}
              suppressPlanTools={!!(effectivePlanSnapshots[i] || (planAnchor?.messageIndex === i && displayPlan))}
              selectMode={selectMode}
              isSelected={selected.has(i)}
              onToggleSelect={() => toggleSelect(i)}
              onEnterSelectMode={() => enterSelectMode(i)}
              onDelete={() => handleDeleteSingle(i)}
              onChoice={onChoice}
              onShellCommand={onShellCommand}
            />
          </React.Fragment>
        )
      })}
      {compactionStatus && (
        <div
          role="status"
          aria-live="polite"
          data-conversation-compaction-status={compactionStatus}
          style={{
            padding: '12px 20px',
            fontSize: 14,
            color: compactionStatus === 'failed' ? 'var(--error)' : compactionStatus === 'compacting' ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          {compactionStatus === 'compacting' && '压缩中……'}
          {compactionStatus === 'completed' && '对话上下文压缩完成'}
          {compactionStatus === 'skipped' && '当前没有足够的历史对话可压缩'}
          {compactionStatus === 'failed' && '对话上下文压缩失败'}
        </div>
      )}
      <div ref={bottomRef} />
      </div>

      {/* New message indicator */}
      {showNewMsg && (
        <div style={{
          position: 'sticky', bottom: 12, display: 'flex', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 20,
        }}>
          <button
            onClick={scrollToBottom}
            style={{
              pointerEvents: 'auto',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 16,
              padding: '6px 16px',
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            有新消息
          </button>
        </div>
      )}

      {false && selectMode && (
        <div style={{
          position: 'absolute',
          left: '50%',
          bottom: 124,
          transform: 'translateX(-50%)',
          zIndex: 31,
          width: 'min(1144px, calc(100% - 40px))',
          margin: '10px auto 0',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'none',
          padding: '8px 10px 8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>已选择 {selected.size} 条消息</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <TbBtn label="取消" onClick={exitSelectMode} />
            {/* TODO: 暗号提取功能暂时隐藏，待重新设计交互流程后恢复（考虑使用 save_skill MCP 工具让 agent 在对话上下文中直接生成 skill） */}
            {/* <TbBtn label="⚡ 提取暗号" primary disabled={!selected.size} onClick={handleExtract} /> */}
            <TbBtn label="🗑 删除" danger disabled={!selected.size} onClick={handleDeleteSelected} />
          </div>
        </div>
      )}

      {showSaveModal && (
        <SaveCodewordModal selectedMessages={selectedMessages} onClose={() => { setShowSaveModal(false); exitSelectMode() }} />
      )}
      </div>
      {selectMode && (
        <div className="selection-toolbar motion-popover-enter" style={{
          position: 'fixed',
          left: selectionToolbarRect ? selectionToolbarRect.left : '50%',
          bottom: selectionToolbarRect ? selectionToolbarRect.bottom : 124,
          transform: selectionToolbarRect ? 'none' : 'translateX(-50%)',
          zIndex: 31,
          width: selectionToolbarRect ? selectionToolbarRect.width : 'min(1144px, calc(100% - 40px))',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'none',
          padding: '8px 10px 8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>已选择 {selected.size} 条消息</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <TbBtn label="取消" onClick={exitSelectMode} />
            <TbBtn label="删除" danger disabled={!selected.size} onClick={handleDeleteSelected} />
          </div>
        </div>
      )}
      {planPinned && shouldKeepPlanSticky && (
        <div className="complex-task-plan--pinned-overlay">
          <div className="complex-task-plan--pinned-inner">
            <ComplexTaskPlanPanel
              plan={displayPlan}
              pinned
              streaming={streaming}
              expanded={planExpanded}
              onExpandedChange={setPlanExpanded}
              expandedStepDetails={planStepDetails}
              onExpandedStepDetailsChange={setPlanStepDetails}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TbBtn({ label, onClick, primary, danger, disabled }) {
  const bg = disabled ? 'var(--bg-tertiary)' : primary ? 'var(--accent)' : 'var(--bg-primary)'
  const color = disabled ? 'var(--text-muted)' : primary ? '#fff' : danger ? 'var(--error)' : 'var(--text-secondary)'
  const border = primary || disabled ? 'none' : `1px solid ${danger ? 'var(--error)' : 'var(--border)'}`
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ height: 26, background: bg, color, border, borderRadius: 7, padding: '0 11px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: primary ? 600 : 500, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
}
