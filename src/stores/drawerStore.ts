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
      // Preserve the user's drawer arrangement across version bumps; just make
      // sure newly-introduced default panels (e.g. square-tone) are present.
      migrate: (persisted) => {
        const prev = (persisted as { storedPanelIds?: string[] } | undefined)?.storedPanelIds;
        const ids = Array.isArray(prev) ? [...prev] : ['mirror', 'onion', 'forest'];
        if (!ids.includes('square-tone')) ids.push('square-tone');
        return { storedPanelIds: ids };
      },
    }
  )
);
