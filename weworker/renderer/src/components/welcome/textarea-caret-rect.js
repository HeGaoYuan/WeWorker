const MIRROR_STYLE_PROPERTIES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
]

export function getTextareaCaretRect(textarea, position) {
  if (!textarea || typeof document === 'undefined') return null

  const safePosition = Math.max(0, Math.min(position, textarea.value.length))
  const computed = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const marker = document.createElement('span')

  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = computed.whiteSpace || 'pre'
  mirror.style.wordWrap = 'normal'
  mirror.style.overflow = 'hidden'

  for (const prop of MIRROR_STYLE_PROPERTIES) {
    mirror.style[prop] = computed[prop]
  }

  mirror.style.width = `${textarea.offsetWidth}px`

  const before = textarea.value.slice(0, safePosition)
  mirror.textContent = before.endsWith('\n') ? `${before} ` : before
  marker.textContent = '.'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)

  const top = marker.offsetTop - textarea.scrollTop
  const left = marker.offsetLeft - textarea.scrollLeft
  const height = marker.offsetHeight || parseFloat(computed.lineHeight) || 20
  const textareaRect = textarea.getBoundingClientRect()

  document.body.removeChild(mirror)

  return {
    top: textareaRect.top + top,
    left: textareaRect.left + left,
    bottom: textareaRect.top + top + height,
    height,
    width: textareaRect.width,
  }
}
