import React from 'react'

export function resolveStyleKind(roleId) {
  if (!roleId || roleId === 'default') return 'default'
  if (roleId === 'weworker-clear') return 'core'
  if (String(roleId).startsWith('custom-')) return 'custom'
  return 'zcf'
}

export default function StyleKindIcon({ kind = 'core', size = 18 }) {
  if (kind === 'default') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (kind === 'zcf') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 5h12a2 2 0 0 1 2 2v10l-3-2-3 2-3-2-3 2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'custom') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 6h8M6 10h12M8 14h8M6 18h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
