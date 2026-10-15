import { create } from 'zustand'
import { fetchAgents } from '../api/dedicated-agents-api.js'
import { useWorksStore } from './works.js'
import { useScheduledTasksStore } from './scheduled-tasks.js'
import { useToolPackagePageStore } from './tool-package-page.js'
import { useExplorationPageStore } from './exploration-page.js'
import { useWebsiteExplorationStore, leaveWebsiteExploration } from './website-exploration.js'

/** view: 'list' (empty state / intro), 'create' (wizard) or 'detail' (selectedId). */
export const useDedicatedAgentsStore = create((set) => ({
  open: false,
  view: 'list',
  selectedId: null,
  agents: [],
  loaded: false,
  loadError: '',

  openPage: () => set({ open: true }),
  closePage: () => set({ open: false }),
  startCreate: () => set({ view: 'create', selectedId: null }),
  selectAgent: (id) => set({ view: id ? 'detail' : 'list', selectedId: id || null }),

  loadAgents: async () => {
    try {
      const agents = await fetchAgents()
      set({ agents, loaded: true, loadError: '' })
      return agents
    } catch (error) {
      set({ loaded: true, loadError: error.message || '加载失败' })
      return null
    }
  },

  upsertAgent: (agent) => set((state) => {
    if (!agent?.id) return {}
    const exists = state.agents.some((entry) => entry.id === agent.id)
    return {
      agents: exists
        ? state.agents.map((entry) => (entry.id === agent.id ? { ...entry, ...agent } : entry))
        : [...state.agents, agent],
    }
  }),

  removeAgent: (id) => set((state) => ({
    agents: state.agents.filter((entry) => entry.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
    view: state.selectedId === id ? 'list' : state.view,
  })),
}))

/** Close every other main view and show the 专属 Agent page. */
export async function showDedicatedAgentsPage() {
  if (!await leaveWebsiteExploration()) return false
  useToolPackagePageStore.getState().closePage()
  useExplorationPageStore.getState().closePage()
  useWorksStore.setState({ activeWorkId: null })
  useScheduledTasksStore.setState({ activeTaskId: null })
  useDedicatedAgentsStore.getState().openPage()
  return true
}

// Opening any other main view closes the 专属 Agent page, so existing
// navigation handlers do not need to know about it.
const closeWhen = (opened) => {
  if (opened && useDedicatedAgentsStore.getState().open) useDedicatedAgentsStore.getState().closePage()
}
useWorksStore.subscribe((state, previous) => {
  if (state.activeWorkId && state.activeWorkId !== previous.activeWorkId) closeWhen(true)
})
useScheduledTasksStore.subscribe((state, previous) => {
  if (state.activeTaskId && state.activeTaskId !== previous.activeTaskId) closeWhen(true)
})
useToolPackagePageStore.subscribe((state, previous) => closeWhen(state.open && !previous.open))
useExplorationPageStore.subscribe((state, previous) => closeWhen(state.open && !previous.open))
useWebsiteExplorationStore.subscribe((state, previous) => closeWhen(state.open && !previous.open))
