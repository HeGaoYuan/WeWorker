import { useCallback, useLayoutEffect, useState } from 'react'

export function useFitTextareaHeight(textareaRef, value, { fitContent, minHeight = 96, estimatedHeight }) {
  const [height, setHeight] = useState(estimatedHeight)

  const syncHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!fitContent || !textarea) return
    textarea.style.height = '0px'
    textarea.style.minHeight = '0px'
    const next = Math.max(minHeight, textarea.scrollHeight)
    textarea.style.height = ''
    textarea.style.minHeight = ''
    setHeight(next)
  }, [fitContent, minHeight, textareaRef])

  useLayoutEffect(() => {
    if (!fitContent) return
    const baseline = Math.max(minHeight, estimatedHeight)
    setHeight(baseline)
    syncHeight()
  }, [fitContent, estimatedHeight, minHeight, syncHeight, value])

  useLayoutEffect(() => {
    if (!fitContent) return undefined
    const textarea = textareaRef.current
    if (!textarea || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => syncHeight())
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [fitContent, syncHeight, textareaRef])

  return fitContent ? height : estimatedHeight
}
