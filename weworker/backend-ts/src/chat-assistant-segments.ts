import * as store from './works-store.js'

/** Keep the turn-wide ledger for memory/timing while persisting chronological replies. */
export function createAssistantSegments(
  workId: string,
  content: store.ContentBlock[],
  onRefresh?: (message: store.Message) => void,
) {
  const saved: Array<{ start: number; end: number; message: store.Message }> = []
  let start = 0
  return {
    checkpoint(): store.Message | undefined {
      if (start === content.length) return undefined
      const end = content.length
      const message = store.appendMessage(workId, 'assistant', content.slice(start, end))
      saved.push({ start, end, message })
      start = end
      return message
    },
    /** A running tool stays in the segment where it started, even after several steers. */
    refresh(blockIndex: number): void {
      const segment = saved.find(part => part.start <= blockIndex && blockIndex < part.end)
      if (!segment) return
      const blocks = content.slice(segment.start, segment.end)
      if (!store.updateAssistantMessageContent(workId, segment.message.id, blocks)) return
      segment.message = { ...segment.message, content: blocks }
      onRefresh?.(segment.message)
    },
  }
}
