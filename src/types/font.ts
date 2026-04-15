export interface FontProject {
  id: string;
  name: string;
  familyName: string;
  styleName: string;
  defaultGridWidth: number;
  defaultGridHeight: number;
  pixelSize: number; // size of each pixel in font units (UPM / gridHeight)
  unitsPerEm: number;
  ascender: number;
  descender: number;
  createdAt: number;
  modifiedAt: number;
}

export interface Glyph {
  unicode: number;
  name: string;
  gridWidth: number;
  gridHeight: number;
  pixels: boolean[][]; // [row][col], true = filled
  advanceWidth: number;
  leftSideBearing: number;
}

export interface KernPair {
  left: number;
  right: number;
  value: number;
}

export function createDefaultProject(name: string): FontProject {
  return {
    id: crypto.randomUUID(),
    name,
    familyName: name,
    styleName: 'Regular',
    defaultGridWidth: 24,
    defaultGridHeight: 32,
    pixelSize: 32, // 1000 UPM / ~32 grid = ~32 units per pixel
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

export function createEmptyGrid(width: number, height: number): boolean[][] {
  return Array.from({ length: height }, () => Array(width).fill(false));
}

export function createEmptyGlyph(
  unicode: number,
  name: string,
  gridWidth: number,
  gridHeight: number
): Glyph {
  return {
    unicode,
    name,
    gridWidth,
    gridHeight,
    pixels: createEmptyGrid(gridWidth, gridHeight),
    advanceWidth: gridWidth,
    leftSideBearing: 0,
  };
}

export function clonePixels(pixels: boolean[][]): boolean[][] {
  return pixels.map((row) => [...row]);
}
