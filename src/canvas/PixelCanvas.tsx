import { useRef, useEffect, useCallback } from 'react';
import { useFontStore } from '../stores/fontStore';
import { useEditorStore } from '../stores/editorStore';
import type { Glyph } from '../types/font';
import type { MirrorMode } from '../types/editor';
import { drawShape, drawMetaballs } from '../engine/shapes';

const GRID_DOT_COLOR = 'rgba(0, 0, 0, 0.22)';

const PIXEL_COLOR = '#1a1a1a';
const BG_COLOR = '#FFFBF6';
const HOVER_COLOR = 'rgba(0, 0, 0, 0.08)';

export function PixelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const drawingRef = useRef(false);
  const drawValueRef = useRef(true);
  const lastCellRef = useRef<{ row: number; col: number } | null>(null);
  const hoverCellRef = useRef<{ row: number; col: number } | null>(null);
  const lineStartRef = useRef<{ row: number; col: number } | null>(null);
  const rectStartRef = useRef<{ row: number; col: number } | null>(null);

  // Zoom and pan
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const getBaseSize = useCallback(
    (canvas: HTMLCanvasElement, glyph: Glyph) => {
      const padding = 40;
      const availW = canvas.width / devicePixelRatio - padding * 2;
      const availH = canvas.height / devicePixelRatio - padding * 2;
      return Math.floor(Math.min(availW / glyph.gridWidth, availH / glyph.gridHeight));
    },
    []
  );

  const getCellSize = useCallback(
    (canvas: HTMLCanvasElement, glyph: Glyph) => {
      return getBaseSize(canvas, glyph) * zoomRef.current;
    },
    [getBaseSize]
  );

  const getGridOrigin = useCallback(
    (canvas: HTMLCanvasElement, glyph: Glyph, cellSize: number) => {
      const totalW = glyph.gridWidth * cellSize;
      const totalH = glyph.gridHeight * cellSize;
      return {
        x: (canvas.width / devicePixelRatio - totalW) / 2 + panRef.current.x,
        y: (canvas.height / devicePixelRatio - totalH) / 2 + panRef.current.y,
      };
    },
    []
  );

  const screenToCell = useCallback(
    (clientX: number, clientY: number, canvas: HTMLCanvasElement, glyph: Glyph) => {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const cellSize = getCellSize(canvas, glyph);
      const origin = getGridOrigin(canvas, glyph, cellSize);
      const col = Math.floor((sx - origin.x) / cellSize);
      const row = Math.floor((sy - origin.y) / cellSize);
      if (row >= 0 && row < glyph.gridHeight && col >= 0 && col < glyph.gridWidth) {
        return { row, col };
      }
      return null;
    },
    [getCellSize, getGridOrigin]
  );

  const getMirrorCells = useCallback(
    (row: number, col: number, glyph: Glyph, mode: MirrorMode) => {
      const cells: { row: number; col: number }[] = [{ row, col }];
      if (mode === 'horizontal' || mode === 'both')
        cells.push({ row, col: glyph.gridWidth - 1 - col });
      if (mode === 'vertical' || mode === 'both')
        cells.push({ row: glyph.gridHeight - 1 - row, col });
      if (mode === 'both')
        cells.push({ row: glyph.gridHeight - 1 - row, col: glyph.gridWidth - 1 - col });
      return cells;
    },
    []
  );

  const getLineCells = useCallback(
    (r1: number, c1: number, r2: number, c2: number) => {
      const cells: { row: number; col: number }[] = [];
      let x0 = c1, y0 = r1, x1 = c2, y1 = r2;
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const glyphId = useEditorStore.getState().selectedGlyphId;
    const glyph = glyphId ? useFontStore.getState().glyphs[glyphId] : null;
    if (!glyph) {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const { showGrid, mirrorMode, activeTool, pixelShape, pixelDensity,
      onionSkinEnabled, onionSkinFont, onionSkinSize } =
      useEditorStore.getState();
    const dpr = devicePixelRatio;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    const cellSize = getCellSize(canvas, glyph);
    const origin = getGridOrigin(canvas, glyph, cellSize);
    const gridW = glyph.gridWidth * cellSize;
    const gridH = glyph.gridHeight * cellSize;

    // --- Canvas border (dotted) ---
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.strokeRect(
      Math.round(origin.x) + 0.5,
      Math.round(origin.y) + 0.5,
      gridW,
      gridH
    );
    ctx.setLineDash([]);

    // --- Onion skin ---
    if (onionSkinEnabled) {
      const char = String.fromCharCode(glyph.unicode);
      const fontSize = gridH * onionSkinSize;
      ctx.save();
      ctx.font = `${fontSize}px ${onionSkinFont}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      // Measure actual glyph bounds to center visually
      const metrics = ctx.measureText(char);
      const glyphTop = metrics.actualBoundingBoxAscent;
      const glyphBottom = metrics.actualBoundingBoxDescent;
      const glyphVisualH = glyphTop + glyphBottom;
      const centerX = origin.x + gridW / 2;
      const centerY = origin.y + gridH / 2 + (glyphTop - glyphVisualH / 2);
      ctx.fillText(char, centerX, centerY);
      ctx.restore();
    }

    // --- Draw filled pixels with active shape ---
    ctx.fillStyle = PIXEL_COLOR;

    if (pixelShape === 'metaball') {
      drawMetaballs(
        ctx,
        glyph.pixels,
        glyph.gridWidth,
        glyph.gridHeight,
        cellSize,
        pixelDensity,
        origin.x,
        origin.y
      );
    } else {
      for (let r = 0; r < glyph.gridHeight; r++) {
        for (let c = 0; c < glyph.gridWidth; c++) {
          if (glyph.pixels[r][c]) {
            drawShape(ctx, pixelShape, r, c, cellSize, pixelDensity, origin.x, origin.y);
          }
        }
      }
    }

    // --- Hover preview ---
    const hover = hoverCellRef.current;
    if (hover && !drawingRef.current) {
      ctx.fillStyle = HOVER_COLOR;
      const cells = getMirrorCells(hover.row, hover.col, glyph, mirrorMode);
      for (const cell of cells) {
        if (!glyph.pixels[cell.row]?.[cell.col]) {
          drawShape(ctx, pixelShape === 'metaball' ? 'circle' : pixelShape, cell.row, cell.col, cellSize, pixelDensity, origin.x, origin.y);
        }
      }
    }

    // --- Line/rect preview during drag ---
    if (drawingRef.current && hover) {
      ctx.fillStyle = HOVER_COLOR;
      if (activeTool === 'line' && lineStartRef.current) {
        const cells = getLineCells(lineStartRef.current.row, lineStartRef.current.col, hover.row, hover.col);
        for (const cell of cells) {
          if (cell.row >= 0 && cell.row < glyph.gridHeight && cell.col >= 0 && cell.col < glyph.gridWidth) {
            drawShape(ctx, pixelShape === 'metaball' ? 'circle' : pixelShape, cell.row, cell.col, cellSize, pixelDensity, origin.x, origin.y);
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
            if (r >= 0 && r < glyph.gridHeight && c >= 0 && c < glyph.gridWidth) {
              drawShape(ctx, pixelShape === 'metaball' ? 'circle' : pixelShape, r, c, cellSize, pixelDensity, origin.x, origin.y);
            }
          }
        }
      }
    }

    // --- Mirror axis lines ---
    if (mirrorMode !== 'none') {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      if (mirrorMode === 'horizontal' || mirrorMode === 'both') {
        const midX = origin.x + (glyph.gridWidth * cellSize) / 2;
        ctx.beginPath();
        ctx.moveTo(midX, origin.y);
        ctx.lineTo(midX, origin.y + glyph.gridHeight * cellSize);
        ctx.stroke();
      }
      if (mirrorMode === 'vertical' || mirrorMode === 'both') {
        const midY = origin.y + (glyph.gridHeight * cellSize) / 2;
        ctx.beginPath();
        ctx.moveTo(origin.x, midY);
        ctx.lineTo(origin.x + glyph.gridWidth * cellSize, midY);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // --- Dot grid ---
    if (showGrid) {
      const canvasW = canvas.width / dpr;
      const canvasH = canvas.height / dpr;
      const dotRadius = 1;
      ctx.fillStyle = GRID_DOT_COLOR;
      for (let y = origin.y % cellSize; y <= canvasH; y += cellSize) {
        for (let x = origin.x % cellSize; x <= canvasW; x += cellSize) {
          ctx.beginPath();
          ctx.arc(Math.round(x), Math.round(y), dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }, [getCellSize, getGridOrigin, getMirrorCells, getLineCells]);

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

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

  useEffect(() => {
    const unsubFont = useFontStore.subscribe(scheduleRedraw);
    const unsubEditor = useEditorStore.subscribe(scheduleRedraw);
    return () => { unsubFont(); unsubEditor(); };
  }, [scheduleRedraw]);

  // --- Wheel zoom (toward cursor) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const glyphId = useEditorStore.getState().selectedGlyphId;
      const glyph = glyphId ? useFontStore.getState().glyphs[glyphId] : null;
      if (!glyph) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const canvasW = canvas.width / devicePixelRatio;
      const canvasH = canvas.height / devicePixelRatio;
      const base = getBaseSize(canvas, glyph);

      const oldZoom = zoomRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.25, Math.min(10, oldZoom * factor));

      // Compute full origin before zoom
      const oldCenterX = (canvasW - glyph.gridWidth * base * oldZoom) / 2;
      const oldCenterY = (canvasH - glyph.gridHeight * base * oldZoom) / 2;
      const oldOriginX = oldCenterX + panRef.current.x;
      const oldOriginY = oldCenterY + panRef.current.y;

      // World point under cursor
      const worldX = (mx - oldOriginX) / (base * oldZoom);
      const worldY = (my - oldOriginY) / (base * oldZoom);

      // Compute new center offset
      const newCenterX = (canvasW - glyph.gridWidth * base * newZoom) / 2;
      const newCenterY = (canvasH - glyph.gridHeight * base * newZoom) / 2;

      // Solve for new pan so world point stays under cursor
      panRef.current = {
        x: mx - newCenterX - worldX * base * newZoom,
        y: my - newCenterY - worldY * base * newZoom,
      };
      zoomRef.current = newZoom;
      useEditorStore.getState().setViewport({ zoom: newZoom });
      scheduleRedraw();
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [scheduleRedraw]);

  // --- Pointer handlers ---

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Middle-click or alt+click = pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    const canvas = canvasRef.current;
    const glyphId = useEditorStore.getState().selectedGlyphId;
    if (!canvas || !glyphId) return;
    const glyph = useFontStore.getState().glyphs[glyphId];
    if (!glyph) return;
    const cell = screenToCell(e.clientX, e.clientY, canvas, glyph);
    if (!cell) return;

    const tool = useEditorStore.getState().activeTool;
    const mirror = useEditorStore.getState().mirrorMode;
    const isErase = e.button === 2 || tool === 'eraser';
    const value = !isErase;

    drawingRef.current = true;
    drawValueRef.current = value;
    lastCellRef.current = cell;
    useFontStore.temporal.getState().pause();

    if (tool === 'pixel' || tool === 'eraser') {
      const cells = getMirrorCells(cell.row, cell.col, glyph, mirror);
      useFontStore.getState().setPixels(glyphId, cells.map((c) => ({ ...c, value })));
    } else if (tool === 'line') {
      lineStartRef.current = cell;
    } else if (tool === 'rect') {
      rectStartRef.current = cell;
    } else if (tool === 'fill') {
      // Flood fill from clicked cell
      const targetValue = glyph.pixels[cell.row]?.[cell.col];
      if (targetValue === undefined) return;
      const newValue = !targetValue;
      const visited = new Set<string>();
      const stack: { row: number; col: number }[] = [cell];
      const filled: { row: number; col: number; value: boolean }[] = [];
      while (stack.length > 0) {
        const { row, col } = stack.pop()!;
        const key = `${row},${col}`;
        if (visited.has(key)) continue;
        if (row < 0 || row >= glyph.gridHeight || col < 0 || col >= glyph.gridWidth) continue;
        if (glyph.pixels[row][col] !== targetValue) continue;
        visited.add(key);
        // Apply mirror
        for (const mc of getMirrorCells(row, col, glyph, mirror)) {
          filled.push({ row: mc.row, col: mc.col, value: newValue });
        }
        stack.push({ row: row + 1, col });
        stack.push({ row: row - 1, col });
        stack.push({ row, col: col + 1 });
        stack.push({ row, col: col - 1 });
      }
      useFontStore.getState().setPixels(glyphId, filled);
      // Fill is one-shot — don't continue drag
      drawingRef.current = false;
      useFontStore.temporal.getState().resume();
      return;
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scheduleRedraw();
  }, [screenToCell, getMirrorCells, scheduleRedraw]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanningRef.current) {
      panRef.current = {
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
      };
      scheduleRedraw();
      return;
    }

    const canvas = canvasRef.current;
    const glyphId = useEditorStore.getState().selectedGlyphId;
    if (!canvas || !glyphId) return;
    const glyph = useFontStore.getState().glyphs[glyphId];
    if (!glyph) return;
    const cell = screenToCell(e.clientX, e.clientY, canvas, glyph);
    hoverCellRef.current = cell;

    if (drawingRef.current && cell) {
      const tool = useEditorStore.getState().activeTool;
      const mirror = useEditorStore.getState().mirrorMode;
      if ((tool === 'pixel' || tool === 'eraser') && lastCellRef.current &&
          (cell.row !== lastCellRef.current.row || cell.col !== lastCellRef.current.col)) {
        const lineCells = getLineCells(lastCellRef.current.row, lastCellRef.current.col, cell.row, cell.col);
        const allCells: { row: number; col: number; value: boolean }[] = [];
        for (const lc of lineCells) {
          for (const mc of getMirrorCells(lc.row, lc.col, glyph, mirror)) {
            allCells.push({ ...mc, value: drawValueRef.current });
          }
        }
        useFontStore.getState().setPixels(glyphId, allCells);
        lastCellRef.current = cell;
      }
    }
    scheduleRedraw();
  }, [screenToCell, getLineCells, getMirrorCells, scheduleRedraw]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const glyphId = useEditorStore.getState().selectedGlyphId;
    if (!canvas || !glyphId) { drawingRef.current = false; return; }
    const glyph = useFontStore.getState().glyphs[glyphId];
    if (!glyph) { drawingRef.current = false; return; }

    const cell = screenToCell(e.clientX, e.clientY, canvas, glyph);
    const tool = useEditorStore.getState().activeTool;
    const mirror = useEditorStore.getState().mirrorMode;

    if (tool === 'line' && lineStartRef.current && cell) {
      const lineCells = getLineCells(lineStartRef.current.row, lineStartRef.current.col, cell.row, cell.col);
      const allCells: { row: number; col: number; value: boolean }[] = [];
      for (const lc of lineCells) {
        for (const mc of getMirrorCells(lc.row, lc.col, glyph, mirror)) {
          allCells.push({ ...mc, value: drawValueRef.current });
        }
      }
      useFontStore.getState().setPixels(glyphId, allCells);
      lineStartRef.current = null;
    }

    if (tool === 'rect' && rectStartRef.current && cell) {
      const minR = Math.min(rectStartRef.current.row, cell.row);
      const maxR = Math.max(rectStartRef.current.row, cell.row);
      const minC = Math.min(rectStartRef.current.col, cell.col);
      const maxC = Math.max(rectStartRef.current.col, cell.col);
      useFontStore.getState().fillRect(glyphId, minR, minC, maxR, maxC, drawValueRef.current);
      rectStartRef.current = null;
    }

    drawingRef.current = false;
    lastCellRef.current = null;
    useFontStore.temporal.getState().resume();
    scheduleRedraw();
  }, [screenToCell, getLineCells, getMirrorCells, scheduleRedraw]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
