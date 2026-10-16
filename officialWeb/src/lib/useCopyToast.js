import { useCallback, useEffect, useRef, useState } from 'react'
import { copyToClipboard } from './copyToClipboard.js'

const TOAST_MS = 2200

/** 复制文本并在成功时显示 Toast 状态（配合 CopyToast 组件） */
export function useCopyToast() {
  const [toastVisible, setToastVisible] = useState(false)
  const hideTimer = useRef(null)

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
  }, [])

  const copy = useCallback(async (text) => {
    const ok = await copyToClipboard(text)
    if (!ok) return false
    setToastVisible(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setToastVisible(false), TOAST_MS)
    return true
  }, [])

  return { copy, toastVisible }
}
