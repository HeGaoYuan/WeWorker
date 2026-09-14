import React, { useMemo, useState } from 'react'
import ToolRunningIndicator from './ToolRunningIndicator.jsx'

function PlanBranchIcon() {
  return (
    <svg className="complex-task-plan__branch-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5" fill="currentColor" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" />
      <path d="M4 5.5v5M4.8 8h6.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function ProgressRing({ completed, total, size = 18 }) {
  const stroke = 2
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? Math.min(1, completed / total) : 0
  const offset = circ * (1 - pct)

  return (
    <svg className="complex-task-plan__ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} opacity="0.18" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <circle cx={size / 2} cy={size / 2} r="2.5" fill="currentColor" />
    </svg>
  )
}

function StepIcon({ status, active = false }) {
  if (status === 'completed') {
    return (
      <span className="complex-task-plan__step-icon complex-task-plan__step-icon--completed" aria-hidden="true">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 4.2 3.2 6 6.5 2.5" />
        </svg>
      </span>
    )
  }
  if (status === 'in_progress' && active) {
    return (
      <span className="complex-task-plan__step-icon complex-task-plan__step-icon--active" aria-hidden="true">
        <ToolRunningIndicator size={12} />
      </span>
    )
  }
  if (status === 'in_progress') {
    return <span className="complex-task-plan__step-icon complex-task-plan__step-icon--pending" aria-hidden="true" />
  }
  if (status === 'blocked') {
    return (
      <span className="complex-task-plan__step-icon complex-task-plan__step-icon--blocked" aria-hidden="true">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4 1.2v3.4M4 6.3h.01" />
        </svg>
      </span>
    )
  }
  if (status === 'needs_confirmation') {
    return (
      <span className="complex-task-plan__step-icon complex-task-plan__step-icon--needs-confirmation" aria-hidden="true">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4.5" cy="4.5" r="3.1" />
          <path d="M4.5 2.6v2.1l1.4.9" />
        </svg>
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="complex-task-plan__step-icon complex-task-plan__step-icon--failed" aria-hidden="true">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M2 2l4 4M6 2 2 6" />
        </svg>
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="complex-task-plan__step-icon complex-task-plan__step-icon--cancelled" aria-hidden="true">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M2 2l4 4M6 2 2 6" />
        </svg>
      </span>
    )
  }
  return <span className="complex-task-plan__step-icon complex-task-plan__step-icon--pending" aria-hidden="true" />
}

function formatStepTitle(title) {
  const text = String(title ?? '').trim()
  if (!text) return ''
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) return heading[1].trim()
    if (!/^[-–—]{3,}$/.test(line)) return line.replace(/^[-*•]\s+/, '').trim()
  }
  return lines[0] ?? text
}

function StepRow({ step, onToggle, detailExpanded, stepActive = false }) {
  const isCompleted = step.status === 'completed'
  const hasDetail = isCompleted && step.result
  const displayTitle = formatStepTitle(step.title)

  return (
    <div className={`complex-task-plan__row complex-task-plan__row--${step.status}`}>
      <div className="complex-task-plan__row-main">
        <StepIcon status={step.status} active={stepActive} />
        <div className="complex-task-plan__row-text">{displayTitle}</div>
        {hasDetail && (
          <button
            type="button"
            className="complex-task-plan__row-chevron"
            onClick={onToggle}
            aria-expanded={detailExpanded}
          >
            {detailExpanded ? '▾' : '▸'}
          </button>
        )}
      </div>
      {hasDetail && detailExpanded && (
        <div className="complex-task-plan__row-detail">{step.result}</div>
      )}
      {step.status === 'blocked' && step.blocked_reason && (
        <div className="complex-task-plan__row-detail complex-task-plan__row-detail--blocked">{step.blocked_reason}</div>
      )}
      {step.status === 'needs_confirmation' && step.blocked_reason && (
        <div className="complex-task-plan__row-detail complex-task-plan__row-detail--needs-confirmation">{step.blocked_reason}</div>
      )}
      {step.status === 'failed' && step.blocked_reason && (
        <div className="complex-task-plan__row-detail complex-task-plan__row-detail--failed">{step.blocked_reason}</div>
      )}
      {step.status === 'cancelled' && step.blocked_reason && (
        <div className="complex-task-plan__row-detail complex-task-plan__row-detail--cancelled">{step.blocked_reason}</div>
      )}
    </div>
  )
}

export default function ComplexTaskPlanPanel({
  plan,
  embedded = false,
  pinned = false,
  streaming = false,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
  expandedStepDetails,
  onExpandedStepDetailsChange,
}) {
  if (!plan) return null
  return (
    <ComplexTaskPlanPanelInner
      plan={plan}
      embedded={embedded}
      pinned={pinned}
      streaming={streaming}
      defaultExpanded={defaultExpanded}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      expandedStepDetails={expandedStepDetails}
      onExpandedStepDetailsChange={onExpandedStepDetailsChange}
    />
  )
}

function ComplexTaskPlanPanelInner({
  plan,
  embedded = false,
  pinned = false,
  streaming = false,
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
  expandedStepDetails: stepDetailsProp,
  onExpandedStepDetailsChange,
}) {
  const visibleSteps = useMemo(() => plan?.steps ?? [], [plan])

  const [expandedInternal, setExpandedInternal] = useState(defaultExpanded)
  const [stepDetailsInternal, setStepDetailsInternal] = useState({})

  const expandedControlled = onExpandedChange != null
  const expanded = expandedControlled ? !!expandedProp : expandedInternal
  const setExpanded = (next) => {
    const value = typeof next === 'function' ? next(expanded) : next
    if (expandedControlled) onExpandedChange(value)
    else setExpandedInternal(value)
  }

  const stepDetailsControlled = onExpandedStepDetailsChange != null
  const expandedCompleted = stepDetailsControlled ? (stepDetailsProp ?? {}) : stepDetailsInternal
  const toggleStepDetail = (stepId) => {
    const updater = (prev) => ({ ...prev, [stepId]: !prev[stepId] })
    if (stepDetailsControlled) onExpandedStepDetailsChange(updater(expandedCompleted))
    else setStepDetailsInternal(updater)
  }

  const completed = visibleSteps.filter((s) => s.status === 'completed').length
  const total = visibleSteps.filter((s) => s.status !== 'cancelled').length
  const inProgressIndex = visibleSteps.findIndex((s) => s.status === 'in_progress')
  const stoppedIndex = visibleSteps.findIndex((s) => s.status === 'cancelled')
  const currentIndex = inProgressIndex >= 0
    ? inProgressIndex
    : stoppedIndex >= 0
      ? stoppedIndex
      : Math.min(completed, Math.max(visibleSteps.length - 1, 0))
  const currentStep = visibleSteps[currentIndex] ?? visibleSteps[0]
  const isRunning = streaming && inProgressIndex >= 0

  const modeClass = pinned
    ? ' complex-task-plan--pinned-float'
    : embedded
      ? ' complex-task-plan--embedded'
      : ''

  return (
    <div className={`complex-task-plan${modeClass}`}>
      <div className="complex-task-plan__card">
        <button
          type="button"
          className="complex-task-plan__header"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className={`complex-task-plan__type-label${isRunning ? ' complex-task-plan__type-label--animated' : ''}`}>Todo</span>
          <PlanBranchIcon />
          <span className="complex-task-plan__title">{plan.goal || '执行计划'}</span>
          <span className="complex-task-plan__header-end">
            {total > 0 && (
              <span className="complex-task-plan__header-progress">{completed}/{total}</span>
            )}
            <span className="complex-task-plan__header-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
            <ProgressRing completed={completed} total={total} />
          </span>
        </button>

        <div className="complex-task-plan__body">
          {expanded ? (
            visibleSteps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                stepActive={streaming && step.status === 'in_progress'}
                detailExpanded={!!expandedCompleted[step.id]}
                onToggle={() => toggleStepDetail(step.id)}
              />
            ))
          ) : currentStep ? (
            <StepRow step={currentStep} stepActive={streaming && currentStep.status === 'in_progress'} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
