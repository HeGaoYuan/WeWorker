import { useEffect, useRef } from 'react'

/** 桌面端鼠标光晕，轻量 rAF 跟随 */
export default function CursorGlow() {
  const ref = useRef(null)
  const pos = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const raf = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return undefined

    const el = ref.current
    if (!el) return undefined

    const onMove = (e) => {
      target.current = { x: e.clientX, y: e.clientY }
    }

    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.12
      pos.current.y += (target.current.y - pos.current.y) * 0.12
      el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px) translate(-50%, -50%)`
      raf.current = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    raf.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  return <div ref={ref} className="cursor-glow" aria-hidden />
}
