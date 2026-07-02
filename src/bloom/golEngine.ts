import type { PixelShape } from '../types/editor';

export const SHAPE_COLORS: Record<PixelShape, string> = {
  square:   '#F5C518',
  circle:   '#E8651A',
  diamond:  '#E63946',
  triangle: '#C0392B',
  cross:    '#7CB87C',
  star:     '#6B9AB8',
};

// One boolean grid per shape type. true = alive.
export type GolState = Record<PixelShape, boolean[][]>;

// Per-cell layer assignment: true = render above letter, false = render below.
// Built once at seed time, never changes.
export type LayerMap = boolean[][];

function makeGrid(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(false));
}

// 30% of cells render above the letter, 70% below
export function buildLayerMap(rows: number, cols: number): LayerMap {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.random() < 0.3)
  );
}

// Precompute min Chebyshev distance from each cell to any drawn pixel.
// Returns a Float32Array of size rows*cols, values normalized 0..1.
export function buildDistanceMap(rows: number, cols: number, drawnPixels: { r: number; c: number }[]): Float32Array {
  const map = new Float32Array(rows * cols).fill(Infinity);
  for (const { r: sr, c: sc } of drawnPixels) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = Math.max(Math.abs(r - sr), Math.abs(c - sc));
        if (d < map[r * cols + c]) map[r * cols + c] = d;
      }
    }
  }
  // Normalize to 0..1
  let max = 0;
  for (let i = 0; i < map.length; i++) if (map[i] > max) max = map[i];
  if (max > 0) for (let i = 0; i < map.length; i++) map[i] /= max;
  return map;
}

// drawnPixels: list of {r,c,shape} positions the user has drawn
export function seed(rows: number, cols: number, drawnPixels: { r: number; c: number; shape: PixelShape }[]): GolState {
  const state = {} as GolState;

  // Detect which shapes are present on the artboard
  const presentShapes = [...new Set(drawnPixels.map(p => p.shape))];
  if (presentShapes.length === 0) return state;

  // Initialize a grid for each present shape
  for (const shape of presentShapes) state[shape] = makeGrid(rows, cols);

  // Distribute all drawn pixels evenly across present shapes
  const shuffled = [...drawnPixels].sort(() => Math.random() - 0.5);
  shuffled.forEach(({ r, c }, i) => {
    const shape = presentShapes[i % presentShapes.length];
    state[shape][r][c] = true;
  });

  return state;
}

function countNeighbors(grid: boolean[][], r: number, c: number): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc]) n++;
    }
  }
  return n;
}

// Per-shape birth/survival rules — each shape has its own GoL character
const SHAPE_RULES: Record<PixelShape, { born: number[]; survive: number[] }> = {
  square:   { born: [3], survive: [2, 3] },
  circle:   { born: [3], survive: [2, 3] },
  diamond:  { born: [3], survive: [2, 3] },
  triangle: { born: [3], survive: [2, 3] },
  cross:    { born: [3], survive: [2, 3] },
  star:     { born: [3], survive: [2, 3] },
};

// Step — each shape counts only its own neighbors, ripples independently like a water droplet
export function step(state: GolState): { next: GolState; births: number } {
  const shapes = Object.keys(state) as PixelShape[];
  const next = {} as GolState;
  let births = 0;

  for (const shape of shapes) {
    const grid = state[shape];
    const { born, survive } = SHAPE_RULES[shape];
    let layerBirths = 0;
    const nextGrid = Array.from({ length: grid.length }, (_, r) =>
      Array.from({ length: grid[0].length }, (_, c) => {
        const n = countNeighbors(grid, r, c);
        if (grid[r][c]) return survive.includes(n);
        if (born.includes(n)) { layerBirths++; return true; }
        return false;
      })
    );
    next[shape] = nextGrid;
    births += layerBirths;
  }
  return { next, births };
}
