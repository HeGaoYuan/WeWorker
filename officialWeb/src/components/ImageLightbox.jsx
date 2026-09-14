import { useState, useEffect, useCallback } from 'react'

export default function ImageLightbox() {
  const [src, setSrc] = useState(null)

  const close = useCallback(() => setSrc(null), [])

  useEffect(() => {
    const onClick = (e) => {
      const img = e.target.closest('.prose-dark img')
      if (img) setSrc(img.src)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    if (!src) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [src, close])

  if (!src) return null

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        cursor: 'zoom-out',
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  )
}
