import React from 'react'
import InputBar from './InputBar.jsx'

export default function ChatBottomDock({ showInput = true, ...inputProps }) {
  if (!showInput) return null

  return (
    <div
      data-chat-bottom-dock
      style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      borderTop: 'none',
      background: 'linear-gradient(to bottom, transparent 0, var(--bg-secondary) 42px, var(--bg-secondary) 100%)',
      pointerEvents: 'none',
    }}>
      <InputBar {...inputProps} />
    </div>
  )
}
