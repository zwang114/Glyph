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
      // Forest connector mushroom starts in the drawer — user drags it out
      // and snaps it onto the shape panel's top connector notch.
      storedPanelIds: ['mirror', 'onion', 'forest', 'square-tone'],
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
      version: 3,
      partialize: (state) => ({ storedPanelIds: state.storedPanelIds }),
      migrate: () => ({ storedPanelIds: ['mirror', 'onion', 'forest', 'square-tone'] }),
    }
  )
);
