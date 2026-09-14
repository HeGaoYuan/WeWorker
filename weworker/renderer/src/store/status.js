import { create } from 'zustand'
import { useWorksStore } from './works.js'
import { backendFetch } from '../api/http.js'

export const useStatusStore = create((set, get) => ({
  bridge: 'unknown',
  extension: 'unknown',
  extensionVersion: null,
  python: 'unknown',
  toolsCount: 0,
  channels: {},
  _lastExternalWrite: '',

  poll: async () => {
    try {
      const res = await backendFetch('/status')
      if (res.ok) {
        const data = await res.json()
        const prev = get()._lastExternalWrite
        const next = data.external_write ?? ''

        set({
          bridge: data.bridge,
          extension: data.extension,
          extensionVersion: data.extension_version ?? null,
          toolsCount: data.tools_count,
          channels: data.channels ?? {},
          python: 'running',
          _lastExternalWrite: next,
        })

        // A QQ/channel message arrived — refresh works list and active work
        if (next && next !== prev) {
          const worksStore = useWorksStore.getState()
          await worksStore.loadWorks()
          const activeId = worksStore.activeWorkId
          if (activeId && !worksStore.streamingWorkIds.has(activeId)) {
            // Force re-fetch messages for the active work
            // Skip if currently streaming — assistant message hasn't been persisted yet
            try {
              const res2 = await backendFetch(`/works/${activeId}`)
              if (res2.ok) {
                const d = await res2.json()
                useWorksStore.setState((s) => ({
                  messages: { ...s.messages, [activeId]: d.messages },
                }))
              }
            } catch {
              // ignore fetch errors during poll
            }
          }
        }
      }
    } catch {
      set({ python: 'disconnected', bridge: 'unknown', extension: 'unknown' })
    }
  },
}))
