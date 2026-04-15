import { useEffect } from 'react';
import { useFontStore } from '../stores/fontStore';
import type { Glyph } from '../types/font';
import { createEmptyGrid } from '../types/font';

let seeded = false;

function createPixelH(): Glyph {
  const w = 24;
  const h = 32;
  const pixels = createEmptyGrid(w, h);

  // Left stem (cols 4-7)
  for (let r = 4; r < 28; r++) {
    for (let c = 4; c <= 7; c++) pixels[r][c] = true;
  }
  // Right stem (cols 16-19)
  for (let r = 4; r < 28; r++) {
    for (let c = 16; c <= 19; c++) pixels[r][c] = true;
  }
  // Crossbar (row 14-17)
  for (let r = 14; r <= 17; r++) {
    for (let c = 4; c <= 19; c++) pixels[r][c] = true;
  }

  return {
    unicode: 0x48,
    name: 'H',
    gridWidth: w,
    gridHeight: h,
    pixels,
    advanceWidth: w,
    leftSideBearing: 0,
  };
}

function createPixelO(): Glyph {
  const w = 24;
  const h = 32;
  const pixels = createEmptyGrid(w, h);

  // Top edge
  for (let c = 8; c <= 15; c++) pixels[4][c] = true;
  for (let c = 6; c <= 17; c++) pixels[5][c] = true;
  // Bottom edge
  for (let c = 8; c <= 15; c++) pixels[27][c] = true;
  for (let c = 6; c <= 17; c++) pixels[26][c] = true;

  // Left side
  for (let r = 6; r <= 25; r++) {
    pixels[r][4] = true;
    pixels[r][5] = true;
    pixels[r][6] = true;
    pixels[r][7] = true;
  }
  // Right side
  for (let r = 6; r <= 25; r++) {
    pixels[r][16] = true;
    pixels[r][17] = true;
    pixels[r][18] = true;
    pixels[r][19] = true;
  }

  // Corner fills
  pixels[5][7] = true;
  pixels[5][16] = true;
  pixels[26][7] = true;
  pixels[26][16] = true;

  return {
    unicode: 0x4f,
    name: 'O',
    gridWidth: w,
    gridHeight: h,
    pixels,
    advanceWidth: w,
    leftSideBearing: 0,
  };
}

export function useSeedTestGlyphs() {
  useEffect(() => {
    if (seeded) return;
    seeded = true;

    const store = useFontStore.getState();
    store.setGlyph('0048', createPixelH());
    store.setGlyph('004f', createPixelO());
  }, []);
}
