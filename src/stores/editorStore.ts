import { create } from 'zustand';
import type { EditorTool, MirrorMode, PixelShape, ViewportState } from '../types/editor';

interface EditorState {
  activeTool: EditorTool;
  selectedGlyphId: string | null;
  mirrorMode: MirrorMode;
  pixelShape: PixelShape;
  pixelDensity: number; // 0.15 to 1.0 — ratio of shape size to cell size
  viewport: ViewportState;
  showGrid: boolean;
  showMetrics: boolean;
  isDrawing: boolean;
  drawValue: boolean;
}

interface EditorActions {
  setTool: (tool: EditorTool) => void;
  setSelectedGlyph: (id: string | null) => void;
  setMirrorMode: (mode: MirrorMode) => void;
  setPixelShape: (shape: PixelShape) => void;
  setPixelDensity: (density: number) => void;
  setViewport: (vp: Partial<ViewportState>) => void;
  toggleGrid: () => void;
  toggleMetrics: () => void;
  setIsDrawing: (drawing: boolean) => void;
  setDrawValue: (value: boolean) => void;
}

type EditorStore = EditorState & EditorActions;

export const useEditorStore = create<EditorStore>()((set) => ({
  activeTool: 'pixel',
  selectedGlyphId: null,
  mirrorMode: 'none',
  pixelShape: 'square',
  pixelDensity: 1.0,
  viewport: { x: 0, y: 0, zoom: 1 },
  showGrid: true,
  showMetrics: true,
  isDrawing: false,
  drawValue: true,

  setTool: (tool) => set({ activeTool: tool }),
  setSelectedGlyph: (id) => set({ selectedGlyphId: id }),
  setMirrorMode: (mode) => set({ mirrorMode: mode }),
  setPixelShape: (shape) => set({ pixelShape: shape }),
  setPixelDensity: (density) => set({ pixelDensity: Math.max(0.15, Math.min(1, density)) }),
  setViewport: (vp) => set((s) => ({ viewport: { ...s.viewport, ...vp } })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleMetrics: () => set((s) => ({ showMetrics: !s.showMetrics })),
  setIsDrawing: (drawing) => set({ isDrawing: drawing }),
  setDrawValue: (value) => set({ drawValue: value }),
}));
