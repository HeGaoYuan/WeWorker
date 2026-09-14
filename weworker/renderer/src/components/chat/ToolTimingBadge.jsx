import React from 'react'
import { formatDuration } from '../../utils/format-duration.js'

export default function ToolTimingBadge({ thinkMs, execMs }) {
  const parts = []

  const thinkText = formatDuration(thinkMs)
  if (thinkText) parts.push(`think ${thinkText}`)

  const execText = formatDuration(execMs)
  if (execText) parts.push(`exec ${execText}`)

  if (!parts.length) return null

  const label = parts.join(' / ')

  return (
    <span className="tool-timing-badge" title={label}>
      {label}
    </span>
  )
}
