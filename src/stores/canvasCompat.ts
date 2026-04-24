import { useMemo } from 'react';
import { useCanvasStore } from './canvasStore';
import type { Glyph } from '../types/font';
import type { PixelShape } from '../types/editor';

/**
 * Compatibility hook for legacy views (Preview / Export) that still
 * consume the old single-glyph-store shape.
 *
 * It derives a `Record<hexUnicode, Glyph>` from the new canvas store,
 * including only canvases that have a letter assigned.
 *
 * If two canvases somehow end up with the same letter (shouldn't happen
 * because assignLetter enforces uniqueness, but defensive), the last
 * one in canvasOrder wins.
 */
export function useCompatGlyphs(): Record<string, Glyph> {
  const canvases = useCanvasStore((s) => s.canvases);
  const canvasOrder = useCanvasStore((s) => s.canvasOrder);

  return useMemo(() => {
    const out: Record<string, Glyph> = {};
    for (const id of canvasOrder) {
      const c = canvases[id];
      if (!c || !c.letter) continue;
      const unicode = c.letter.charCodeAt(0);
      const hex = unicode.toString(16).padStart(4, '0');
      out[hex] = {
        unicode,
        name: c.letter,
        gridWidth: c.gridWidth,
        gridHeight: c.gridHeight,
        pixels: c.pixels,
        advanceWidth: c.gridWidth,
        leftSideBearing: 0,
      };
    }
    return out;
  }, [canvases, canvasOrder]);
}

/**
 * For now, Preview/Export render with a single "representative" shape
 * and density. We pick the selected (or last-selected) canvas's values;
 * if none exist, sensible defaults.
 *
 * A future "universal style" tool can replace this with explicit project-
 * level values.
 */
export function useCompatRenderStyle(): { shape: PixelShape; density: number } {
  const selectedId = useCanvasStore((s) => s.selectedCanvasId);
  const lastId = useCanvasStore((s) => s.lastSelectedCanvasId);
  const target = useCanvasStore((s) => {
    const id = selectedId ?? lastId;
    return id ? s.canvases[id] : null;
  });
  return {
    shape: target?.pixelShape ?? 'square',
    density: target?.pixelDensity ?? 1,
  };
}
