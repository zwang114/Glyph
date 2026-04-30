import type { CanvasFrame } from '../types/canvas';
import type { PixelShape } from '../types/editor';

const SHAPE_COLOR: Record<PixelShape, string> = {
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
  above: boolean; // render above letter pixels?
  aboveShape?: PixelShape; // if set, also render this shape on top of letter pixel
  aboveColor?: string;
}

export type BloomGrid = BloomCell[][];

export function seedFromCanvas(frame: CanvasFrame): BloomGrid {
  const { gridHeight, gridWidth, pixels, pixelShapes, pixelShape } = frame;
  return Array.from({ length: gridHeight }, (_, r) =>
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
}

function countLiveNeighbors(grid: BloomGrid, r: number, c: number): { count: number; cells: BloomCell[] } {
  const rows = grid.length;
  const cols = grid[0].length;
  const cells: BloomCell[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].alive) {
        cells.push(grid[nr][nc]);
      }
    }
  }
  return { count: cells.length, cells };
}

function inheritAppearance(neighbors: BloomCell[]): { shape: PixelShape; color: string } {
  const shape = neighbors[Math.floor(Math.random() * neighbors.length)].shape;
  const color = SHAPE_COLOR[shape];
  return { shape, color };
}

export function step(grid: BloomGrid): BloomGrid {
  const rows = grid.length;
  const cols = grid[0].length;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cell = grid[r][c];
      if (cell.isLetterPixel) {
        const { count, cells } = countLiveNeighbors(grid, r, c);
        if (count === 3 && Math.random() < 0.3) {
          const { shape, color } = inheritAppearance(cells);
          return { ...cell, aboveShape: shape, aboveColor: color };
        }
        // Fade out aboveShape over time randomly
        if (cell.aboveShape && Math.random() < 0.1) {
          return { ...cell, aboveShape: undefined, aboveColor: undefined };
        }
        return cell;
      }
      const { count, cells } = countLiveNeighbors(grid, r, c);
      if (cell.alive) {
        const survives = count === 2 || count === 3 || count === 7;
        return survives ? cell : { alive: false, shape: cell.shape, color: cell.color, isLetterPixel: false, above: cell.above };
      } else {
        if (count === 3) {
          const { shape, color } = inheritAppearance(cells);
          return { alive: true, shape, color, isLetterPixel: false, above: Math.random() < 0.3 };
        }
        return cell;
      }
    })
  );
}

export function coverage(grid: BloomGrid): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let alive = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].alive) alive++;
    }
  }
  return alive / (rows * cols);
}

export function countNonLetterAlive(grid: BloomGrid): number {
  let count = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell.alive && !cell.isLetterPixel) count++;
    }
  }
  return count;
}
