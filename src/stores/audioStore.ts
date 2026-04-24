import { create } from 'zustand';
import { playGlyph, stopPlayback } from '../audio/audioEngine';
import { useCanvasStore } from './canvasStore';

interface AudioState {
  isPlaying: boolean;
  muted: boolean;
  bpm: number;
  /** When true, playback loops back to column 0 after the last column. */
  isLooping: boolean;
  /** Which canvas is being played. Null when not playing. */
  playbackCanvasId: string | null;
  /** Fractional column position (0 → gridWidth) of the playhead. */
  playheadCol: number;
}

interface AudioActions {
  setIsPlaying: (v: boolean) => void;
  toggleMuted: () => void;
  setBpm: (bpm: number) => void;
  toggleLooping: () => void;
  setLooping: (v: boolean) => void;
  /** Start (or resume) playback from the current playhead column. */
  startPlayback: () => void;
  /** Pause — stop scheduled notes but keep the playhead in place. */
  pausePlayback: () => void;
  /**
   * Stop playback entirely and clear the playhead. This is the "hard stop"
   * used by external callers that don't care about resume state. The Restart
   * button wraps this plus a playhead reset.
   */
  stopPlayback: () => void;
  /** Stop + rewind playhead to column 0. */
  resetPlayback: () => void;
  setPlayheadCol: (col: number) => void;
}

export const useAudioStore = create<AudioState & AudioActions>()((set, get) => ({
  isPlaying: false,
  muted: false,
  bpm: 120,
  isLooping: false,
  playbackCanvasId: null,
  playheadCol: 0,

  setIsPlaying: (v) => set({ isPlaying: v }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(300, bpm)) }),
  toggleLooping: () => {
    const next = !get().isLooping;
    set({ isLooping: next });
    // If playback is currently running, restart from the current column so
    // the new loop flag takes effect on the engine.
    if (get().isPlaying) {
      const { playbackCanvasId, playheadCol, bpm } = get();
      const canvasState = useCanvasStore.getState();
      const id = playbackCanvasId;
      if (!id) return;
      const frame = canvasState.canvases[id];
      if (!frame) return;
      playGlyph(
        id,
        bpm,
        Math.floor(playheadCol),
        next,
        (col) => set({ playheadCol: col }),
        () => set({ isPlaying: false, playbackCanvasId: null, playheadCol: 0 }),
      );
    }
  },
  setLooping: (v) => set({ isLooping: v }),
  setPlayheadCol: (col) => set({ playheadCol: col }),

  startPlayback: () => {
    const { muted, bpm, playheadCol, isLooping } = get();
    if (muted) return;
    const canvasState = useCanvasStore.getState();
    const id = canvasState.selectedCanvasId ?? canvasState.lastSelectedCanvasId;
    if (!id) return;
    const frame = canvasState.canvases[id];
    if (!frame) return;
    // Resume from the current playhead if it's mid-sequence, else start fresh.
    const startCol =
      playheadCol > 0 && playheadCol < frame.gridWidth
        ? Math.floor(playheadCol)
        : 0;
    set({
      isPlaying: true,
      playbackCanvasId: id,
      playheadCol: startCol,
    });
    playGlyph(
      id,
      bpm,
      startCol,
      isLooping,
      (col) => set({ playheadCol: col }),
      () => set({ isPlaying: false, playbackCanvasId: null, playheadCol: 0 }),
    );
  },

  pausePlayback: () => {
    // Freeze playhead where it is, kill scheduled notes + rAF. Don't clear
    // playbackCanvasId — we want the next startPlayback to resume on the
    // same canvas.
    stopPlayback();
    set({ isPlaying: false });
  },

  stopPlayback: () => {
    stopPlayback();
    set({ isPlaying: false, playbackCanvasId: null, playheadCol: 0 });
  },

  resetPlayback: () => {
    stopPlayback();
    set({ isPlaying: false, playbackCanvasId: null, playheadCol: 0 });
  },
}));
