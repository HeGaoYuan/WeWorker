import { useEffect, useState } from 'react'

export const FEATURED_GRID_COLUMN_GAP = 28

const FEATURED_COMPACT_CARD_WIDTH = 280

function getResponsiveLayout(width) {
  if (!Number.isFinite(width) || width <= 0) return null
  const featuredCardWidth = (width - FEATURED_GRID_COLUMN_GAP) / 2
  return {
    compactFeaturedSites: featuredCardWidth < FEATURED_COMPACT_CARD_WIDTH,
  }
}

export function useWelcomeResponsiveLayout(sectionRef, enabled = true) {
  const [layout, setLayout] = useState({
    compactFeaturedSites: false,
  })

  useEffect(() => {
    if (!enabled) return undefined

    const node = sectionRef.current
    if (!node) return undefined

    const updateLayout = () => {
      if (!node.isConnected) return
      const next = getResponsiveLayout(node.getBoundingClientRect().width)
      if (!next) return
      setLayout((current) => (
        current.compactFeaturedSites === next.compactFeaturedSites
          ? current
          : next
      ))
    }

    updateLayout()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateLayout) : null
    observer?.observe(node)
    window.addEventListener('resize', updateLayout)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateLayout)
    }
  }, [sectionRef, enabled])

  return layout
}
