import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playGlyph, stopPlayback, setSoundProfile } from '../audio/audioEngine';
import { stopAmbient } from '../audio/ambientEngine';
import { SOUND_PROFILES, getProfile } from '../audio/soundProfiles';
import { useCanvasStore } from './canvasStore';

interface AudioState {
  isPlaying: boolean;
  muted: boolean;
  bpm: number;
  /** When true, playback loops back to column 0 after the last column. */
  isLooping: boolean;
  /** Fractional column position per canvas (0 → gridWidth). */
  playheadCols: Record<string, number>;
  /** Active sound profile id. */
  soundProfile: string;
}

interface AudioActions {
  setIsPlaying: (v: boolean) => void;
  toggleMuted: () => void;
  setBpm: (bpm: number) => void;
  toggleLooping: () => void;
  setLooping: (v: boolean) => void;
  startPlayback: () => void;
  pausePlayback: () => void;
  stopPlayback: () => void;
  resetPlayback: () => void;
  setPlayheadCol: (canvasId: string, col: number) => void;
  /** Legacy single-canvas accessor — returns the first active playhead. */
  getPlayheadCol: (canvasId: string) => number;
  toggleSoundProfile: () => void;
  setProfileById: (id: string) => void;
}

export const useAudioStore = create<AudioState & AudioActions>()(
  persist(
    (set, get) => ({
      isPlaying: false,
      muted: false,
      bpm: 160,
      isLooping: false,
      playheadCols: {},
      soundProfile: 'default',

      setIsPlaying: (v) => set({ isPlaying: v }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(300, bpm)) }),
      setPlayheadCol: (canvasId, col) =>
        set((s) => ({ playheadCols: { ...s.playheadCols, [canvasId]: col } })),
      getPlayheadCol: (canvasId) => get().playheadCols[canvasId] ?? 0,

      toggleLooping: () => {
        const next = !get().isLooping;
        set({ isLooping: next });
        if (get().isPlaying) {
          get().startPlayback();
        }
      },
      setLooping: (v) => set({ isLooping: v }),

      toggleSoundProfile: () => {
        const current = get().soundProfile;
        const idx = SOUND_PROFILES.findIndex(p => p.id === current);
        const next = SOUND_PROFILES[(idx + 1) % SOUND_PROFILES.length];
        getProfile(current)?.stopFn?.();
        set({ soundProfile: next.id });
        setSoundProfile(next.id);
        next.startFn?.();
      },

      setProfileById: (id: string) => {
        const current = get().soundProfile;
        if (current === id) return;
        getProfile(current)?.stopFn?.();
        const next = getProfile(id);
        if (!next) return;
        set({ soundProfile: next.id });
        setSoundProfile(next.id);
        next.startFn?.();
      },

      startPlayback: () => {
        const { muted, bpm, playheadCols, isLooping } = get();
        if (muted) return;
        const canvasState = useCanvasStore.getState();
        const ids = canvasState.canvasOrder.filter(id => canvasState.canvases[id]);
        if (ids.length === 0) return;

        stopPlayback();

        const sharedNow: number | undefined = undefined;

        set({ isPlaying: true, playheadCols: {} });

        // Track which canvases are still actively playing so onEnd knows when
        // the LAST one finishes. Without this, the playheadCols-based check
        // would race with the per-canvas position writes.
        const stillPlaying = new Set<string>(ids);

        ids.forEach((id) => {
          const frame = canvasState.canvases[id];
          if (!frame) return;

          const resumeCol = playheadCols[id] ?? 0;
          const startCol =
            resumeCol > 0 && resumeCol < frame.gridWidth ? Math.floor(resumeCol) : 0;

          playGlyph(
            id,
            bpm,
            startCol,
            isLooping,
            (col) => get().setPlayheadCol(id, col),
            () => {
              // This canvas reached the end (only fires when loop is off).
              stillPlaying.delete(id);
              // Clear THIS canvas's playhead immediately so its overlay
              // disappears as soon as it finishes — even if other canvases
              // are still playing.
              set((s) => {
                const next = { ...s.playheadCols };
                delete next[id];
                return { playheadCols: next };
              });
              if (stillPlaying.size === 0) {
                // All canvases finished — return to a clean rest state so
                // the next play press starts from column 0, not from
                // wherever the playhead happened to land.
                set({ isPlaying: false, playheadCols: {} });
              }
            },
            sharedNow,
          );
        });
      },

      pausePlayback: () => {
        stopPlayback();
        set({ isPlaying: false });
      },

      stopPlayback: () => {
        stopPlayback();
        set({ isPlaying: false, playheadCols: {} });
      },

      resetPlayback: () => {
        stopPlayback();
        set({ isPlaying: false, playheadCols: {} });
      },
    }),
    {
      name: 'glyph-studio-audio',
      version: 2,
      // Sound profile is derived from mushroom snap state at runtime — never persist it.
      // On reload, nothing is snapped, so we always start in 'default'.
      partialize: () => ({}),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.soundProfile = 'default';
          setSoundProfile('default');
          stopAmbient();
        }
      },
    }
  )
);
