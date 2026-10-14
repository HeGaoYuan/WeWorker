import { useRef } from 'react'

const STRENGTH = 0.28

export default function MagneticButton({ children, className = '', as: Tag = 'div', ...rest }) {
  const ref = useRef(null)

  const onMove = (e) => {
    const el = ref.current
    if (!el || window.matchMedia('(pointer: coarse)').matches) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left - rect.width / 2) * STRENGTH
    const y = (e.clientY - rect.top - rect.height / 2) * STRENGTH
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }

  const onLeave = () => {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    <Tag
      ref={ref}
      className={`magnetic-wrap ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      {...rest}
    >
      {children}
    </Tag>
  )
}
