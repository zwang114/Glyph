import { useRef, useEffect, useCallback } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useEditorStore } from '../stores/editorStore';
import { useAudioStore } from '../stores/audioStore';
import { playPixel } from '../audio/audioEngine';
import type { CanvasFrame } from '../types/canvas';
import type { MirrorMode } from '../types/editor';
import { drawShape, drawMetaballs } from '../engine/shapes';

// ─────────────────────────────────────────────────────────────────────
// Visual constants
// ─────────────────────────────────────────────────────────────────────
const BG_COLOR = '#E9D9CB'; // workspace page bg
const CANVAS_FILL_COLOR = '#DDC9B6';
const GRID_DOT_COLOR = '#2A2A2A'; // paired with 'difference' blend
const PIXEL_COLOR = '#1a1a1a';
const HOVER_COLOR = 'rgba(0, 0, 0, 0.08)';
const SELECTION_OUTLINE = '#1a1a1a';
const HOVER_OUTLINE = 'rgba(26, 26, 26, 0.25)';
const CANVAS_CORNER_RADIUS = 8;

// Tab (top-right of each canvas) — mimics drawer tab visual language.
const TAB_WIDTH = 48;
const TAB_HEIGHT = 20;
const TAB_OFFSET_Y = -TAB_HEIGHT; // sits just above the canvas
const TAB_FILL = '#1a1a1a';
const TAB_STROKE = '#1a1a1a';

// + affordances for creating sibling canvases (Framer-style)
const PLUS_BUTTON_RADIUS = 14;
const PLUS_BUTTON_OFFSET = 32; // distance from canvas edge to button center
const PLUS_FILL = 'rgba(26, 26, 26, 0.85)';
const PLUS_ICON_COLOR = '#E9D9CB';

// Interaction thresholds
const DRAG_START_PX = 3; // must move this far before a drag becomes a drag

// Edge/corner resize hit zones — 6px band straddling each edge (half inside,
// half outside the frame). Corners use an 8px square at each corner.
const RESIZE_EDGE_HIT = 6;
const RESIZE_CORNER_HIT = 8;

type PlusDir = 'up' | 'down' | 'left' | 'right';
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface FrameBounds {
  id: string;
  x: number; // screen space (after viewport transform)
  y: number;
  w: number;
  h: number;
  cellSize: number;
}

export function PixelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Drawing state (per pointer-down interaction)
  const drawingRef = useRef(false);
  const drawValueRef = useRef(true);
  const drawCanvasIdRef = useRef<string | null>(null);
  const lastCellRef = useRef<{ row: number; col: number } | null>(null);
  const hoverCellRef = useRef<{ canvasId: string; row: number; col: number } | null>(null);
  const hoverCanvasIdRef = useRef<string | null>(null);
  const lineStartRef = useRef<{ row: number; col: number } | null>(null);
  const rectStartRef = useRef<{ row: number; col: number } | null>(null);

  // Viewport pan (spacebar + drag)
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const spaceHeldRef = useRef(false);

  // Canvas drag / duplicate (pointer on tab)
  const draggingCanvasRef = useRef<{
    id: string;
    // original position in world coords
    origX: number;
    origY: number;
    // pointer start in screen coords
    startSx: number;
    startSy: number;
    // whether alt is held (duplicate mode)
    isDuplicate: boolean;
    // has the drag exceeded the start threshold?
    started: boolean;
    // duplicate-mode: the ID of the temp duplicated canvas (created on first movement)
    dupId: string | null;
  } | null>(null);

  // Canvas edge/corner resize
  const resizingRef = useRef<{
    id: string;
    handle: ResizeHandle;
    // Original frame state (world coords + grid dims)
    origX: number;
    origY: number;
    origGridW: number;
    origGridH: number;
    // Snapshot of pixels at drag start — every move reconstructs from
    // this so repeated resize calls are idempotent.
    origPixels: boolean[][];
    origPixelShapes: (import('../types/editor').PixelShape | null)[][] | undefined;
    // Pointer start in screen coords
    startSx: number;
    startSy: number;
    // Has the drag begun (past DRAG_START_PX)?
    started: boolean;
  } | null>(null);

  // Cached per-frame bounds for hit-testing (recomputed on each draw)
  const frameBoundsRef = useRef<FrameBounds[]>([]);

  // ───────────────────────────────────────────────────────────────────
  // Coordinate helpers
  // ───────────────────────────────────────────────────────────────────

  /** Screen → world coords (invert viewport transform). */
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const { viewport } = useCanvasStore.getState();
    return {
      x: (sx - viewport.x) / viewport.zoom,
      y: (sy - viewport.y) / viewport.zoom,
    };
  }, []);

  /**
   * Per-frame cell size. A canvas frame's pixel cell is sized so the
   * *canvas itself* has a base display size that feels comfortable. We
   * use a fixed per-cell world-unit size so all canvases scale together
   * under the global viewport zoom.
   */
  const getCellSize = useCallback((frame: CanvasFrame) => {
    // 1 cell = 16 world units. Viewport.zoom scales everything uniformly.
    const WORLD_CELL = 16;
    return WORLD_CELL * useCanvasStore.getState().viewport.zoom;
  }, []);

  /** Screen-space origin (top-left) of a canvas frame. */
  const getFrameOrigin = useCallback((frame: CanvasFrame) => {
    const { viewport } = useCanvasStore.getState();
    return {
      x: frame.position.x * viewport.zoom + viewport.x,
      y: frame.position.y * viewport.zoom + viewport.y,
    };
  }, []);

  /** Find which frame a screen point falls inside (interior hit). */
  const frameAtScreen = useCallback((sx: number, sy: number): FrameBounds | null => {
    // iterate in reverse z-order (topmost first)
    const bounds = frameBoundsRef.current;
    for (let i = bounds.length - 1; i >= 0; i--) {
      const b = bounds[i];
      if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
        return b;
      }
    }
    return null;
  }, []);

  /** Convert a screen point to a cell within a given frame. */
  const screenToCell = useCallback(
    (sx: number, sy: number, bounds: FrameBounds, frame: CanvasFrame) => {
      const col = Math.floor((sx - bounds.x) / bounds.cellSize);
      const row = Math.floor((sy - bounds.y) / bounds.cellSize);
      if (row >= 0 && row < frame.gridHeight && col >= 0 && col < frame.gridWidth) {
        return { row, col };
      }
      return null;
    },
    []
  );

  /** Tab rect (screen coords) for a given frame. */
  const getTabRect = useCallback((b: FrameBounds) => {
    return {
      x: b.x + b.w - TAB_WIDTH,
      y: b.y + TAB_OFFSET_Y,
      w: TAB_WIDTH,
      h: TAB_HEIGHT,
    };
  }, []);

  /** Plus button centers (screen coords) for a selected frame. */
  const getPlusButtons = useCallback(
    (b: FrameBounds): { dir: PlusDir; x: number; y: number }[] => [
      { dir: 'up', x: b.x + b.w / 2, y: b.y - PLUS_BUTTON_OFFSET - TAB_HEIGHT },
      { dir: 'down', x: b.x + b.w / 2, y: b.y + b.h + PLUS_BUTTON_OFFSET },
      { dir: 'left', x: b.x - PLUS_BUTTON_OFFSET, y: b.y + b.h / 2 },
      { dir: 'right', x: b.x + b.w + PLUS_BUTTON_OFFSET, y: b.y + b.h / 2 },
    ],
    []
  );

  /** Hit-test: is point (sx,sy) inside a rect? */
  const pointInRect = (
    sx: number,
    sy: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ) => sx >= rx && sx <= rx + rw && sy >= ry && sy <= ry + rh;

  const pointInCircle = (sx: number, sy: number, cx: number, cy: number, r: number) => {
    const dx = sx - cx;
    const dy = sy - cy;
    return dx * dx + dy * dy <= r * r;
  };

  /**
   * Test whether a screen point falls on one of the 8 resize handles of a
   * frame. Corners take priority over edges where the two regions overlap.
   * Returns the matched handle or null.
   *
   * Hit regions (all screen-space):
   *  - Corners: RESIZE_CORNER_HIT square centered on each corner
   *  - Edges:   RESIZE_EDGE_HIT-thick band straddling each edge, excluding
   *             the corner squares so corner cursors stay sticky.
   */
  const resizeHandleAt = useCallback(
    (sx: number, sy: number, b: FrameBounds): ResizeHandle | null => {
      const ce = RESIZE_CORNER_HIT;
      const eh = RESIZE_EDGE_HIT / 2;
      // Corners first
      if (Math.abs(sx - b.x) <= ce && Math.abs(sy - b.y) <= ce) return 'nw';
      if (Math.abs(sx - (b.x + b.w)) <= ce && Math.abs(sy - b.y) <= ce) return 'ne';
      if (Math.abs(sx - b.x) <= ce && Math.abs(sy - (b.y + b.h)) <= ce) return 'sw';
      if (
        Math.abs(sx - (b.x + b.w)) <= ce &&
        Math.abs(sy - (b.y + b.h)) <= ce
      )
        return 'se';
      // Edges — point must be within the edge band AND between the two
      // corner exclusion zones on that side.
      const onTop = Math.abs(sy - b.y) <= eh;
      const onBot = Math.abs(sy - (b.y + b.h)) <= eh;
      const onLeft = Math.abs(sx - b.x) <= eh;
      const onRight = Math.abs(sx - (b.x + b.w)) <= eh;
      const withinX = sx >= b.x + ce && sx <= b.x + b.w - ce;
      const withinY = sy >= b.y + ce && sy <= b.y + b.h - ce;
      if (onTop && withinX) return 'n';
      if (onBot && withinX) return 's';
      if (onLeft && withinY) return 'w';
      if (onRight && withinY) return 'e';
      return null;
    },
    []
  );

  const cursorForHandle = (h: ResizeHandle): string => {
    switch (h) {
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'nw':
      case 'se':
        return 'nwse-resize';
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // Mirror + line (Bresenham) helpers — reused from previous single-canvas
  // ───────────────────────────────────────────────────────────────────

  const getMirrorCells = useCallback(
    (row: number, col: number, frame: CanvasFrame, mode: MirrorMode) => {
      const cells: { row: number; col: number }[] = [{ row, col }];
      if (mode === 'horizontal' || mode === 'both')
        cells.push({ row, col: frame.gridWidth - 1 - col });
      if (mode === 'vertical' || mode === 'both')
        cells.push({ row: frame.gridHeight - 1 - row, col });
      if (mode === 'both')
        cells.push({ row: frame.gridHeight - 1 - row, col: frame.gridWidth - 1 - col });
      return cells;
    },
    []
  );

  // Expand a single cell into the brush "stamp" block aligned to the
  // center-radiating brush grid. The block containing (row, col) is the
  // NxN square whose grid lines pass through the canvas center.
  const getBrushCells = useCallback(
    (row: number, col: number, frame: CanvasFrame) => {
      const n = Math.max(1, useEditorStore.getState().brushSize);
      if (n === 1) return [{ row, col }];
      const cx = frame.gridWidth / 2;
      const cy = frame.gridHeight / 2;
      const blockCol0 = Math.floor((col - cx) / n) * n + Math.floor(cx);
      const blockRow0 = Math.floor((row - cy) / n) * n + Math.floor(cy);
      const cells: { row: number; col: number }[] = [];
      for (let r = blockRow0; r < blockRow0 + n; r++) {
        for (let c = blockCol0; c < blockCol0 + n; c++) {
          if (r >= 0 && r < frame.gridHeight && c >= 0 && c < frame.gridWidth) {
            cells.push({ row: r, col: c });
          }
        }
      }
      return cells;
    },
    []
  );

  const getLineCells = useCallback(
    (r1: number, c1: number, r2: number, c2: number) => {
      const cells: { row: number; col: number }[] = [];
      let x0 = c1, y0 = r1;
      const x1 = c2, y1 = r2;
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      while (true) {
        cells.push({ row: y0, col: x0 });
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
      return cells;
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────
  // Rendering
  // ───────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const {
      canvases,
      canvasOrder,
      selectedCanvasId,
      viewport,
    } = useCanvasStore.getState();
    const { showGrid } = useEditorStore.getState();

    const dpr = devicePixelRatio;
    const canvasW = canvas.width / dpr;
    const canvasH = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Fill workspace background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Compute + cache frame bounds for hit-testing
    const bounds: FrameBounds[] = [];
    for (const id of canvasOrder) {
      const frame = canvases[id];
      if (!frame) continue;
      const origin = getFrameOrigin(frame);
      const cellSize = getCellSize(frame);
      bounds.push({
        id,
        x: origin.x,
        y: origin.y,
        w: frame.gridWidth * cellSize,
        h: frame.gridHeight * cellSize,
        cellSize,
      });
    }
    frameBoundsRef.current = bounds;

    // Draw each canvas frame
    for (let i = 0; i < canvasOrder.length; i++) {
      const id = canvasOrder[i];
      const frame = canvases[id];
      if (!frame) continue;
      const b = bounds[i];

      drawFrame(ctx, frame, b, id === selectedCanvasId, id === hoverCanvasIdRef.current, showGrid);
    }

    // Draw ghost for duplicate-in-progress (under cursor)
    const drag = draggingCanvasRef.current;
    if (drag && drag.isDuplicate && drag.dupId) {
      const frame = canvases[drag.dupId];
      if (frame) {
        const b = bounds.find((b) => b.id === drag.dupId);
        if (b) {
          ctx.save();
          ctx.globalAlpha = 0.7;
          // already drawn in the main loop — nothing extra needed
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }, [getCellSize, getFrameOrigin]);

  /** Draw a single frame (fill, dots, pixels, hover preview, selection chrome). */
  const drawFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      frame: CanvasFrame,
      b: FrameBounds,
      isSelected: boolean,
      isHovered: boolean,
      showGrid: boolean
    ) => {
      const { activeTool } = useEditorStore.getState();

      // ── Canvas fill (rounded) ────────────────────────────────────
      ctx.fillStyle = CANVAS_FILL_COLOR;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, CANVAS_CORNER_RADIUS);
      ctx.fill();

      // ── Dot grid (clipped + difference blend) ────────────────────
      if (showGrid) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, CANVAS_CORNER_RADIUS);
        ctx.clip();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = GRID_DOT_COLOR;
        const dotRadius = 1;
        // Dots sit at cell corners anchored to the top-left of the canvas,
        // matching the pixel-cell grid exactly. This keeps dots aligned
        // with cell boundaries regardless of grid parity after resize.
        // Grid density is fixed — it represents the canvas's own cell grid
        // and is intentionally independent of the current brush size.
        const step = b.cellSize;
        for (let y = b.y; y <= b.y + b.h + 0.5; y += step) {
          for (let x = b.x; x <= b.x + b.w + 0.5; x += step) {
            ctx.beginPath();
            ctx.arc(Math.round(x), Math.round(y), dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // ── Onion skin (per-canvas) ──────────────────────────────────
      if (frame.onionSkinEnabled && frame.letter) {
        const fontSize = b.h * frame.onionSkinSize;
        ctx.save();
        ctx.font = `${fontSize}px ${frame.onionSkinFont}`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'center';
        const metrics = ctx.measureText(frame.letter);
        const glyphTop = metrics.actualBoundingBoxAscent;
        const glyphBottom = metrics.actualBoundingBoxDescent;
        const glyphVisualH = glyphTop + glyphBottom;
        const centerX = b.x + b.w / 2;
        const centerY = b.y + b.h / 2 + (glyphTop - glyphVisualH / 2);
        ctx.fillText(frame.letter, centerX, centerY);
        ctx.restore();
      }

      // ── Filled pixels ────────────────────────────────────────────
      // Each cell renders with the shape it was painted with (frame.pixelShapes),
      // falling back to the canvas's active brush shape for legacy cells / any
      // cell missing per-pixel metadata. This lets a canvas contain a mix of
      // shapes — changing the active shape doesn't touch existing pixels.
      ctx.fillStyle = PIXEL_COLOR;
      const perCellShapes = frame.pixelShapes;
      // Metaball is a whole-canvas effect: if ANY cell was painted with
      // metaball, group those cells and render them as metaballs; render
      // non-metaball cells as their own shapes alongside.
      // Build a metaball mask and a per-shape list.
      let hasMetaball = false;
      const metaballMask: boolean[][] = Array.from(
        { length: frame.gridHeight },
        () => Array(frame.gridWidth).fill(false)
      );
      for (let r = 0; r < frame.gridHeight; r++) {
        for (let c = 0; c < frame.gridWidth; c++) {
          if (!frame.pixels[r][c]) continue;
          const cellShape = perCellShapes?.[r]?.[c] ?? frame.pixelShape;
          if (cellShape === 'metaball') {
            metaballMask[r][c] = true;
            hasMetaball = true;
          } else {
            drawShape(ctx, cellShape, r, c, b.cellSize, frame.pixelDensity, b.x, b.y);
          }
        }
      }
      if (hasMetaball) {
        drawMetaballs(
          ctx,
          metaballMask,
          frame.gridWidth,
          frame.gridHeight,
          b.cellSize,
          frame.pixelDensity,
          b.x,
          b.y
        );
      }

      // ── Hover preview (only on selected canvas) ──────────────────
      const hover = hoverCellRef.current;
      if (isSelected && hover && hover.canvasId === frame.id && !drawingRef.current) {
        ctx.fillStyle = HOVER_COLOR;
        const mirrored = getMirrorCells(hover.row, hover.col, frame, frame.mirrorMode);
        for (const mc of mirrored) {
          for (const cell of getBrushCells(mc.row, mc.col, frame)) {
            if (!frame.pixels[cell.row]?.[cell.col]) {
              drawShape(
                ctx,
                frame.pixelShape === 'metaball' ? 'circle' : frame.pixelShape,
                cell.row,
                cell.col,
                b.cellSize,
                frame.pixelDensity,
                b.x,
                b.y
              );
            }
          }
        }
      }

      // ── Line/rect preview during drag (only on selected canvas) ─
      if (
        isSelected &&
        drawingRef.current &&
        drawCanvasIdRef.current === frame.id &&
        hover &&
        hover.canvasId === frame.id
      ) {
        ctx.fillStyle = HOVER_COLOR;
        if (activeTool === 'line' && lineStartRef.current) {
          const cells = getLineCells(
            lineStartRef.current.row,
            lineStartRef.current.col,
            hover.row,
            hover.col
          );
          for (const cell of cells) {
            if (
              cell.row >= 0 &&
              cell.row < frame.gridHeight &&
              cell.col >= 0 &&
              cell.col < frame.gridWidth
            ) {
              drawShape(
                ctx,
                frame.pixelShape === 'metaball' ? 'circle' : frame.pixelShape,
                cell.row,
                cell.col,
                b.cellSize,
                frame.pixelDensity,
                b.x,
                b.y
              );
            }
          }
        }
        if (activeTool === 'rect' && rectStartRef.current) {
          const minR = Math.min(rectStartRef.current.row, hover.row);
          const maxR = Math.max(rectStartRef.current.row, hover.row);
          const minC = Math.min(rectStartRef.current.col, hover.col);
          const maxC = Math.max(rectStartRef.current.col, hover.col);
          for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
              if (r >= 0 && r < frame.gridHeight && c >= 0 && c < frame.gridWidth) {
                drawShape(
                  ctx,
                  frame.pixelShape === 'metaball' ? 'circle' : frame.pixelShape,
                  r,
                  c,
                  b.cellSize,
                  frame.pixelDensity,
                  b.x,
                  b.y
                );
              }
            }
          }
        }
      }

      // ── Mirror axis lines (on selected only) ─────────────────────
      if (isSelected && frame.mirrorMode !== 'none') {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        if (frame.mirrorMode === 'horizontal' || frame.mirrorMode === 'both') {
          const midX = b.x + b.w / 2;
          ctx.beginPath();
          ctx.moveTo(midX, b.y);
          ctx.lineTo(midX, b.y + b.h);
          ctx.stroke();
        }
        if (frame.mirrorMode === 'vertical' || frame.mirrorMode === 'both') {
          const midY = b.y + b.h / 2;
          ctx.beginPath();
          ctx.moveTo(b.x, midY);
          ctx.lineTo(b.x + b.w, midY);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // ── Selection / hover outline ────────────────────────────────
      if (isSelected) {
        ctx.strokeStyle = SELECTION_OUTLINE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(b.x - 0.5, b.y - 0.5, b.w + 1, b.h + 1, CANVAS_CORNER_RADIUS);
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = HOVER_OUTLINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(b.x - 0.5, b.y - 0.5, b.w + 1, b.h + 1, CANVAS_CORNER_RADIUS);
        ctx.stroke();
      }

      // ── Letter label (top-left of canvas) ────────────────────────
      if (frame.letter) {
        ctx.save();
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(frame.letter, b.x, b.y - 6);
        ctx.restore();
      }

      // ── Tab (top-right, for drag/duplicate) ──────────────────────
      if (isSelected || isHovered) {
        const t = getTabRect(b);
        ctx.save();
        ctx.fillStyle = TAB_FILL;
        ctx.strokeStyle = TAB_STROKE;
        ctx.beginPath();
        // Rounded-top pill sitting above the canvas
        ctx.roundRect(t.x, t.y, t.w, t.h, [6, 6, 0, 0]);
        ctx.fill();
        // Grip dots
        ctx.fillStyle = 'rgba(233, 217, 203, 0.7)';
        const gcx = t.x + t.w / 2;
        const gcy = t.y + t.h / 2;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(gcx + i * 5, gcy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── Playhead (during playback) ───────────────────────────────
      const audio = useAudioStore.getState();
      if (audio.isPlaying && audio.playbackCanvasId === frame.id) {
        const colPos = Math.max(0, Math.min(frame.gridWidth, audio.playheadCol));
        const px = b.x + colPos * b.cellSize;
        ctx.save();
        // Dim trailing area (played pixels tint)
        ctx.fillStyle = 'rgba(255, 98, 0, 0.08)';
        ctx.fillRect(b.x, b.y, px - b.x, b.h);
        // Vertical playhead line
        ctx.strokeStyle = '#FF6200';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, b.y - 4);
        ctx.lineTo(px, b.y + b.h + 4);
        ctx.stroke();
        // Top cap triangle
        ctx.fillStyle = '#FF6200';
        ctx.beginPath();
        ctx.moveTo(px - 5, b.y - 10);
        ctx.lineTo(px + 5, b.y - 10);
        ctx.lineTo(px, b.y - 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ── + affordances (selected only) ────────────────────────────
      if (isSelected) {
        const plusButtons = getPlusButtons(b);
        for (const p of plusButtons) {
          ctx.save();
          ctx.fillStyle = PLUS_FILL;
          ctx.beginPath();
          ctx.arc(p.x, p.y, PLUS_BUTTON_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = PLUS_ICON_COLOR;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x - 5, p.y);
          ctx.lineTo(p.x + 5, p.y);
          ctx.moveTo(p.x, p.y - 5);
          ctx.lineTo(p.x, p.y + 5);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    [getBrushCells, getMirrorCells, getLineCells, getTabRect, getPlusButtons]
  );

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // ───────────────────────────────────────────────────────────────────
  // Canvas resize
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = devicePixelRatio;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      scheduleRedraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => observer.disconnect();
  }, [scheduleRedraw]);

  // ───────────────────────────────────────────────────────────────────
  // Subscribe to stores — redraw on any change
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub1 = useCanvasStore.subscribe(scheduleRedraw);
    const unsub2 = useEditorStore.subscribe(scheduleRedraw);
    const unsub3 = useAudioStore.subscribe(scheduleRedraw);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [scheduleRedraw]);

  // ───────────────────────────────────────────────────────────────────
  // Keyboard: spacebar to pan, escape to deselect, delete to remove
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && !spaceHeldRef.current) {
        spaceHeldRef.current = true;
        const el = canvasRef.current;
        if (el) el.style.cursor = 'grab';
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        useCanvasStore.getState().selectCanvas(null);
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !(e.target instanceof HTMLInputElement)) {
        const { selectedCanvasId, deleteCanvas } = useCanvasStore.getState();
        if (selectedCanvasId) {
          deleteCanvas(selectedCanvasId);
          e.preventDefault();
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        const el = canvasRef.current;
        if (el) el.style.cursor = 'crosshair';
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────
  // Wheel zoom (toward cursor)
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { viewport, setViewport } = useCanvasStore.getState();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.1, Math.min(10, viewport.zoom * factor));
      // Keep the world point under the cursor stationary on screen.
      const worldX = (sx - viewport.x) / viewport.zoom;
      const worldY = (sy - viewport.y) / viewport.zoom;
      setViewport({
        zoom: newZoom,
        x: sx - worldX * newZoom,
        y: sy - worldY * newZoom,
      });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // ───────────────────────────────────────────────────────────────────
  // History helpers
  // ───────────────────────────────────────────────────────────────────

  // Snapshot the pre-action state into pastStates so the action can be undone.
  // Must be called BEFORE the action's set() calls, while undo is still paused.
  const pushHistory = useCallback(() => {
    const { canvases, canvasOrder } = useCanvasStore.getState();
    const snapshot = { canvases, canvasOrder };
    useCanvasStore.temporal.setState((s) => ({
      pastStates: [...s.pastStates.slice(-(14)), snapshot],
      futureStates: [],
    }));
  }, []);

  // Resume undo recording after a paused action completes.
  const commitHistory = useCallback(() => {
    useCanvasStore.temporal.getState().resume();
  }, []);

  // ───────────────────────────────────────────────────────────────────
  // Pointer handling
  // ───────────────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const store = useCanvasStore.getState();
    const { canvases, selectedCanvasId } = store;

    // ── Pan mode (spacebar OR middle-click OR alt+click on empty) ──
    if (
      spaceHeldRef.current ||
      e.button === 1
    ) {
      isPanningRef.current = true;
      panStartRef.current = { x: sx, y: sy, vx: store.viewport.x, vy: store.viewport.y };
      canvasEl.setPointerCapture(e.pointerId);
      canvasEl.style.cursor = 'grabbing';
      return;
    }

    // ── Hit test: plus buttons (on selected canvas) ────────────────
    if (selectedCanvasId) {
      const selBounds = frameBoundsRef.current.find((b) => b.id === selectedCanvasId);
      if (selBounds) {
        const plusButtons = getPlusButtons(selBounds);
        for (const p of plusButtons) {
          if (pointInCircle(sx, sy, p.x, p.y, PLUS_BUTTON_RADIUS)) {
            // Create new empty canvas offset in that direction
            const selFrame = canvases[selectedCanvasId];
            if (selFrame) {
              const gap = 40;
              let pos = { x: selFrame.position.x, y: selFrame.position.y };
              // Use a default 24x32 size for the offset math (new canvas gets the default)
              const WORLD_CELL = 16;
              const selWw = selFrame.gridWidth * WORLD_CELL;
              const selWh = selFrame.gridHeight * WORLD_CELL;
              switch (p.dir) {
                case 'right':
                  pos = { x: selFrame.position.x + selWw + gap, y: selFrame.position.y };
                  break;
                case 'left':
                  pos = { x: selFrame.position.x - (24 * WORLD_CELL) - gap, y: selFrame.position.y };
                  break;
                case 'down':
                  pos = { x: selFrame.position.x, y: selFrame.position.y + selWh + gap };
                  break;
                case 'up':
                  pos = { x: selFrame.position.x, y: selFrame.position.y - (32 * WORLD_CELL) - gap };
                  break;
              }
              store.createCanvas(pos);
            }
            return;
          }
        }
      }
    }

    // ── Hit test: tabs (on selected or hovered canvas) ─────────────
    for (const b of frameBoundsRef.current) {
      // Only the selected or currently-hovered canvas shows a tab, but
      // we allow clicking a tab of any visible frame.
      const t = getTabRect(b);
      if (pointInRect(sx, sy, t.x, t.y, t.w, t.h)) {
        const frame = canvases[b.id];
        if (!frame) return;
        // Select the canvas if not already
        if (selectedCanvasId !== b.id) store.selectCanvas(b.id);
        // Start drag (or duplicate if alt held)
        draggingCanvasRef.current = {
          id: b.id,
          origX: frame.position.x,
          origY: frame.position.y,
          startSx: sx,
          startSy: sy,
          isDuplicate: e.altKey,
          started: false,
          dupId: null,
        };
        canvasEl.setPointerCapture(e.pointerId);
        canvasEl.style.cursor = e.altKey ? 'copy' : 'grabbing';
        return;
      }
    }

    // ── Hit test: resize handles (selected canvas only) ────────────
    if (selectedCanvasId) {
      const selBounds = frameBoundsRef.current.find(
        (b) => b.id === selectedCanvasId
      );
      if (selBounds) {
        const handle = resizeHandleAt(sx, sy, selBounds);
        if (handle) {
          const frame = canvases[selectedCanvasId];
          if (!frame) return;
          resizingRef.current = {
            id: selectedCanvasId,
            handle,
            origX: frame.position.x,
            origY: frame.position.y,
            origGridW: frame.gridWidth,
            origGridH: frame.gridHeight,
            // Deep-enough copy of pixel arrays — rows are shared but we
            // only ever read them, never mutate, so row-aliasing is fine.
            origPixels: frame.pixels.map((row) => row.slice()),
            origPixelShapes: frame.pixelShapes?.map((row) => row.slice()),
            startSx: sx,
            startSy: sy,
            started: false,
          };
          canvasEl.setPointerCapture(e.pointerId);
          canvasEl.style.cursor = cursorForHandle(handle);
          return;
        }
      }
    }

    // ── Hit test: interior of a canvas ─────────────────────────────
    const hit = frameAtScreen(sx, sy);
    if (!hit) {
      // Click on empty workspace → deselect
      store.selectCanvas(null);
      return;
    }

    // Select if needed (per spec: also begin drawing in the same action)
    if (selectedCanvasId !== hit.id) {
      store.selectCanvas(hit.id);
    }

    // Begin drawing on this canvas
    const frame = canvases[hit.id];
    if (!frame) return;
    const cell = screenToCell(sx, sy, hit, frame);
    if (!cell) return;

    const { activeTool } = useEditorStore.getState();
    const isErase = e.button === 2 || activeTool === 'eraser';
    const value = !isErase;

    drawingRef.current = true;
    drawValueRef.current = value;
    drawCanvasIdRef.current = hit.id;
    lastCellRef.current = cell;

    // Snapshot pre-stroke state so this action can be undone, then pause
    // recording so intermediate setPixels calls don't pollute history.
    pushHistory();
    useCanvasStore.temporal.getState().pause();

    if (activeTool === 'pixel' || activeTool === 'eraser') {
      const mirrored = getMirrorCells(cell.row, cell.col, frame, frame.mirrorMode);
      const expanded: { row: number; col: number; value: boolean }[] = [];
      for (const mc of mirrored) {
        for (const bc of getBrushCells(mc.row, mc.col, frame)) {
          expanded.push({ ...bc, value });
        }
      }
      store.setPixels(hit.id, expanded);
      if (value && !useAudioStore.getState().muted) {
        playPixel(cell.row, frame.gridHeight, frame.pixelShape, frame.pixelDensity);
      }
    } else if (activeTool === 'line') {
      lineStartRef.current = cell;
    } else if (activeTool === 'rect') {
      rectStartRef.current = cell;
    } else if (activeTool === 'fill') {
      // Flood fill
      const targetValue = frame.pixels[cell.row]?.[cell.col];
      if (targetValue === undefined) return;
      const newValue = !targetValue;
      const visited = new Set<string>();
      const stack: { row: number; col: number }[] = [cell];
      const filled: { row: number; col: number; value: boolean }[] = [];
      while (stack.length > 0) {
        const { row, col } = stack.pop()!;
        const key = `${row},${col}`;
        if (visited.has(key)) continue;
        if (row < 0 || row >= frame.gridHeight || col < 0 || col >= frame.gridWidth) continue;
        if (frame.pixels[row][col] !== targetValue) continue;
        visited.add(key);
        for (const mc of getMirrorCells(row, col, frame, frame.mirrorMode)) {
          filled.push({ row: mc.row, col: mc.col, value: newValue });
        }
        stack.push({ row: row + 1, col });
        stack.push({ row: row - 1, col });
        stack.push({ row, col: col + 1 });
        stack.push({ row, col: col - 1 });
      }
      store.setPixels(hit.id, filled);
      drawingRef.current = false;
      commitHistory();
      return;
    }

    canvasEl.setPointerCapture(e.pointerId);
    scheduleRedraw();
  }, [commitHistory, pushHistory, frameAtScreen, getBrushCells, getMirrorCells, getPlusButtons, getTabRect, resizeHandleAt, screenToCell, scheduleRedraw]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const store = useCanvasStore.getState();

    // ── Pan ────────────────────────────────────────────────────────
    if (isPanningRef.current) {
      store.setViewport({
        x: panStartRef.current.vx + (sx - panStartRef.current.x),
        y: panStartRef.current.vy + (sy - panStartRef.current.y),
      });
      return;
    }

    // ── Canvas resize ──────────────────────────────────────────────
    const rz = resizingRef.current;
    if (rz) {
      const dx = sx - rz.startSx;
      const dy = sy - rz.startSy;
      const moved = Math.abs(dx) > DRAG_START_PX || Math.abs(dy) > DRAG_START_PX;
      if (!rz.started && moved) {
        rz.started = true;
        // Snapshot + pause so intermediate resizeCanvas calls coalesce into
        // one history entry.
        pushHistory();
        useCanvasStore.temporal.getState().pause();
      }
      if (rz.started) {
        // Convert screen delta → world delta → cell delta (whole cells).
        const WORLD_CELL = 16;
        const zoom = store.viewport.zoom;
        const worldDx = dx / zoom;
        const worldDy = dy / zoom;
        const cellDx = Math.round(worldDx / WORLD_CELL);
        const cellDy = Math.round(worldDy / WORLD_CELL);

        // Anchor = opposite edge. For 'w' (drag left edge), anchor is right
        // edge: grow/shrink by changing W and shifting position.x.
        // For 'n', anchor is bottom edge: change H and shift position.y.
        // For 'e' and 's', anchor is top-left: change W/H, position stays.
        // Corners combine their two axes.
        let newW = rz.origGridW;
        let newH = rz.origGridH;
        let posX = rz.origX;
        let posY = rz.origY;
        let colOffset = 0;
        let rowOffset = 0;

        const affectsE =
          rz.handle === 'e' || rz.handle === 'ne' || rz.handle === 'se';
        const affectsW =
          rz.handle === 'w' || rz.handle === 'nw' || rz.handle === 'sw';
        const affectsS =
          rz.handle === 's' || rz.handle === 'se' || rz.handle === 'sw';
        const affectsN =
          rz.handle === 'n' || rz.handle === 'ne' || rz.handle === 'nw';

        if (affectsE) {
          newW = Math.max(4, rz.origGridW + cellDx);
        }
        if (affectsW) {
          // Dragging left edge: positive dx shrinks W; negative dx grows W.
          newW = Math.max(4, rz.origGridW - cellDx);
          // Position X shifts by (origW - newW) cells to keep right edge
          // anchored in world space.
          const deltaCells = rz.origGridW - newW;
          posX = rz.origX + deltaCells * WORLD_CELL;
          // In the new grid, old pixels live at colOffset = newW - origW
          // when growing (shift right), or clip from the left when shrinking.
          colOffset = newW - rz.origGridW;
        }
        if (affectsS) {
          newH = Math.max(4, rz.origGridH + cellDy);
        }
        if (affectsN) {
          newH = Math.max(4, rz.origGridH - cellDy);
          const deltaCells = rz.origGridH - newH;
          posY = rz.origY + deltaCells * WORLD_CELL;
          rowOffset = newH - rz.origGridH;
        }

        store.resizeCanvasFromSnapshot(rz.id, {
          width: newW,
          height: newH,
          position: { x: posX, y: posY },
          origPixels: rz.origPixels,
          origPixelShapes: rz.origPixelShapes,
          origGridWidth: rz.origGridW,
          origGridHeight: rz.origGridH,
          rowOffset,
          colOffset,
        });
      }
      return;
    }

    // ── Canvas drag / duplicate ────────────────────────────────────
    const drag = draggingCanvasRef.current;
    if (drag) {
      const dx = sx - drag.startSx;
      const dy = sy - drag.startSy;
      const moved = Math.abs(dx) > DRAG_START_PX || Math.abs(dy) > DRAG_START_PX;
      if (!drag.started && moved) {
        drag.started = true;
        // Snapshot pre-drag state, then pause so every moveCanvas call
        // during the drag doesn't create a separate history entry.
        pushHistory();
        useCanvasStore.temporal.getState().pause();
        if (drag.isDuplicate) {
          // Create the duplicate at original position; it'll be repositioned below
          const sourceFrame = useCanvasStore.getState().canvases[drag.id];
          if (sourceFrame) {
            const newId = store.duplicateCanvas(drag.id, {
              x: sourceFrame.position.x,
              y: sourceFrame.position.y,
            });
            drag.dupId = newId;
          }
        }
      }
      if (drag.started) {
        const worldDx = dx / store.viewport.zoom;
        const worldDy = dy / store.viewport.zoom;
        const targetId = drag.isDuplicate && drag.dupId ? drag.dupId : drag.id;
        store.moveCanvas(targetId, {
          x: drag.origX + worldDx,
          y: drag.origY + worldDy,
        });
      }
      return;
    }

    // ── Update cursor based on what's under the pointer ────────────
    // (resize handles on selected canvas get priority over crosshair)
    if (!drawingRef.current && !spaceHeldRef.current) {
      const sel = store.selectedCanvasId;
      let cursorSet = false;
      if (sel) {
        const selB = frameBoundsRef.current.find((b) => b.id === sel);
        if (selB) {
          const handle = resizeHandleAt(sx, sy, selB);
          if (handle) {
            canvasEl.style.cursor = cursorForHandle(handle);
            cursorSet = true;
          }
        }
      }
      if (!cursorSet) canvasEl.style.cursor = 'crosshair';
    }

    // ── Update hover (for cell preview + hover outline) ────────────
    const hit = frameAtScreen(sx, sy);
    const prevHoverCanvasId = hoverCanvasIdRef.current;
    const prevHoverCell = hoverCellRef.current;
    hoverCanvasIdRef.current = hit ? hit.id : null;
    if (hit) {
      const frame = store.canvases[hit.id];
      if (frame) {
        const cell = screenToCell(sx, sy, hit, frame);
        hoverCellRef.current = cell ? { canvasId: hit.id, ...cell } : null;
      }
    } else {
      hoverCellRef.current = null;
    }
    const hoverChanged =
      prevHoverCanvasId !== hoverCanvasIdRef.current ||
      prevHoverCell?.canvasId !== hoverCellRef.current?.canvasId ||
      prevHoverCell?.row !== hoverCellRef.current?.row ||
      prevHoverCell?.col !== hoverCellRef.current?.col;

    // ── Continue drawing stroke ────────────────────────────────────
    if (drawingRef.current && drawCanvasIdRef.current && hit?.id === drawCanvasIdRef.current) {
      const frame = store.canvases[drawCanvasIdRef.current];
      if (!frame) return;
      const cell = screenToCell(sx, sy, hit, frame);
      if (!cell) return;
      const { activeTool } = useEditorStore.getState();
      if (
        (activeTool === 'pixel' || activeTool === 'eraser') &&
        lastCellRef.current &&
        (cell.row !== lastCellRef.current.row || cell.col !== lastCellRef.current.col)
      ) {
        const lineCells = getLineCells(
          lastCellRef.current.row,
          lastCellRef.current.col,
          cell.row,
          cell.col
        );
        const allCells: { row: number; col: number; value: boolean }[] = [];
        for (const lc of lineCells) {
          for (const mc of getMirrorCells(lc.row, lc.col, frame, frame.mirrorMode)) {
            for (const bc of getBrushCells(mc.row, mc.col, frame)) {
              allCells.push({ ...bc, value: drawValueRef.current });
            }
          }
        }
        store.setPixels(drawCanvasIdRef.current, allCells);
        lastCellRef.current = cell;
        if (drawValueRef.current && !useAudioStore.getState().muted) {
          playPixel(cell.row, frame.gridHeight, frame.pixelShape, frame.pixelDensity);
        }
      }
    }

    if (hoverChanged || drawingRef.current || isPanningRef.current || resizingRef.current || draggingCanvasRef.current) {
      scheduleRedraw();
    }
  }, [pushHistory, frameAtScreen, getBrushCells, getLineCells, getMirrorCells, resizeHandleAt, screenToCell, scheduleRedraw]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const canvasEl = canvasRef.current;

    // ── End pan ────────────────────────────────────────────────────
    if (isPanningRef.current) {
      isPanningRef.current = false;
      if (canvasEl) canvasEl.style.cursor = spaceHeldRef.current ? 'grab' : 'crosshair';
      return;
    }

    // ── End canvas resize ──────────────────────────────────────────
    if (resizingRef.current) {
      const wasResizing = resizingRef.current.started;
      resizingRef.current = null;
      if (canvasEl) canvasEl.style.cursor = 'crosshair';
      if (wasResizing) commitHistory();
      return;
    }

    // ── End canvas drag / duplicate ────────────────────────────────
    if (draggingCanvasRef.current) {
      const wasDragging = draggingCanvasRef.current.started;
      draggingCanvasRef.current = null;
      if (canvasEl) canvasEl.style.cursor = 'crosshair';
      // Commit the canvas move as a single undo step
      if (wasDragging) commitHistory();
      return;
    }

    // ── End drawing stroke ─────────────────────────────────────────
    if (!drawingRef.current) return;
    const store = useCanvasStore.getState();
    const id = drawCanvasIdRef.current;
    if (!id) {
      drawingRef.current = false;
      commitHistory();
      return;
    }
    const frame = store.canvases[id];
    if (!frame) {
      drawingRef.current = false;
      commitHistory();
      return;
    }
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) {
      drawingRef.current = false;
      commitHistory();
      return;
    }
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const bounds = frameBoundsRef.current.find((b) => b.id === id);
    const cell = bounds ? screenToCell(sx, sy, bounds, frame) : null;
    const { activeTool } = useEditorStore.getState();

    if (activeTool === 'line' && lineStartRef.current && cell) {
      const lineCells = getLineCells(
        lineStartRef.current.row,
        lineStartRef.current.col,
        cell.row,
        cell.col
      );
      const allCells: { row: number; col: number; value: boolean }[] = [];
      for (const lc of lineCells) {
        for (const mc of getMirrorCells(lc.row, lc.col, frame, frame.mirrorMode)) {
          allCells.push({ ...mc, value: drawValueRef.current });
        }
      }
      store.setPixels(id, allCells);
      lineStartRef.current = null;
    }

    if (activeTool === 'rect' && rectStartRef.current && cell) {
      const minR = Math.min(rectStartRef.current.row, cell.row);
      const maxR = Math.max(rectStartRef.current.row, cell.row);
      const minC = Math.min(rectStartRef.current.col, cell.col);
      const maxC = Math.max(rectStartRef.current.col, cell.col);
      store.fillRect(id, minR, minC, maxR, maxC, drawValueRef.current);
      rectStartRef.current = null;
    }

    drawingRef.current = false;
    drawCanvasIdRef.current = null;
    lastCellRef.current = null;
    commitHistory();
    scheduleRedraw();
  }, [commitHistory, getLineCells, getMirrorCells, screenToCell, scheduleRedraw]);

  const handlePointerCancel = useCallback(() => {
    drawingRef.current = false;
    drawCanvasIdRef.current = null;
    lastCellRef.current = null;
    lineStartRef.current = null;
    rectStartRef.current = null;
    isPanningRef.current = false;
    draggingCanvasRef.current = null;
    resizingRef.current = null;
    try {
      commitHistory();
    } catch {
      /* ignore */
    }
  }, [commitHistory]);

  // ───────────────────────────────────────────────────────────────────
  // Empty-state: giant + button in the center
  // ───────────────────────────────────────────────────────────────────
  const canvasCount = useCanvasStore((s) => s.canvasOrder.length);

  const createFirstCanvas = useCallback(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    // Place first canvas centered in the current viewport.
    const { viewport } = useCanvasStore.getState();
    const WORLD_CELL = 16;
    const defaultW = 24 * WORLD_CELL;
    const defaultH = 32 * WORLD_CELL;
    const worldCenterX = (rect.width / 2 - viewport.x) / viewport.zoom;
    const worldCenterY = (rect.height / 2 - viewport.y) / viewport.zoom;
    useCanvasStore.getState().createCanvas({
      x: worldCenterX - defaultW / 2,
      y: worldCenterY - defaultH / 2,
    });
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Glyph workspace"
        style={{ display: 'block', cursor: 'crosshair', outline: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {canvasCount === 0 && (
        <button
          type="button"
          onClick={createFirstCanvas}
          aria-label="Create first canvas"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: '#1a1a1a',
            color: '#E9D9CB',
            border: 'none',
            fontSize: 32,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          +
        </button>
      )}
    </div>
  );
}
