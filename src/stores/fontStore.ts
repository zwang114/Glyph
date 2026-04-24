import { create } from 'zustand';
import { temporal } from 'zundo';
import type { FontProject, Glyph, KernPair } from '../types/font';
import {
  createDefaultProject,
  createEmptyGlyph,
  clonePixels,
} from '../types/font';
import { BASIC_LATIN } from '../utils/charset';

interface FontState {
  project: FontProject;
  glyphs: Record<string, Glyph>;
  kernPairs: KernPair[];
}

interface FontActions {
  setProject: (partial: Partial<FontProject>) => void;
  setGlyph: (id: string, glyph: Glyph) => void;
  setPixel: (glyphId: string, row: number, col: number, value: boolean) => void;
  setPixels: (
    glyphId: string,
    cells: { row: number; col: number; value: boolean }[]
  ) => void;
  fillRect: (
    glyphId: string,
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    value: boolean
  ) => void;
  clearGlyph: (glyphId: string) => void;
  resizeGlyph: (glyphId: string, width: number, height: number) => void;
  setAdvanceWidth: (glyphId: string, width: number) => void;
  addKernPair: (pair: KernPair) => void;
  updateKernPair: (index: number, value: number) => void;
  removeKernPair: (index: number) => void;
  initProject: (name: string) => void;
}

type FontStore = FontState & FontActions;

function buildInitialGlyphs(
  gridW: number,
  gridH: number
): Record<string, Glyph> {
  const glyphs: Record<string, Glyph> = {};
  for (const def of BASIC_LATIN) {
    const id = def.unicode.toString(16).padStart(4, '0');
    glyphs[id] = createEmptyGlyph(def.unicode, def.name, gridW, gridH);
  }
  return glyphs;
}

export const useFontStore = create<FontStore>()(
  temporal(
    (set) => ({
      project: createDefaultProject('Untitled'),
      glyphs: buildInitialGlyphs(24, 32),
      kernPairs: [],

      setProject: (partial) =>
        set((s) => ({
          project: { ...s.project, ...partial, modifiedAt: Date.now() },
        })),

      setGlyph: (id, glyph) =>
        set((s) => ({
          glyphs: { ...s.glyphs, [id]: glyph },
          project: { ...s.project, modifiedAt: Date.now() },
        })),

      setPixel: (glyphId, row, col, value) =>
        set((s) => {
          const glyph = s.glyphs[glyphId];
          if (!glyph) return s;
          if (row < 0 || row >= glyph.gridHeight) return s;
          if (col < 0 || col >= glyph.gridWidth) return s;
          const pixels = clonePixels(glyph.pixels);
          pixels[row][col] = value;
          return {
            glyphs: {
              ...s.glyphs,
              [glyphId]: { ...glyph, pixels },
            },
            project: { ...s.project, modifiedAt: Date.now() },
          };
        }),

      setPixels: (glyphId, cells) =>
        set((s) => {
          const glyph = s.glyphs[glyphId];
          if (!glyph) return s;
          const pixels = clonePixels(glyph.pixels);
          for (const { row, col, value } of cells) {
            if (row >= 0 && row < glyph.gridHeight && col >= 0 && col < glyph.gridWidth) {
              pixels[row][col] = value;
            }
          }
          return {
            glyphs: {
              ...s.glyphs,
              [glyphId]: { ...glyph, pixels },
            },
            project: { ...s.project, modifiedAt: Date.now() },
          };
        }),

      fillRect: (glyphId, r1, c1, r2, c2, value) =>
        set((s) => {
          const glyph = s.glyphs[glyphId];
          if (!glyph) return s;
          const pixels = clonePixels(glyph.pixels);
          const minR = Math.max(0, Math.min(r1, r2));
          const maxR = Math.min(glyph.gridHeight - 1, Math.max(r1, r2));
          const minC = Math.max(0, Math.min(c1, c2));
          const maxC = Math.min(glyph.gridWidth - 1, Math.max(c1, c2));
          for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
              pixels[r][c] = value;
            }
          }
          return {
            glyphs: {
              ...s.glyphs,
              [glyphId]: { ...glyph, pixels },
            },
            project: { ...s.project, modifiedAt: Date.now() },
          };
        }),

      clearGlyph: (glyphId) =>
        set((s) => {
          const glyph = s.glyphs[glyphId];
          if (!glyph) return s;
          const pixels = Array.from({ length: glyph.gridHeight }, () =>
            Array(glyph.gridWidth).fill(false)
          );
          return {
            glyphs: {
              ...s.glyphs,
              [glyphId]: { ...glyph, pixels },
            },
            project: { ...s.project, modifiedAt: Date.now() },
          };
        }),

      resizeGlyph: (glyphId, width, height) =>
        set((s) => {
          const glyph = s.glyphs[glyphId];
          if (!glyph) return s;
          const pixels: boolean[][] = Array.from({ length: height }, (_, r) =>
            Array.from({ length: width }, (_, c) =>
              r < glyph.gridHeight && c < glyph.gridWidth
                ? glyph.pixels[r][c]
                : false
            )
          );
          return {
            glyphs: {
              ...s.glyphs,
              [glyphId]: {
                ...glyph,
                gridWidth: width,
                gridHeight: height,
                pixels,
                advanceWidth: width,
              },
            },
            project: { ...s.project, modifiedAt: Date.now() },
          };
        }),

      setAdvanceWidth: (glyphId, width) =>
        set((s) => {
          const glyph = s.glyphs[glyphId];
          if (!glyph) return s;
          return {
            glyphs: {
              ...s.glyphs,
              [glyphId]: { ...glyph, advanceWidth: width },
            },
          };
        }),

      addKernPair: (pair) =>
        set((s) => ({ kernPairs: [...s.kernPairs, pair] })),

      updateKernPair: (index, value) =>
        set((s) => ({
          kernPairs: s.kernPairs.map((p, i) =>
            i === index ? { ...p, value } : p
          ),
        })),

      removeKernPair: (index) =>
        set((s) => ({
          kernPairs: s.kernPairs.filter((_, i) => i !== index),
        })),

      initProject: (name) => {
        const project = createDefaultProject(name);
        set({
          project,
          glyphs: buildInitialGlyphs(
            project.defaultGridWidth,
            project.defaultGridHeight
          ),
          kernPairs: [],
        });
      },
    }),
    {
      limit: 15,
      partialize: (state) => ({
        glyphs: state.glyphs,
        kernPairs: state.kernPairs,
      }),
    }
  )
);
