import React from 'react'

export default function ToolRunningIndicator({ size = 14, className = '' }) {
  const r = 6
  const circ = 2 * Math.PI * r
  const center = 8

  return (
    <span className={`tool-running-indicator${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="tool-running-indicator__spin" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx={center}
            cy={center}
            r={r}
            stroke="currentColor"
            strokeWidth="1.75"
            opacity="0.2"
          />
          <circle
            cx={center}
            cy={center}
            r={r}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeDasharray={`${circ * 0.68} ${circ * 0.32}`}
          />
        </svg>
      </span>
    </span>
  )
}
