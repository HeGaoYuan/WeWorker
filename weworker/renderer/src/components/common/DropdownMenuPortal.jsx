import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DROPDOWN_MENU_CLASS } from './dropdown-menu-styles.js'

export const DropdownMenuPortal = forwardRef(function DropdownMenuPortal({
  open,
  anchorRef,
  children,
  minWidth = 0,
  matchAnchorWidth = false,
  align = 'start',
  offsetY = 4,
  placement = 'bottom',
  zIndex = 1200,
  className = DROPDOWN_MENU_CLASS,
  style,
}, ref) {
  const menuRef = useRef(null)
  const [position, setPosition] = useState(null)
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)

  useImperativeHandle(ref, () => menuRef.current)

  useLayoutEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return undefined
    }

    if (!rendered) return undefined
    setClosing(true)
    const timer = window.setTimeout(() => {
      setRendered(false)
      setPosition(null)
      setClosing(false)
    }, 140)
    return () => window.clearTimeout(timer)
  }, [open, rendered])

  useLayoutEffect(() => {
    if (!rendered) {
      setPosition(null)
      return undefined
    }

    const sync = () => {
      const anchor = anchorRef?.current
      if (!anchor) {
        setPosition(null)
        return
      }
      const rect = anchor.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight ?? 0
      const width = matchAnchorWidth ? rect.width : Math.max(rect.width, minWidth)
      const left = align === 'end' ? rect.right - width : rect.left
      const top = placement === 'top'
        ? rect.top - menuHeight - offsetY
        : rect.bottom + offsetY
      setPosition({
        top,
        left,
        width,
        minWidth: matchAnchorWidth ? width : (minWidth || width),
        maxWidth: matchAnchorWidth ? width : undefined,
      })
    }

    sync()
    const raf = requestAnimationFrame(sync)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [rendered, anchorRef, align, matchAnchorWidth, minWidth, offsetY, placement, children])

  if (!rendered || !position || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      className={`${className}${closing ? ' app-dropdown-menu--closing' : ''}`}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: position.width,
        minWidth: position.minWidth,
        maxWidth: position.maxWidth,
        zIndex,
        pointerEvents: closing ? 'none' : undefined,
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  )
})

export function useDropdownDismiss(open, onClose, triggerRef, menuRef) {
  useLayoutEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      onClose()
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open, onClose, triggerRef, menuRef])
}
