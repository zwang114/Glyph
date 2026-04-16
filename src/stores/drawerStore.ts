import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DrawerState {
  storedPanelIds: string[];
  storePanel: (id: string) => void;
  restorePanel: (id: string) => void;
}

export const useDrawerStore = create<DrawerState>()(
  persist(
    (set) => ({
      storedPanelIds: ['mirror', 'onion'],
      storePanel: (id) =>
        set((s) => ({
          storedPanelIds: s.storedPanelIds.includes(id)
            ? s.storedPanelIds
            : [...s.storedPanelIds, id],
        })),
      restorePanel: (id) =>
        set((s) => ({
          storedPanelIds: s.storedPanelIds.filter((pid) => pid !== id),
        })),
    }),
    {
      name: 'glyph-studio-drawer',
      version: 1,
      partialize: (state) => ({ storedPanelIds: state.storedPanelIds }),
      migrate: () => ({ storedPanelIds: ['mirror', 'onion'] }),
    }
  )
);
