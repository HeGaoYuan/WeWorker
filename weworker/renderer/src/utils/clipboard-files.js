export function basename(filePath) {
  return String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || 'file'
}

export function getPathsFromPasteEvent(event) {
  const fromFiles = Array.from(event?.clipboardData?.files || [])
    .map((file) => file.path || window.electronAPI?.getPathForFile?.(file))
    .filter(Boolean)
  if (fromFiles.length) return fromFiles
  return []
}

export async function readClipboardFilePaths() {
  const fromPasteApi = await window.electronAPI?.readClipboardFilePaths?.()
  if (Array.from(fromPasteApi || []).length) return fromPasteApi
  return []
}

export async function collectClipboardFilePaths(event) {
  const fromEvent = getPathsFromPasteEvent(event)
  if (fromEvent.length) return fromEvent
  return readClipboardFilePaths()
}

export function mergeAttachmentPaths(currentAttachments, paths, attachmentLimit) {
  const limit = Math.max(1, Number(attachmentLimit) || 60)
  const remainingSlots = Math.max(limit - currentAttachments.length, 0)
  if (remainingSlots <= 0) {
    return {
      attachments: currentAttachments,
      notice: `最多只能添加 ${limit} 个文件`,
    }
  }
  const acceptedPaths = paths.slice(0, remainingSlots)
  const next = [
    ...currentAttachments,
    ...acceptedPaths.map((p) => ({ path: p, name: basename(p) })),
  ]
  const notice = paths.length > remainingSlots
    ? `已达到 ${limit} 个上限，只添加了前 ${remainingSlots} 个`
    : ''
  return { attachments: next, notice }
}
