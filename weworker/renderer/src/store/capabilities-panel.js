import { create } from 'zustand'

export const useCapabilitiesPanelStore = create((set) => ({
  open: false,
  viewMode: 'list',
  toggle: () => set((s) => ({ open: !s.open })),
  openPanel: (viewMode) => set((s) => ({ open: true, viewMode: normalizeViewMode(viewMode || s.viewMode) })),
  closePanel: () => set({ open: false }),
  setViewMode: (viewMode) => set({ viewMode: normalizeViewMode(viewMode) }),
}))

function normalizeViewMode(viewMode) {
  return viewMode === 'grid' ? 'grid' : 'list'
}
