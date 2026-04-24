import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  CanvasFrame,
  WorkspaceViewport,
} from '../types/canvas';
import type { MirrorMode, PixelShape } from '../types/editor';
import {
  clonePixels,
  clonePixelShapes,
  createEmptyPixelShapes,
  createEmptyCanvas,
  duplicateCanvasFrame,
  nextUnusedLetter,
} from '../types/canvas';

interface CanvasState {
  canvases: Record<string, CanvasFrame>;
  canvasOrder: string[]; // render order / z-order (later entries drawn on top)
  selectedCanvasId: string | null;
  /**
   * The most recently selected canvas. Tool panels read from this when
   * `selectedCanvasId` is null so the panel UI doesn't blank out.
   * Edits made while `selectedCanvasId` is null are no-ops.
   */
  lastSelectedCanvasId: string | null;
  viewport: WorkspaceViewport;
}

interface CanvasActions {
  createCanvas: (position: { x: number; y: number }) => string;
  duplicateCanvas: (
    sourceId: string,
    position: { x: number; y: number }
  ) => string | null;
  deleteCanvas: (id: string) => void;
  moveCanvas: (id: string, position: { x: number; y: number }) => void;
  resizeCanvas: (
    id: string,
    width: number,
    height: number,
    opts?: {
      rowOffset?: number;
      colOffset?: number;
      position?: { x: number; y: number };
    }
  ) => void;
  /**
   * Resize a canvas based on a PRE-RESIZE snapshot of its pixels/shapes.
   * Use this during interactive drags: each pointer-move call reconstructs
   * the new grid from the original snapshot, so repeated calls are
   * idempotent — no compounding shift bugs.
   *
   * `origGridWidth/Height` describe the snapshot's dimensions.
   * `colOffset`/`rowOffset` describe where the snapshot's [0,0] lands in
   * the new grid (can be negative when shrinking from the W/N edges).
   */
  resizeCanvasFromSnapshot: (
    id: string,
    params: {
      width: number;
      height: number;
      position: { x: number; y: number };
      origPixels: boolean[][];
      origPixelShapes: (PixelShape | null)[][] | undefined;
      origGridWidth: number;
      origGridHeight: number;
      rowOffset: number;
      colOffset: number;
    }
  ) => void;
  setPixels: (
    id: string,
    cells: { row: number; col: number; value: boolean }[]
  ) => void;
  fillRect: (
    id: string,
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    value: boolean
  ) => void;
  clearCanvas: (id: string) => void;
  assignLetter: (
    id: string,
    letter: string | null
  ) => { ok: boolean; reason?: string };
  setPixelShape: (id: string, shape: PixelShape) => void;
  setPixelDensity: (id: string, density: number) => void;
  setMirrorMode: (id: string, mode: MirrorMode) => void;
  setOnionSkinEnabled: (id: string, enabled: boolean) => void;
  setOnionSkinFont: (id: string, font: 'serif' | 'sans-serif') => void;
  setOnionSkinSize: (id: string, size: number) => void;
  setCanvasMuted: (id: string, muted: boolean) => void;
  selectCanvas: (id: string | null) => void;
  setViewport: (vp: Partial<WorkspaceViewport>) => void;
}

type CanvasStore = CanvasState & CanvasActions;

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useCanvasStore = create<CanvasStore>()(
  temporal(
    (set, get) => ({
      canvases: {},
      canvasOrder: [],
      selectedCanvasId: null,
      lastSelectedCanvasId: null,
      viewport: { x: 0, y: 0, zoom: 1 },

      createCanvas: (position) => {
        const id = genId();
        set((s) => {
          // First canvas ever → auto-assign "A".
          // Subsequent empty canvases → next unused letter (B, C, D…).
          const letter = nextUnusedLetter(s.canvases);
          // Inherit tool settings + grid size from the currently selected
          // (or last-selected) canvas so new frames feel continuous with
          // the user's current tool configuration. Falls back to defaults
          // for the first canvas.
          const sourceId = s.selectedCanvasId ?? s.lastSelectedCanvasId;
          const source = sourceId ? s.canvases[sourceId] : undefined;
          const base = createEmptyCanvas(
            id,
            position,
            letter,
            source?.gridWidth,
            source?.gridHeight
          );
          const frame: CanvasFrame = source
            ? {
                ...base,
                pixelShape: source.pixelShape,
                pixelDensity: source.pixelDensity,
                mirrorMode: source.mirrorMode,
                onionSkinEnabled: source.onionSkinEnabled,
                onionSkinFont: source.onionSkinFont,
                onionSkinSize: source.onionSkinSize,
              }
            : base;
          return {
            canvases: { ...s.canvases, [id]: frame },
            canvasOrder: [...s.canvasOrder, id],
            selectedCanvasId: id,
            lastSelectedCanvasId: id,
          };
        });
        return id;
      },

      duplicateCanvas: (sourceId, position) => {
        const source = get().canvases[sourceId];
        if (!source) return null;
        const id = genId();
        const frame = duplicateCanvasFrame(source, id, position);
        set((s) => ({
          canvases: { ...s.canvases, [id]: frame },
          canvasOrder: [...s.canvasOrder, id],
          selectedCanvasId: id,
          lastSelectedCanvasId: id,
        }));
        return id;
      },

      deleteCanvas: (id) =>
        set((s) => {
          if (!s.canvases[id]) return s;
          const { [id]: _removed, ...rest } = s.canvases;
          const order = s.canvasOrder.filter((x) => x !== id);
          const nextSelected =
            s.selectedCanvasId === id ? null : s.selectedCanvasId;
          const nextLast =
            s.lastSelectedCanvasId === id
              ? order[order.length - 1] ?? null
              : s.lastSelectedCanvasId;
          return {
            canvases: rest,
            canvasOrder: order,
            selectedCanvasId: nextSelected,
            lastSelectedCanvasId: nextLast,
          };
        }),

      moveCanvas: (id, position) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          return {
            canvases: { ...s.canvases, [id]: { ...c, position } },
          };
        }),

      resizeCanvas: (id, width, height, opts) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          // Min 4×4, no max. Existing pixels outside the new grid are dropped.
          const w = Math.max(4, Math.floor(width));
          const h = Math.max(4, Math.floor(height));
          // Offsets shift existing pixels inside the new grid. Used by
          // resize-from-left / resize-from-top so the opposite edge stays
          // visually anchored. Default 0 → old [0,0] lands at new [0,0].
          const rowOff = opts?.rowOffset ?? 0;
          const colOff = opts?.colOffset ?? 0;
          const pixels: boolean[][] = Array.from({ length: h }, (_, r) =>
            Array.from({ length: w }, (_, col) => {
              const sr = r - rowOff;
              const sc = col - colOff;
              return sr >= 0 &&
                sr < c.gridHeight &&
                sc >= 0 &&
                sc < c.gridWidth
                ? c.pixels[sr][sc]
                : false;
            })
          );
          const pixelShapes: (PixelShape | null)[][] = Array.from(
            { length: h },
            (_, r) =>
              Array.from({ length: w }, (_, col) => {
                const sr = r - rowOff;
                const sc = col - colOff;
                return sr >= 0 &&
                  sr < c.gridHeight &&
                  sc >= 0 &&
                  sc < c.gridWidth
                  ? c.pixelShapes?.[sr]?.[sc] ?? null
                  : null;
              })
          );
          const next: CanvasFrame = {
            ...c,
            gridWidth: w,
            gridHeight: h,
            pixels,
            pixelShapes,
            ...(opts?.position ? { position: opts.position } : {}),
          };
          return {
            canvases: { ...s.canvases, [id]: next },
          };
        }),

      resizeCanvasFromSnapshot: (id, params) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          const w = Math.max(4, Math.floor(params.width));
          const h = Math.max(4, Math.floor(params.height));
          const {
            origPixels,
            origPixelShapes,
            origGridWidth,
            origGridHeight,
            rowOffset,
            colOffset,
          } = params;
          const pixels: boolean[][] = Array.from({ length: h }, (_, r) =>
            Array.from({ length: w }, (_, col) => {
              const sr = r - rowOffset;
              const sc = col - colOffset;
              return sr >= 0 &&
                sr < origGridHeight &&
                sc >= 0 &&
                sc < origGridWidth
                ? origPixels[sr][sc]
                : false;
            })
          );
          const pixelShapes: (PixelShape | null)[][] = Array.from(
            { length: h },
            (_, r) =>
              Array.from({ length: w }, (_, col) => {
                const sr = r - rowOffset;
                const sc = col - colOffset;
                return sr >= 0 &&
                  sr < origGridHeight &&
                  sc >= 0 &&
                  sc < origGridWidth
                  ? origPixelShapes?.[sr]?.[sc] ?? null
                  : null;
              })
          );
          return {
            canvases: {
              ...s.canvases,
              [id]: {
                ...c,
                gridWidth: w,
                gridHeight: h,
                pixels,
                pixelShapes,
                position: params.position,
              },
            },
          };
        }),

      setPixels: (id, cells) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          const pixels = clonePixels(c.pixels);
          const pixelShapes = clonePixelShapes(
            c.pixelShapes ?? createEmptyPixelShapes(c.gridWidth, c.gridHeight)
          );
          const activeShape = c.pixelShape;
          for (const { row, col, value } of cells) {
            if (
              row >= 0 &&
              row < c.gridHeight &&
              col >= 0 &&
              col < c.gridWidth
            ) {
              pixels[row][col] = value;
              // Paint: stamp the active shape. Erase: clear the shape too.
              pixelShapes[row][col] = value ? activeShape : null;
            }
          }
          return {
            canvases: { ...s.canvases, [id]: { ...c, pixels, pixelShapes } },
          };
        }),

      fillRect: (id, r1, c1, r2, c2, value) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          const pixels = clonePixels(c.pixels);
          const pixelShapes = clonePixelShapes(
            c.pixelShapes ?? createEmptyPixelShapes(c.gridWidth, c.gridHeight)
          );
          const activeShape = c.pixelShape;
          const minR = Math.max(0, Math.min(r1, r2));
          const maxR = Math.min(c.gridHeight - 1, Math.max(r1, r2));
          const minC = Math.max(0, Math.min(c1, c2));
          const maxC = Math.min(c.gridWidth - 1, Math.max(c1, c2));
          for (let r = minR; r <= maxR; r++) {
            for (let col = minC; col <= maxC; col++) {
              pixels[r][col] = value;
              pixelShapes[r][col] = value ? activeShape : null;
            }
          }
          return {
            canvases: { ...s.canvases, [id]: { ...c, pixels, pixelShapes } },
          };
        }),

      clearCanvas: (id) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          const pixels = Array.from({ length: c.gridHeight }, () =>
            Array(c.gridWidth).fill(false)
          );
          const pixelShapes = createEmptyPixelShapes(c.gridWidth, c.gridHeight);
          return {
            canvases: { ...s.canvases, [id]: { ...c, pixels, pixelShapes } },
          };
        }),

      assignLetter: (id, letter) => {
        const state = get();
        const target = state.canvases[id];
        if (!target) return { ok: false, reason: 'canvas-not-found' };
        // Clearing the letter is always allowed.
        if (letter !== null) {
          const conflict = Object.values(state.canvases).find(
            (c) => c.id !== id && c.letter === letter
          );
          if (conflict) {
            return {
              ok: false,
              reason: `Letter "${letter}" is already assigned to another canvas.`,
            };
          }
        }
        set((s) => ({
          canvases: { ...s.canvases, [id]: { ...target, letter } },
        }));
        return { ok: true };
      },

      setPixelShape: (id, shape) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          return {
            canvases: { ...s.canvases, [id]: { ...c, pixelShape: shape } },
          };
        }),

      setPixelDensity: (id, density) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          const clamped = Math.max(0.15, Math.min(1, density));
          return {
            canvases: { ...s.canvases, [id]: { ...c, pixelDensity: clamped } },
          };
        }),

      setMirrorMode: (id, mode) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          return {
            canvases: { ...s.canvases, [id]: { ...c, mirrorMode: mode } },
          };
        }),

      setOnionSkinEnabled: (id, enabled) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          return {
            canvases: {
              ...s.canvases,
              [id]: { ...c, onionSkinEnabled: enabled },
            },
          };
        }),

      setOnionSkinFont: (id, font) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          return {
            canvases: { ...s.canvases, [id]: { ...c, onionSkinFont: font } },
          };
        }),

      setOnionSkinSize: (id, size) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          const clamped = Math.max(0.3, Math.min(2, size));
          return {
            canvases: { ...s.canvases, [id]: { ...c, onionSkinSize: clamped } },
          };
        }),

      setCanvasMuted: (id, muted) =>
        set((s) => {
          const c = s.canvases[id];
          if (!c) return s;
          return {
            canvases: { ...s.canvases, [id]: { ...c, muted } },
          };
        }),

      selectCanvas: (id) =>
        set((s) => ({
          selectedCanvasId: id,
          lastSelectedCanvasId: id ?? s.lastSelectedCanvasId,
        })),

      setViewport: (vp) =>
        set((s) => ({ viewport: { ...s.viewport, ...vp } })),
    }),
    {
      limit: 15,
      // Only persist the data that should participate in undo/redo.
      // Viewport/selection are ephemeral UI state.
      partialize: (state) => ({
        canvases: state.canvases,
        canvasOrder: state.canvasOrder,
      }),
    }
  )
);
