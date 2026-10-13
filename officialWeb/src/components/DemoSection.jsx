import { useEffect, useRef, useState } from 'react'
import WeWorkerAnimation from './WeWorkerAnimation.jsx'

/** Skill: pause demo when offscreen or prefers-reduced-motion */
export default function DemoSection() {
  const ref = useRef(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setPaused(true)
      return undefined
    }

    const el = ref.current
    if (!el) return undefined

    const io = new IntersectionObserver(
      ([entry]) => setPaused(!entry.isIntersecting),
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className="rounded-2xl overflow-hidden border border-border bg-surface/50">
      <WeWorkerAnimation paused={paused} />
      {paused && (
        <p className="sr-only">演示动画已暂停（离开视区或已开启减少动效）</p>
      )}
    </div>
  )
}
