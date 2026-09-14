import React, { useEffect, useRef, useState } from 'react'

export default function AnimatedCollapse({
  open,
  children,
  duration = 180,
  easing = 'ease',
  unmountOnExit = false,
  style,
}) {
  const [renderChildren, setRenderChildren] = useState(open)
  const [visible, setVisible] = useState(open && !unmountOnExit)
  const hasMountedRef = useRef(false)

  useEffect(() => {
    let enterFrame = 0
    let settleFrame = 0
    let exitTimer = 0

    if (open) {
      setRenderChildren(true)
      if (!hasMountedRef.current && !unmountOnExit) {
        setVisible(true)
        hasMountedRef.current = true
        return undefined
      }
      hasMountedRef.current = true
      setVisible(false)
      enterFrame = window.requestAnimationFrame(() => {
        settleFrame = window.requestAnimationFrame(() => {
          setVisible(true)
        })
      })
      return () => {
        window.cancelAnimationFrame(enterFrame)
        window.cancelAnimationFrame(settleFrame)
      }
    }
    hasMountedRef.current = true
    setVisible(false)
    if (!unmountOnExit) return undefined
    exitTimer = window.setTimeout(() => setRenderChildren(false), duration)
    return () => window.clearTimeout(exitTimer)
  }, [duration, open, unmountOnExit])

  if (unmountOnExit && !renderChildren) return null

  return (
    <div
      aria-hidden={!open}
      style={{
        display: 'grid',
        gridTemplateRows: visible ? '1fr' : '0fr',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-3px)',
        transition: `grid-template-rows ${duration}ms ${easing}, opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`,
        pointerEvents: visible ? 'auto' : 'none',
        ...style,
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        {renderChildren ? children : null}
      </div>
    </div>
  )
}
