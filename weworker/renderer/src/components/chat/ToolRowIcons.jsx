import React from 'react'

function ToolRowSvg({ children, size = 14 }) {
  return (
    <svg
      className="tool-row-static-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Expand/collapse chevron for tool row headers */
export function ToolRowChevron({ expanded = false, size = 15 }) {
  return (
    <svg
      className={`tool-row-chevron-icon${expanded ? ' tool-row-chevron-icon--expanded' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Idle icon for Skill tool calls */
export function ToolSkillIcon({ size = 14 }) {
  return (
    <ToolRowSvg size={size}>
      <path
        d="M8 2.5 9.1 6.9 13.5 8 9.1 9.1 8 13.5 6.9 9.1 2.5 8 6.9 6.9 8 2.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </ToolRowSvg>
  )
}

/** Idle icon for grouped shell/command tool rows */
export function ToolExecIcon({ size = 14 }) {
  return (
    <ToolRowSvg size={size}>
      <path
        d="M4.5 5.5 7 8 4.5 10.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 10.5h3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </ToolRowSvg>
  )
}

/** Idle icon for generic tool call blocks */
export function ToolGenericIcon({ size = 14 }) {
  return (
    <ToolRowSvg size={size}>
      <path
        d="M10.2 3.8 12.2 5.8 8.4 9.6 6.4 7.6 10.2 3.8Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M4.2 11.8 10.2 5.8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </ToolRowSvg>
  )
}
