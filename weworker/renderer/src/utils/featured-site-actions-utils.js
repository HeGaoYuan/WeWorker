export const FEATURED_COLUMN_COMPACT_BUTTON_SIZE = 22
export const FEATURED_COLUMN_ACTION_GAP = 3
export const FEATURED_COLUMN_ACTION_INSET = 6
export const FEATURED_COLUMN_ACTION_COUNT = 4

export function getFeaturedColumnActionsMinHeight() {
  return FEATURED_COLUMN_ACTION_INSET + (
    FEATURED_COLUMN_ACTION_COUNT * FEATURED_COLUMN_COMPACT_BUTTON_SIZE
    + (FEATURED_COLUMN_ACTION_COUNT - 1) * FEATURED_COLUMN_ACTION_GAP
  )
}

export function getFeaturedColumnActionsMinWidth() {
  return FEATURED_COLUMN_ACTION_INSET + FEATURED_COLUMN_COMPACT_BUTTON_SIZE
}

export function canShowFeaturedColumnActions(card) {
  const cardRect = card.getBoundingClientRect()
  if (cardRect.width <= 0 || cardRect.height <= 0) return false
  return cardRect.height >= getFeaturedColumnActionsMinHeight()
    && cardRect.width >= getFeaturedColumnActionsMinWidth()
}

export function rectsOverlap(a, b, inset = 2) {
  return a.left + inset < b.right - inset
    && a.right - inset > b.left + inset
    && a.top + inset < b.bottom - inset
    && a.bottom - inset > b.top + inset
}

export function expandRect(rect, padding = 0) {
  return {
    left: rect.left - padding,
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
  }
}

export function getFeaturedCardObstacleRects(card) {
  const obstacles = []

  card.querySelectorAll('[data-featured-card-icon], [data-featured-card-title]').forEach((node) => {
    const rect = node.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      obstacles.push(expandRect(rect, 6))
    }
  })

  const grid = card.closest('[data-featured-grid]')
  if (grid) {
    grid.querySelectorAll('[data-featured-card-icon], [data-featured-card-title]').forEach((node) => {
      if (card.contains(node)) return
      const rect = node.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        obstacles.push(expandRect(rect, 4))
      }
    })
  }

  if (obstacles.length === 0) {
    const cardRect = card.getBoundingClientRect()
    if (cardRect.width > 0 && cardRect.height > 0) {
      obstacles.push({
        left: cardRect.left + cardRect.width * 0.18,
        top: cardRect.top + cardRect.height * 0.12,
        right: cardRect.right - cardRect.width * 0.18,
        bottom: cardRect.bottom - cardRect.height * 0.24,
      })
    }
  }

  return obstacles
}

export function sortActionsForAdaptiveHiding(actions, layout, getRect) {
  return [...actions].sort((a, b) => {
    const aRect = getRect(a)
    const bRect = getRect(b)
    if (layout === 'row') return bRect.right - aRect.right
    return bRect.bottom - aRect.bottom
  })
}

export function computeAdaptiveHiddenActionKeys(card, stack, layout, forceVisible = new Set()) {
  const obstacles = getFeaturedCardObstacleRects(card)
  if (!obstacles.length) return new Set()

  const buttonEls = [...stack.querySelectorAll('[data-featured-action-key]')]
    .filter((el) => el.dataset.featuredActionKey)
  if (!buttonEls.length) return new Set()

  const hidden = new Set()
  const savedDisplays = buttonEls.map((el) => el.style.display)

  const applyHiddenToDom = () => {
    buttonEls.forEach((el) => {
      const key = el.dataset.featuredActionKey
      el.style.display = hidden.has(key) && !forceVisible.has(key) ? 'none' : ''
    })
  }

  let guard = 0
  while (guard++ < buttonEls.length + 2) {
    applyHiddenToDom()
    const overlapping = buttonEls.filter((el) => {
      const key = el.dataset.featuredActionKey
      if (!key || hidden.has(key) || forceVisible.has(key)) return false
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      return obstacles.some((obstacle) => rectsOverlap(rect, obstacle))
    })

    if (overlapping.length === 0) break

    const nextHidden = sortActionsForAdaptiveHiding(
      overlapping,
      layout,
      (el) => el.getBoundingClientRect(),
    )[0]
    hidden.add(nextHidden.dataset.featuredActionKey)
  }

  buttonEls.forEach((el, index) => {
    el.style.display = savedDisplays[index]
  })

  forceVisible.forEach((key) => hidden.delete(key))
  return hidden
}

export function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

export function actionVisibilityStyle(actionKey, hiddenActionKeys, forceVisibleKeys) {
  if (forceVisibleKeys.has(actionKey)) return null
  if (hiddenActionKeys.has(actionKey)) return { display: 'none' }
  return null
}
