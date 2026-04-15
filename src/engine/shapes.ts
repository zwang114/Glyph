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
      ctx.fillRect(cx - half, cy - half, size, size);
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy);
      ctx.lineTo(cx, cy + half);
      ctx.lineTo(cx - half, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'triangle': {
      const h = half * Math.sqrt(3);
      ctx.beginPath();
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + h * 0.6, cy + half * 0.8);
      ctx.lineTo(cx - h * 0.6, cy + half * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'metaball':
      // Metaballs are drawn as a batch in drawMetaballs(), not per-pixel
      break;
  }
}

/**
 * Draw all filled pixels as metaballs — smooth organic blobs that merge.
 * Uses a scalar field evaluated per screen pixel, thresholded to create
 * the isosurface. Expensive but visually striking.
 */
export function drawMetaballs(
  ctx: CanvasRenderingContext2D,
  pixels: boolean[][],
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  density: number,
  ox: number,
  oy: number
) {
  const totalW = gridWidth * cellSize;
  const totalH = gridHeight * cellSize;

  // Collect filled cell centers
  const balls: { x: number; y: number }[] = [];
  for (let r = 0; r < gridHeight; r++) {
    for (let c = 0; c < gridWidth; c++) {
      if (pixels[r]?.[c]) {
        balls.push({
          x: ox + c * cellSize + cellSize / 2,
          y: oy + r * cellSize + cellSize / 2,
        });
      }
    }
  }

  if (balls.length === 0) return;

  // Radius of influence for each ball — controlled by density
  const radius = cellSize * density * 0.65;
  const radiusSq = radius * radius;
  const threshold = 1.0;

  // Sample resolution — every 2 screen pixels for performance
  const step = Math.max(1, Math.floor(cellSize / 6));
  const imgW = Math.ceil(totalW / step);
  const imgH = Math.ceil(totalH / step);

  const imageData = ctx.createImageData(imgW, imgH);
  const data = imageData.data;

  for (let py = 0; py < imgH; py++) {
    const sy = oy + py * step;
    for (let px = 0; px < imgW; px++) {
      const sx = ox + px * step;

      // Evaluate scalar field: sum of 1/dist^2 for each ball
      let field = 0;
      for (let i = 0; i < balls.length; i++) {
        const dx = sx - balls[i].x;
        const dy = sy - balls[i].y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 0.01) {
          field = threshold + 1;
          break;
        }
        field += radiusSq / distSq;
      }

      if (field >= threshold) {
        const idx = (py * imgW + px) * 4;
        data[idx] = 255;     // R
        data[idx + 1] = 255; // G
        data[idx + 2] = 255; // B
        data[idx + 3] = 255; // A
      }
    }
  }

  // Draw the computed field scaled up to the actual canvas size
  const offscreen = new OffscreenCanvas(imgW, imgH);
  const offCtx = offscreen.getContext('2d')!;
  offCtx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, ox, oy, totalW, totalH);
  ctx.imageSmoothingEnabled = true;
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
      return [
        { cmd: 'M', args: [cx - half, cy - half] },
        { cmd: 'L', args: [cx + half, cy - half] },
        { cmd: 'L', args: [cx + half, cy + half] },
        { cmd: 'L', args: [cx - half, cy + half] },
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
      return [
        { cmd: 'M', args: [cx, cy - half] },
        { cmd: 'L', args: [cx + half, cy] },
        { cmd: 'L', args: [cx, cy + half] },
        { cmd: 'L', args: [cx - half, cy] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'triangle': {
      const h = half * Math.sqrt(3);
      return [
        { cmd: 'M', args: [cx, cy + half] },
        { cmd: 'L', args: [cx + h * 0.6, cy - half * 0.8] },
        { cmd: 'L', args: [cx - h * 0.6, cy - half * 0.8] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'metaball': {
      // For metaball export, we use marching squares on the scalar field
      // to generate vector outlines. Fallback to circles for now.
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
    default:
      return [];
  }
}
