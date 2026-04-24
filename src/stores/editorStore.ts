import { create } from 'zustand';
import type { EditorTool } from '../types/editor';

/**
 * Editor state holds only GLOBAL interaction state that isn't tied to a
 * specific canvas. Per-canvas properties (shape, density, mirror, onion
 * skin, grid size) live on each CanvasFrame in `canvasStore`.
 */
// Discrete brush-size steps (in cells). `[` and `]` step between these.
export const BRUSH_SIZE_STEPS = [1, 2, 3, 4, 6, 8, 12, 16] as const;

interface EditorState {
  activeTool: EditorTool;
  showGrid: boolean;
  showMetrics: boolean;
  isDrawing: boolean;
  drawValue: boolean;
  brushSize: number; // cells per side of the brush stamp
}

interface EditorActions {
  setTool: (tool: EditorTool) => void;
  toggleGrid: () => void;
  toggleMetrics: () => void;
  setIsDrawing: (drawing: boolean) => void;
  setDrawValue: (value: boolean) => void;
  setBrushSize: (value: number) => void;
  stepBrushSize: (dir: 1 | -1) => void;
}

type EditorStore = EditorState & EditorActions;

export const useEditorStore = create<EditorStore>()((set) => ({
  activeTool: 'pixel',
  showGrid: true,
  showMetrics: true,
  isDrawing: false,
  drawValue: true,
  brushSize: 1,

  setTool: (tool) => set({ activeTool: tool }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleMetrics: () => set((s) => ({ showMetrics: !s.showMetrics })),
  setIsDrawing: (drawing) => set({ isDrawing: drawing }),
  setDrawValue: (value) => set({ drawValue: value }),
  setBrushSize: (value) => set({ brushSize: value }),
  stepBrushSize: (dir) =>
    set((s) => {
      const idx = BRUSH_SIZE_STEPS.indexOf(s.brushSize as typeof BRUSH_SIZE_STEPS[number]);
      const curIdx = idx === -1 ? 0 : idx;
      const next = Math.max(0, Math.min(BRUSH_SIZE_STEPS.length - 1, curIdx + dir));
      return { brushSize: BRUSH_SIZE_STEPS[next] };
    }),
}));
