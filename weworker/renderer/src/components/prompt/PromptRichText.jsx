import React from 'react'
import { parsePromptTemplate } from '../../utils/prompt-template.js'
import { resolvePromptVar } from '../../utils/prompt-var-display.js'

/**
 * Renders prompt text with ${var} slots — code-style for bdp-portal etc., … for generic placeholders.
 * @param {string} text
 * @param {Record<string, { label?: string, style?: string, resolve?: string }>} [varDisplay]
 */
export default function PromptRichText({
  text,
  varDisplay = {},
  valueOverrides = {},
  className,
  style,
}) {
  if (!text) return null
  const segments = parsePromptTemplate(text)
  const hasVars = segments.some((s) => s.type === 'var')

  if (!hasVars) {
    return <span className={className} style={style}>{text}</span>
  }

  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>
      {segments.map((seg, i) => {
        if (seg.type !== 'var') {
          return <span key={`t-${i}`}>{seg.value}</span>
        }
        const slotKey = String(seg.varIndex)
        const { style: varStyle, label } = resolvePromptVar(seg.value, varDisplay)
        const override = valueOverrides[slotKey]
        const chipText = override != null && String(override).trim() !== ''
          ? String(override)
          : label
        if (varStyle === 'code') {
          return (
            <code key={`v-${i}`} className="prompt-var prompt-var--code">
              {chipText}
            </code>
          )
        }
        return (
          <span key={`v-${i}`} className="prompt-var prompt-var--placeholder">
            {chipText}
          </span>
        )
      })}
    </span>
  )
}
