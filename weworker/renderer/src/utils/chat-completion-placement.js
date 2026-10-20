// Anchor completion menus outside the composer, including any queued messages.
export function getChatCompletionPlacement({ anchor, viewportWidth, viewportHeight }) {
  const margin = 8
  const gap = 8
  const width = Math.max(0, Math.min(560, anchor.width, viewportWidth - margin * 2))
  const left = Math.max(margin, Math.min(anchor.left, viewportWidth - margin - width))
  const above = Math.max(0, anchor.top - gap - margin)
  const below = Math.max(0, viewportHeight - anchor.bottom - gap - margin)
  const opensAbove = above >= Math.min(160, below)
  return {
    left,
    width,
    maxHeight: Math.min(264, opensAbove ? above : below),
    ...(opensAbove
      ? { bottom: viewportHeight - anchor.top + gap }
      : { top: anchor.bottom + gap }),
  }
}
