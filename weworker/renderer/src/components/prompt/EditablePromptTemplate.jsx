import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parsePromptTemplate } from '../../utils/prompt-template.js'
import { resolvePromptVar } from '../../utils/prompt-var-display.js'

function PromptVarInput({
  value,
  fallbackLabel,
  isCode,
  inputRef,
  ariaLabel,
  onBlur,
  onChange,
}) {
  const mirrorRef = useRef(null)
  const [widthPx, setWidthPx] = useState(0)

  useLayoutEffect(() => {
    const mirror = mirrorRef.current
    if (!mirror) return
    mirror.textContent = value || fallbackLabel || ' '
    setWidthPx(Math.max(mirror.offsetWidth + 14, 28))
  }, [value, fallbackLabel, isCode])

  return (
    <span className="prompt-var-input-wrap">
      <span
        ref={mirrorRef}
        className={`prompt-var-input-mirror${isCode ? ' prompt-var-input-mirror--code' : ''}`}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        className={`prompt-var-input prompt-var-input--${isCode ? 'code' : 'placeholder'}`}
        value={value}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          event.stopPropagation()
        }}
        onBlur={onBlur}
        onChange={onChange}
        style={{ width: widthPx ? `${widthPx}px` : undefined }}
      />
    </span>
  )
}

export default function EditablePromptTemplate({
  text,
  varDisplay = {},
  values = {},
  onChange,
  editMode = 'inline',
  className,
  style,
}) {
  const segments = useMemo(() => parsePromptTemplate(text || ''), [text])
  const [activeSlotKey, setActiveSlotKey] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (activeSlotKey) inputRef.current?.focus()
  }, [activeSlotKey])

  if (!text) return null

  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>
      {segments.map((segment, index) => {
        if (segment.type !== 'var') {
          return <span key={`t-${index}`}>{segment.value}</span>
        }
        const slotKey = String(segment.varIndex)
        const resolved = resolvePromptVar(segment.value, varDisplay)
        const current = Object.prototype.hasOwnProperty.call(values, slotKey)
          ? values[slotKey]
          : resolved.resolve
        const displayValue = current == null ? '' : String(current)
        const isCode = resolved.style === 'code'
        const isEditing = editMode === 'inline' || activeSlotKey === slotKey
        const ariaLabel = `编辑变量 ${resolved.label}`

        if (editMode === 'pencil' && !isEditing) {
          return (
            <span key={`v-${index}`} className="prompt-var-editable-chip">
              {isCode ? (
                <code className="prompt-var prompt-var--code">{displayValue || resolved.label}</code>
              ) : (
                <span className="prompt-var prompt-var--placeholder">{displayValue || resolved.label}</span>
              )}
              <button
                type="button"
                className="prompt-var-pencil"
                aria-label={ariaLabel}
                title={`编辑 ${resolved.label}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setActiveSlotKey(slotKey)
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                ✎
              </button>
            </span>
          )
        }

        return (
          <PromptVarInput
            key={`v-${index}`}
            value={displayValue}
            fallbackLabel={resolved.label}
            isCode={isCode}
            inputRef={activeSlotKey === slotKey ? inputRef : null}
            ariaLabel={ariaLabel}
            onBlur={() => {
              if (editMode === 'pencil') setActiveSlotKey(null)
            }}
            onChange={(event) => onChange?.(slotKey, event.target.value)}
          />
        )
      })}
    </span>
  )
}
