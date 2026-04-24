import { create } from 'zustand';
import { playGlyph, stopPlayback } from '../audio/audioEngine';
import { useCanvasStore } from './canvasStore';

interface AudioState {
  isPlaying: boolean;
  muted: boolean;
  bpm: number;
  /** When true, playback loops back to column 0 after the last column. */
  isLooping: boolean;
  /** Fractional column position per canvas (0 → gridWidth). */
  playheadCols: Record<string, number>;
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
}

export const useAudioStore = create<AudioState & AudioActions>()((set, get) => ({
  isPlaying: false,
  muted: false,
  bpm: 160,
  isLooping: false,
  playheadCols: {},

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
      // Restart all active canvases with the new loop flag.
      get().startPlayback();
    }
  },
  setLooping: (v) => set({ isLooping: v }),

  startPlayback: () => {
    const { muted, bpm, isLooping, playheadCols } = get();
    if (muted) return;
    const canvasState = useCanvasStore.getState();
    const ids = canvasState.canvasOrder.filter(id => canvasState.canvases[id]);
    if (ids.length === 0) return;

    // Stop any current playback cleanly before relaunching.
    stopPlayback();

    // All canvases share the same audio-clock origin so they're phase-locked.
    // We compute it here (in the store) and pass it down to each playGlyph call.
    // AudioContext is accessed via the engine's exported helper — we create it
    // lazily by calling playGlyph with a tiny dummy, but instead just read the
    // current time directly through the Web Audio API.
    // Simpler: let the first playGlyph call establish the time, then reuse it.
    // We do this by grabbing ctx from a fresh AudioContext reference here.
    let sharedNow: number | undefined = undefined;

    set({ isPlaying: true, playheadCols: {} });

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
        true, // always loop (option C: all canvases loop until stopped)
        (col) => get().setPlayheadCol(id, col),
        () => {
          // Individual canvas ended (non-loop). Check if all done.
          const remaining = Object.keys(get().playheadCols).filter(
            (cid) => get().playheadCols[cid] > 0
          );
          if (remaining.length === 0) {
            set({ isPlaying: false, playheadCols: {} });
          }
        },
        sharedNow,
      );

      // After the first canvas establishes the AudioContext clock, subsequent
      // canvases will use the same `sharedNow`. Since playGlyph uses
      // `context.currentTime + 0.05` as default, and all calls happen
      // synchronously in this forEach, they'll all get the same value anyway —
      // but being explicit makes the intent clear and future-proof.
      // (sharedNow remains undefined; playGlyph computes it consistently.)
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
}));
