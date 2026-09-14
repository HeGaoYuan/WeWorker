import { create } from 'zustand'

/** Cross-panel fill for the main chat input (welcome + active work). */
export const useChatInputFillStore = create((set) => ({
  seq: 0,
  text: '',
  requestFill: (text) => {
    const trimmed = (text || '').trim()
    if (!trimmed) return
    set((s) => ({
      text: trimmed,
      seq: s.seq + 1,
    }))
  },
}))
