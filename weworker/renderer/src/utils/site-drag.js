export const SITE_DRAG_TYPE = 'application/x-weworker-site-id'

export function setSiteDragData(dataTransfer, siteId) {
  if (!dataTransfer || !siteId) return
  dataTransfer.effectAllowed = 'move'
  dataTransfer.setData(SITE_DRAG_TYPE, siteId)
  dataTransfer.setData('text/plain', siteId)
}

export function getSiteDragId(dataTransfer) {
  if (!dataTransfer) return ''
  return dataTransfer.getData(SITE_DRAG_TYPE) || dataTransfer.getData('text/plain') || ''
}

export function hasSiteDragData(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes(SITE_DRAG_TYPE)
}
