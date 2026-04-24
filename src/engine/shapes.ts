import type { PixelShape } from '../types/editor';

/**
 * Draw a single pixel shape at grid cell (row, col).
 * `density` controls how much of the cell the shape fills (0.15–1.0).
 * `cellSize` is the pixel size of one grid cell on screen.
 * `ox`, `oy` are the grid origin offset.
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: PixelShape,
  row: number,
  col: number,
  cellSize: number,
  density: number,
  ox: number,
  oy: number
) {
  const cx = ox + col * cellSize + cellSize / 2;
  const cy = oy + row * cellSize + cellSize / 2;
  const size = cellSize * density;
  const half = size / 2;

  switch (shape) {
    case 'square': {
      // Rounded square — radius 1 unit per 8 (12.5% of side), scaled.
      const r = size / 8;
      ctx.beginPath();
      ctx.roundRect(cx - half, cy - half, size, size, r);
      ctx.fill();
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'diamond': {
      // Rotated rounded square: each corner has ~0.4 unit radius (per 8)
      // formed by a cubic bezier. Matches the supplied 8×8 SVG.
      //   M 3.21121 0.326726
      //   C 3.64685 -0.108909, 4.35315 -0.108909, 4.78879 0.326727
      //   L 7.67327 3.21121
      //   C 8.10891 3.64685, 8.10891 4.35315, 7.67327 4.78879
      //   L 4.78879 7.67327
      //   C 4.35315 8.10891, 3.64685 8.10891, 3.21121 7.67327
      //   L 0.326726 4.78879
      //   C -0.108909 4.35315, -0.108909 3.64685, 0.326727 3.21121
      //   Z
      const s = size / 8;
      const ox = cx - half;
      const oy = cy - half;
      const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      ctx.beginPath();
      let [x, y] = P(3.21121, 0.326726);
      ctx.moveTo(x, y);
      ([x, y] = P(4.78879, 0.326727));
      ctx.bezierCurveTo(...P(3.64685, -0.108909), ...P(4.35315, -0.108909), x, y);
      ([x, y] = P(7.67327, 3.21121));
      ctx.lineTo(x, y);
      ([x, y] = P(7.67327, 4.78879));
      ctx.bezierCurveTo(...P(8.10891, 3.64685), ...P(8.10891, 4.35315), x, y);
      ([x, y] = P(4.78879, 7.67327));
      ctx.lineTo(x, y);
      ([x, y] = P(3.21121, 7.67327));
      ctx.bezierCurveTo(...P(4.35315, 8.10891), ...P(3.64685, 8.10891), x, y);
      ([x, y] = P(0.326726, 4.78879));
      ctx.lineTo(x, y);
      ([x, y] = P(0.326727, 3.21121));
      ctx.bezierCurveTo(...P(-0.108909, 4.35315), ...P(-0.108909, 3.64685), x, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'triangle': {
      // Right triangle with rounded corners, right angle at bottom-left.
      // Vertices: top-left (0,0), bottom-left (0,8), bottom-right (8,8).
      // Matches the supplied 8×8 SVG.
      const s = size / 8;
      const ox = cx - half;
      const oy = cy - half;
      const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      ctx.beginPath();
      let [x, y] = P(7.83828, 7.06382);
      ctx.moveTo(x, y);
      ([x, y] = P(0.936184, 0.161723));
      ctx.lineTo(x, y);
      // round top-left
      ([x, y] = P(0, 0.549503));
      ctx.bezierCurveTo(...P(0.590709, -0.183752), ...P(0, 0.0609274), x, y);
      ([x, y] = P(0, 7.4516));
      ctx.lineTo(x, y);
      // round bottom-left
      ([x, y] = P(0.548404, 8));
      ctx.bezierCurveTo(...P(0, 7.75447), ...P(0.245529, 8), x, y);
      ([x, y] = P(7.4505, 8));
      ctx.lineTo(x, y);
      // round bottom-right back to start
      ([x, y] = P(7.83828, 7.06382));
      ctx.bezierCurveTo(...P(7.93907, 8), ...P(8.18375, 7.40929), x, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'star': {
      // 4-point "sparkle" star — one tip per corner with a small double-rounded
      // nub, concave pinched waists between points. Direct transcription of
      // the supplied 8×8 SVG: one closed path, 8 cubic bezier segments (4 outer
      // corner nubs + 4 inner waists) connected by diagonal lines.
      const s = size / 8;
      const ox = cx - half;
      const oy = cy - half;
      const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      ctx.beginPath();
      let [x, y] = P(6.4394, 0.146428);
      ctx.moveTo(x, y);
      // Top-right corner nub — convex bulge outside the top edge
      ([x, y] = P(7.14643, 0.146428));
      ctx.bezierCurveTo(...P(6.63466, -0.0488), ...P(6.95118, -0.0488), x, y);
      ([x, y] = P(7.85346, 0.853459));
      ctx.lineTo(x, y);
      ([x, y] = P(7.85346, 1.56049));
      ctx.bezierCurveTo(...P(8.04853, 1.04872), ...P(8.04863, 1.36528), x, y);
      // Diagonal inward toward right waist
      ([x, y] = P(6.12111, 3.29284));
      ctx.lineTo(x, y);
      // Right waist — concave arc pulled toward center (pinch)
      ([x, y] = P(6.12111, 4.70705));
      ctx.bezierCurveTo(...P(5.73059, 3.68336), ...P(5.73059, 4.31653), x, y);
      // Diagonal out to bottom-right corner nub
      ([x, y] = P(7.85346, 6.4394));
      ctx.lineTo(x, y);
      ([x, y] = P(7.85346, 7.14643));
      ctx.bezierCurveTo(...P(8.04854, 6.63466), ...P(8.04863, 6.95122), x, y);
      ([x, y] = P(7.14643, 7.85346));
      ctx.lineTo(x, y);
      ([x, y] = P(6.4394, 7.85346));
      ctx.bezierCurveTo(...P(6.95122, 8.04863), ...P(6.63466, 8.04853), x, y);
      // Diagonal inward to bottom waist
      ([x, y] = P(4.70705, 6.12111));
      ctx.lineTo(x, y);
      ([x, y] = P(3.29284, 6.12111));
      ctx.bezierCurveTo(...P(4.31653, 5.73059), ...P(3.68336, 5.73059), x, y);
      // Diagonal out to bottom-left corner nub
      ([x, y] = P(1.56049, 7.85346));
      ctx.lineTo(x, y);
      ([x, y] = P(0.853459, 7.85346));
      ctx.bezierCurveTo(...P(1.36528, 8.04862), ...P(1.04872, 8.04853), x, y);
      ([x, y] = P(0.146428, 7.14643));
      ctx.lineTo(x, y);
      ([x, y] = P(0.146428, 6.4394));
      ctx.bezierCurveTo(...P(-0.0488, 6.95118), ...P(-0.0488, 6.63466), x, y);
      // Diagonal inward to left waist
      ([x, y] = P(1.87877, 4.70705));
      ctx.lineTo(x, y);
      ([x, y] = P(1.87877, 3.29284));
      ctx.bezierCurveTo(...P(2.2693, 4.31653), ...P(2.2693, 3.68336), x, y);
      // Diagonal out to top-left corner nub
      ([x, y] = P(0.146428, 1.56049));
      ctx.lineTo(x, y);
      ([x, y] = P(0.146428, 0.853459));
      ctx.bezierCurveTo(...P(-0.0488, 1.36524), ...P(-0.0488, 1.04872), x, y);
      ([x, y] = P(0.853459, 0.146428));
      ctx.lineTo(x, y);
      ([x, y] = P(1.56049, 0.146428));
      ctx.bezierCurveTo(...P(1.04872, -0.0488), ...P(1.36524, -0.0488), x, y);
      // Diagonal inward to top waist
      ([x, y] = P(3.29284, 1.87877));
      ctx.lineTo(x, y);
      ([x, y] = P(4.70705, 1.87877));
      ctx.bezierCurveTo(...P(3.68336, 2.2693), ...P(4.31653, 2.2693), x, y);
      // Diagonal back to start
      ([x, y] = P(6.4394, 0.146428));
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cross': {
      // Rounded-corner plus/cross. Geometry is the supplied 8×8 SVG scaled
      // uniformly: size/8 per SVG unit, centered on (cx, cy). Coordinates
      // are translated so (0,0) in SVG space → (cx - half, cy - half).
      const s = size / 8;
      const ox = cx - half;
      const oy = cy - half;
      const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      ctx.beginPath();
      let [x, y] = P(5, 1.5);
      ctx.moveTo(x, y);
      // right spoke — top
      ([x, y] = P(6.5, 3));
      ctx.bezierCurveTo(...P(5, 2.32843), ...P(5.67157, 3), x, y);
      ([x, y] = P(7, 3));
      ctx.lineTo(x, y);
      ([x, y] = P(8, 4));
      ctx.bezierCurveTo(...P(7.55228, 3), ...P(8, 3.44772), x, y);
      // right spoke — bottom
      ([x, y] = P(7, 5));
      ctx.bezierCurveTo(...P(8, 4.55228), ...P(7.55228, 5), x, y);
      ([x, y] = P(6.5, 5));
      ctx.lineTo(x, y);
      ([x, y] = P(5, 6.5));
      ctx.bezierCurveTo(...P(5.67157, 5), ...P(5, 5.67157), x, y);
      // bottom spoke — right
      ([x, y] = P(5, 7));
      ctx.lineTo(x, y);
      ([x, y] = P(4, 8));
      ctx.bezierCurveTo(...P(5, 7.55228), ...P(4.55228, 8), x, y);
      // bottom spoke — left
      ([x, y] = P(3, 7));
      ctx.bezierCurveTo(...P(3.44772, 8), ...P(3, 7.55228), x, y);
      ([x, y] = P(3, 6.5));
      ctx.lineTo(x, y);
      ([x, y] = P(1.5, 5));
      ctx.bezierCurveTo(...P(3, 5.67157), ...P(2.32843, 5), x, y);
      // left spoke — bottom
      ([x, y] = P(1, 5));
      ctx.lineTo(x, y);
      ([x, y] = P(0, 4));
      ctx.bezierCurveTo(...P(0.44772, 5), ...P(0, 4.55228), x, y);
      // left spoke — top
      ([x, y] = P(1, 3));
      ctx.bezierCurveTo(...P(0, 3.44772), ...P(0.44772, 3), x, y);
      ([x, y] = P(1.5, 3));
      ctx.lineTo(x, y);
      ([x, y] = P(3, 1.5));
      ctx.bezierCurveTo(...P(2.32843, 3), ...P(3, 2.32843), x, y);
      // top spoke — left
      ([x, y] = P(3, 1));
      ctx.lineTo(x, y);
      ([x, y] = P(4, 0));
      ctx.bezierCurveTo(...P(3, 0.44772), ...P(3.44772, 0), x, y);
      // top spoke — right
      ([x, y] = P(5, 1));
      ctx.bezierCurveTo(...P(4.55228, 0), ...P(5, 0.44772), x, y);
      ([x, y] = P(5, 1.5));
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

/**
 * Generate an opentype.js-compatible path for a single pixel shape.
 * Returns an array of {cmd, x, y} instructions for building the path.
 * `pxSize` = font units per pixel cell.
 * `density` = shape fill ratio.
 */
export function shapeToPathCommands(
  shape: PixelShape,
  col: number,
  row: number,
  gridHeight: number,
  pxSize: number,
  density: number,
  descender: number,
  pixels?: boolean[][],
  gridWidth?: number
): { cmd: 'M' | 'L' | 'Q' | 'C' | 'Z'; args: number[] }[] {
  const cx = col * pxSize + pxSize / 2;
  const cy = (gridHeight - row) * pxSize + descender - pxSize / 2;
  const size = pxSize * density;
  const half = size / 2;

  switch (shape) {
    case 'square': {
      // Rounded square — radius = size / 8 (12.5% of side).
      const r = size / 8;
      const k = 0.5522847498 * r;
      const l = cx - half;
      const rt = cx + half;
      const tp = cy - half;
      const bt = cy + half;
      return [
        { cmd: 'M', args: [l + r, tp] },
        { cmd: 'L', args: [rt - r, tp] },
        { cmd: 'C', args: [rt - r + k, tp, rt, tp + r - k, rt, tp + r] },
        { cmd: 'L', args: [rt, bt - r] },
        { cmd: 'C', args: [rt, bt - r + k, rt - r + k, bt, rt - r, bt] },
        { cmd: 'L', args: [l + r, bt] },
        { cmd: 'C', args: [l + r - k, bt, l, bt - r + k, l, bt - r] },
        { cmd: 'L', args: [l, tp + r] },
        { cmd: 'C', args: [l, tp + r - k, l + r - k, tp, l + r, tp] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'circle': {
      // Approximate circle with 4 cubic bezier arcs
      const k = 0.5522847498 * half;
      return [
        { cmd: 'M', args: [cx, cy - half] },
        { cmd: 'C', args: [cx + k, cy - half, cx + half, cy - k, cx + half, cy] },
        { cmd: 'C', args: [cx + half, cy + k, cx + k, cy + half, cx, cy + half] },
        { cmd: 'C', args: [cx - k, cy + half, cx - half, cy + k, cx - half, cy] },
        { cmd: 'C', args: [cx - half, cy - k, cx - k, cy - half, cx, cy - half] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'diamond': {
      // Rounded diamond (rotated rounded square). Each corner traces a
      // small cubic bezier instead of being a sharp point.
      const s = size / 8;
      const ox = cx - half;
      const oy = cy - half;
      const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      return [
        { cmd: 'M', args: [...P(3.21121, 0.326726)] },
        { cmd: 'C', args: [...P(3.64685, -0.108909), ...P(4.35315, -0.108909), ...P(4.78879, 0.326727)] },
        { cmd: 'L', args: [...P(7.67327, 3.21121)] },
        { cmd: 'C', args: [...P(8.10891, 3.64685), ...P(8.10891, 4.35315), ...P(7.67327, 4.78879)] },
        { cmd: 'L', args: [...P(4.78879, 7.67327)] },
        { cmd: 'C', args: [...P(4.35315, 8.10891), ...P(3.64685, 8.10891), ...P(3.21121, 7.67327)] },
        { cmd: 'L', args: [...P(0.326726, 4.78879)] },
        { cmd: 'C', args: [...P(-0.108909, 4.35315), ...P(-0.108909, 3.64685), ...P(0.326727, 3.21121)] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'triangle': {
      // Right triangle with small rounded corners; right angle at
      // bottom-left. Matches the supplied 8×8 SVG.
      const s = size / 8;
      const ox = cx - half;
      const oy = cy - half;
      const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      return [
        { cmd: 'M', args: [...P(7.83828, 7.06382)] },
        { cmd: 'L', args: [...P(0.936184, 0.161723)] },
        { cmd: 'C', args: [...P(0.590709, -0.183752), ...P(0, 0.0609274), ...P(0, 0.549503)] },
        { cmd: 'L', args: [...P(0, 7.4516)] },
        { cmd: 'C', args: [...P(0, 7.75447), ...P(0.245529, 8), ...P(0.548404, 8)] },
        { cmd: 'L', args: [...P(7.4505, 8)] },
        { cmd: 'C', args: [...P(7.93907, 8), ...P(8.18375, 7.40929), ...P(7.83828, 7.06382)] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'star': {
      // 4-point sparkle star — single closed path. Font coords are y-up,
      // so we mirror each y via `(cy + half) - yFromSvg` where `yFromSvg` is
      // measured in the SVG's 0..8 y-down frame, scaled.
      const s = size / 8;
      const ox = cx - half;
      const topY = cy + half; // SVG y=0 maps here in font (y-up) space
      const P = (x: number, y: number): [number, number] => [ox + x * s, topY - y * s];
      return [
        { cmd: 'M', args: [...P(6.4394, 0.146428)] },
        // Top-right corner nub
        { cmd: 'C', args: [...P(6.63466, -0.0488), ...P(6.95118, -0.0488), ...P(7.14643, 0.146428)] },
        { cmd: 'L', args: [...P(7.85346, 0.853459)] },
        { cmd: 'C', args: [...P(8.04853, 1.04872), ...P(8.04863, 1.36528), ...P(7.85346, 1.56049)] },
        { cmd: 'L', args: [...P(6.12111, 3.29284)] },
        // Right waist
        { cmd: 'C', args: [...P(5.73059, 3.68336), ...P(5.73059, 4.31653), ...P(6.12111, 4.70705)] },
        { cmd: 'L', args: [...P(7.85346, 6.4394)] },
        // Bottom-right corner nub
        { cmd: 'C', args: [...P(8.04854, 6.63466), ...P(8.04863, 6.95122), ...P(7.85346, 7.14643)] },
        { cmd: 'L', args: [...P(7.14643, 7.85346)] },
        { cmd: 'C', args: [...P(6.95122, 8.04863), ...P(6.63466, 8.04853), ...P(6.4394, 7.85346)] },
        { cmd: 'L', args: [...P(4.70705, 6.12111)] },
        // Bottom waist
        { cmd: 'C', args: [...P(4.31653, 5.73059), ...P(3.68336, 5.73059), ...P(3.29284, 6.12111)] },
        { cmd: 'L', args: [...P(1.56049, 7.85346)] },
        // Bottom-left corner nub
        { cmd: 'C', args: [...P(1.36528, 8.04862), ...P(1.04872, 8.04853), ...P(0.853459, 7.85346)] },
        { cmd: 'L', args: [...P(0.146428, 7.14643)] },
        { cmd: 'C', args: [...P(-0.0488, 6.95118), ...P(-0.0488, 6.63466), ...P(0.146428, 6.4394)] },
        { cmd: 'L', args: [...P(1.87877, 4.70705)] },
        // Left waist
        { cmd: 'C', args: [...P(2.2693, 4.31653), ...P(2.2693, 3.68336), ...P(1.87877, 3.29284)] },
        { cmd: 'L', args: [...P(0.146428, 1.56049)] },
        // Top-left corner nub
        { cmd: 'C', args: [...P(-0.0488, 1.36524), ...P(-0.0488, 1.04872), ...P(0.146428, 0.853459)] },
        { cmd: 'L', args: [...P(0.853459, 0.146428)] },
        { cmd: 'C', args: [...P(1.04872, -0.0488), ...P(1.36524, -0.0488), ...P(1.56049, 0.146428)] },
        { cmd: 'L', args: [...P(3.29284, 1.87877)] },
        // Top waist
        { cmd: 'C', args: [...P(3.68336, 2.2693), ...P(4.31653, 2.2693), ...P(4.70705, 1.87877)] },
        { cmd: 'L', args: [...P(6.4394, 0.146428)] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'cross': {
      // Rounded-corner plus/cross — supplied 8×8 SVG scaled to fill the cell.
      // Coordinates translated so SVG (0,0) → (cx - half, cy - half).
      const s = size / 8;
      const ox = cx - half;
      const oy = cy - half;
      const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      return [
        { cmd: 'M', args: [...P(5, 1.5)] },
        { cmd: 'C', args: [...P(5, 2.32843), ...P(5.67157, 3), ...P(6.5, 3)] },
        { cmd: 'L', args: [...P(7, 3)] },
        { cmd: 'C', args: [...P(7.55228, 3), ...P(8, 3.44772), ...P(8, 4)] },
        { cmd: 'C', args: [...P(8, 4.55228), ...P(7.55228, 5), ...P(7, 5)] },
        { cmd: 'L', args: [...P(6.5, 5)] },
        { cmd: 'C', args: [...P(5.67157, 5), ...P(5, 5.67157), ...P(5, 6.5)] },
        { cmd: 'L', args: [...P(5, 7)] },
        { cmd: 'C', args: [...P(5, 7.55228), ...P(4.55228, 8), ...P(4, 8)] },
        { cmd: 'C', args: [...P(3.44772, 8), ...P(3, 7.55228), ...P(3, 7)] },
        { cmd: 'L', args: [...P(3, 6.5)] },
        { cmd: 'C', args: [...P(3, 5.67157), ...P(2.32843, 5), ...P(1.5, 5)] },
        { cmd: 'L', args: [...P(1, 5)] },
        { cmd: 'C', args: [...P(0.44772, 5), ...P(0, 4.55228), ...P(0, 4)] },
        { cmd: 'C', args: [...P(0, 3.44772), ...P(0.44772, 3), ...P(1, 3)] },
        { cmd: 'L', args: [...P(1.5, 3)] },
        { cmd: 'C', args: [...P(2.32843, 3), ...P(3, 2.32843), ...P(3, 1.5)] },
        { cmd: 'L', args: [...P(3, 1)] },
        { cmd: 'C', args: [...P(3, 0.44772), ...P(3.44772, 0), ...P(4, 0)] },
        { cmd: 'C', args: [...P(4.55228, 0), ...P(5, 0.44772), ...P(5, 1)] },
        { cmd: 'Z', args: [] },
      ];
    }
    default:
      return [];
  }
}
