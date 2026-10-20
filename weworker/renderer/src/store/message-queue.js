import { create } from 'zustand'
import { createMessageQueue } from '../utils/message-queue.js'

export const EMPTY_MESSAGE_QUEUE = Object.freeze({ items: [], running: false, editingId: null, pausedReason: null, transitioning: false })
export const useMessageQueueStore = create(() => ({ queues: {} }))
const controllers = new Map()

export function getMessageQueue(workId) {
  if (!controllers.has(workId)) {
    controllers.set(workId, createMessageQueue({ onChange: snapshot => {
      if (!controllers.has(workId)) return
      useMessageQueueStore.setState(state => ({ queues: { ...state.queues, [workId]: snapshot } }))
    } }))
  }
  return controllers.get(workId)
}

export function discardMessageQueue(workId) {
  controllers.get(workId)?.dispose()
  controllers.delete(workId)
  useMessageQueueStore.setState(state => { const queues = { ...state.queues }; delete queues[workId]; return { queues } })
}
