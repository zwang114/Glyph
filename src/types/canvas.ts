import type { MirrorMode, PixelShape } from './editor';

/**
 * A single canvas frame in the multi-canvas workspace.
 * Each frame is an independent design surface. Its `letter` is an
 * optional assignment (unique across the workspace when set).
 * Tool properties live per-frame so each canvas can have its own
 * shape/density/mirror/onion-skin configuration.
 */
export interface CanvasFrame {
  id: string;
  letter: string | null;
  position: { x: number; y: number }; // world coords (top-left of grid)
  gridWidth: number;
  gridHeight: number;
  pixels: boolean[][]; // [row][col]
  /**
   * Per-cell shape. A cell may have its own shape (what it was painted with)
   * or be null when unpainted. This lets a single canvas carry a mix of
   * shapes — changing the active pixelShape only affects NEW strokes; existing
   * pixels keep whatever shape they were drawn with.
   */
  pixelShapes: (PixelShape | null)[][]; // [row][col]
  // Per-canvas tool properties — `pixelShape` is the active brush shape.
  pixelShape: PixelShape;
  pixelDensity: number;
  mirrorMode: MirrorMode;
  onionSkinEnabled: boolean;
  onionSkinFont: 'serif' | 'sans-serif';
  onionSkinSize: number;
  /**
   * When true, this canvas produces no audio during playback. The playhead
   * still runs; only note scheduling is skipped.
   */
  muted: boolean;
}

export interface WorkspaceViewport {
  x: number;
  y: number;
  zoom: number;
}

export function createEmptyPixels(width: number, height: number): boolean[][] {
  return Array.from({ length: height }, () => Array(width).fill(false));
}

export function createEmptyPixelShapes(
  width: number,
  height: number
): (PixelShape | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

export function clonePixels(pixels: boolean[][]): boolean[][] {
  return pixels.map((row) => [...row]);
}

export function clonePixelShapes(
  shapes: (PixelShape | null)[][]
): (PixelShape | null)[][] {
  return shapes.map((row) => [...row]);
}

/**
 * Scan A..Z and return the first letter not yet assigned to any canvas.
 * Returns null if all 26 are taken.
 */
export function nextUnusedLetter(
  canvases: Record<string, CanvasFrame>
): string | null {
  const taken = new Set<string>();
  for (const c of Object.values(canvases)) {
    if (c.letter) taken.add(c.letter);
  }
  for (let code = 65; code <= 90; code++) {
    const ch = String.fromCharCode(code);
    if (!taken.has(ch)) return ch;
  }
  return null;
}

export const DEFAULT_GRID_W = 24;
export const DEFAULT_GRID_H = 32;

export function createEmptyCanvas(
  id: string,
  position: { x: number; y: number },
  letter: string | null = null,
  gridWidth = DEFAULT_GRID_W,
  gridHeight = DEFAULT_GRID_H
): CanvasFrame {
  return {
    id,
    letter,
    position,
    gridWidth,
    gridHeight,
    pixels: createEmptyPixels(gridWidth, gridHeight),
    pixelShapes: createEmptyPixelShapes(gridWidth, gridHeight),
    pixelShape: 'square',
    pixelDensity: 1.0,
    mirrorMode: 'none',
    onionSkinEnabled: true,
    onionSkinFont: 'sans-serif',
    onionSkinSize: 1.0,
    muted: false,
  };
}

/**
 * Clone an existing canvas's pixels + properties into a new frame.
 * Per spec: letter is dropped (user reassigns manually).
 */
export function duplicateCanvasFrame(
  source: CanvasFrame,
  id: string,
  position: { x: number; y: number }
): CanvasFrame {
  return {
    id,
    letter: null,
    position,
    gridWidth: source.gridWidth,
    gridHeight: source.gridHeight,
    pixels: clonePixels(source.pixels),
    pixelShapes: clonePixelShapes(source.pixelShapes),
    pixelShape: source.pixelShape,
    pixelDensity: source.pixelDensity,
    mirrorMode: source.mirrorMode,
    onionSkinEnabled: source.onionSkinEnabled,
    onionSkinFont: source.onionSkinFont,
    onionSkinSize: source.onionSkinSize,
    muted: source.muted,
  };
}
