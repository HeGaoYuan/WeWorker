export function getScrollAdjustmentForRect({
  containerTop,
  containerBottom,
  targetTop,
  targetBottom,
  padding = 0,
}) {
  const top = Number(containerTop) || 0
  const bottom = Number(containerBottom) || 0
  const targetStart = Number(targetTop) || 0
  const targetEnd = Number(targetBottom) || 0
  const inset = Math.max(0, Number(padding) || 0)

  if (targetEnd + inset > bottom) return targetEnd + inset - bottom
  if (targetStart - inset < top) return targetStart - inset - top
  return 0
}

export function scrollElementIntoContainer(container, target, padding = 0) {
  if (!container || !target) return 0
  const adjustment = getScrollAdjustmentForRect({
    containerTop: container.getBoundingClientRect().top,
    containerBottom: container.getBoundingClientRect().bottom,
    targetTop: target.getBoundingClientRect().top,
    targetBottom: target.getBoundingClientRect().bottom,
    padding,
  })
  if (adjustment) container.scrollTop += adjustment
  return adjustment
}
