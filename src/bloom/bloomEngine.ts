import type { CanvasFrame } from '../types/canvas';
import type { PixelShape } from '../types/editor';

export const SHAPE_COLOR: Record<PixelShape, string> = {
  square:   '#F5C518',
  circle:   '#E8651A',
  diamond:  '#E63946',
  triangle: '#FF69B4',
  cross:    '#7CB87C',
  star:     '#6B9AB8',
};

export interface BloomCell {
  alive: boolean;
  shape: PixelShape;
  color: string;
  isLetterPixel: boolean;
  above: boolean;
  aboveShape?: PixelShape;
  aboveColor?: string;
}

export type BloomGrid = BloomCell[][];

// Internal: one boolean layer per shape
type ShapeLayer = boolean[][];
type LayerMap = Partial<Record<PixelShape, ShapeLayer>>;

export interface BloomState {
  grid: BloomGrid;       // render grid (letter pixels + metadata)
  layers: LayerMap;      // independent GoL layer per shape
}

function makeLayer(rows: number, cols: number): ShapeLayer {
  return Array.from({ length: rows }, () => new Array(cols).fill(false));
}

function countNeighbors(layer: ShapeLayer, r: number, c: number): number {
  const rows = layer.length;
  const cols = layer[0].length;
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && layer[nr][nc]) n++;
    }
  }
  return n;
}

export function seedFromCanvas(frame: CanvasFrame): BloomState {
  const { gridHeight, gridWidth, pixels, pixelShapes, pixelShape } = frame;

  // Build render grid (letter pixels only)
  const grid: BloomGrid = Array.from({ length: gridHeight }, (_, r) =>
    Array.from({ length: gridWidth }, (_, c) => {
      if (pixels[r]?.[c]) {
        return {
          alive: true,
          shape: pixelShapes?.[r]?.[c] ?? pixelShape,
          color: '#1a1a1a',
          isLetterPixel: true,
          above: false,
        };
      }
      return { alive: false, shape: 'square' as PixelShape, color: '#1a1a1a', isLetterPixel: false, above: false };
    })
  );

  // Detect which shapes are present
  const presentShapes = new Set<PixelShape>();
  for (let r = 0; r < gridHeight; r++)
    for (let c = 0; c < gridWidth; c++)
      if (pixels[r]?.[c]) presentShapes.add(pixelShapes?.[r]?.[c] ?? pixelShape);

  // Seed each shape layer from letter pixel positions, distributed evenly
  const layers: LayerMap = {};
  const letterPixels: { r: number; c: number }[] = [];
  for (let r = 0; r < gridHeight; r++)
    for (let c = 0; c < gridWidth; c++)
      if (pixels[r]?.[c]) letterPixels.push({ r, c });

  const shapes = [...presentShapes];
  for (const shape of shapes) layers[shape] = makeLayer(gridHeight, gridWidth);

  const shuffled = [...letterPixels].sort(() => Math.random() - 0.5);
  shuffled.forEach(({ r, c }, i) => {
    const shape = shapes[i % shapes.length];
    layers[shape]![r][c] = true;
  });

  return { grid, layers };
}

export function step(state: BloomState): BloomState {
  const { grid, layers } = state;
  const rows = grid.length;
  const cols = grid[0].length;
  const shapes = Object.keys(layers) as PixelShape[];

  // Step each shape layer independently (B3/S237)
  const nextLayers: LayerMap = {};
  for (const shape of shapes) {
    const layer = layers[shape]!;
    nextLayers[shape] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        // Letter pixels always alive in their own layer
        if (grid[r][c].isLetterPixel && grid[r][c].shape === shape) return true;
        const n = countNeighbors(layer, r, c);
        if (layer[r][c]) return n === 2 || n === 3 || n === 7;
        return n === 3;
      })
    );
  }

  // Rebuild render grid from layers
  const nextGrid: BloomGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cell = grid[r][c];

      if (cell.isLetterPixel) {
        // Check if any shape layer has a birth at this position → aboveShape
        let aboveShape: PixelShape | undefined;
        let aboveColor: string | undefined;
        for (const shape of shapes) {
          if (nextLayers[shape]![r][c] && grid[r][c].shape !== shape) {
            if (Math.random() < 0.3) {
              aboveShape = shape;
              aboveColor = SHAPE_COLOR[shape];
            }
            break;
          }
        }
        // Fade existing aboveShape
        if (!aboveShape && cell.aboveShape && Math.random() < 0.1) {
          return { ...cell, aboveShape: undefined, aboveColor: undefined };
        }
        return aboveShape ? { ...cell, aboveShape, aboveColor } : cell;
      }

      // Non-letter cell: any shape alive here renders (all overlap freely)
      const aliveShapes = shapes.filter(s => nextLayers[s]![r][c]);
      if (aliveShapes.length > 0) {
        // Pick a random alive shape to represent this cell this frame
        const shape = aliveShapes[Math.floor(Math.random() * aliveShapes.length)];
        const above = cell.alive && cell.shape === shape ? cell.above : Math.random() < 0.3;
        return { alive: true, shape, color: SHAPE_COLOR[shape], isLetterPixel: false, above };
      }
      return { ...cell, alive: false };
    })
  );

  return { grid: nextGrid, layers: nextLayers };
}

export function coverage(state: BloomState): number {
  const { grid } = state;
  const rows = grid.length, cols = grid[0].length;
  let alive = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c].alive) alive++;
  return alive / (rows * cols);
}

export function countNonLetterAlive(state: BloomState): number {
  let count = 0;
  for (let r = 0; r < state.grid.length; r++)
    for (let c = 0; c < state.grid[r].length; c++) {
      const cell = state.grid[r][c];
      if (cell.alive && !cell.isLetterPixel) count++;
    }
  return count;
}
