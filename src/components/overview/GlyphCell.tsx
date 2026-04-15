import { useRef, useEffect } from 'react';
import type { Glyph } from '../../types/font';

interface GlyphCellProps {
  glyph: Glyph;
  charDef: { unicode: number; name: string; char: string };
  onClick: () => void;
}

export function GlyphCell({ glyph, charDef, onClick }: GlyphCellProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasPixels = glyph.pixels.some((row) => row.some(Boolean));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPixels) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 48;
    const dpr = devicePixelRatio;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, size, size);

    const padding = 4;
    const cellW = (size - padding * 2) / glyph.gridWidth;
    const cellH = (size - padding * 2) / glyph.gridHeight;
    const cellSize = Math.min(cellW, cellH);

    const offsetX = (size - glyph.gridWidth * cellSize) / 2;
    const offsetY = (size - glyph.gridHeight * cellSize) / 2;

    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < glyph.gridHeight; r++) {
      for (let c = 0; c < glyph.gridWidth; c++) {
        if (glyph.pixels[r][c]) {
          ctx.fillRect(
            offsetX + c * cellSize,
            offsetY + r * cellSize,
            cellSize + 0.5,
            cellSize + 0.5
          );
        }
      }
    }
  }, [glyph, hasPixels]);

  return (
    <div
      className={`glyph-cell ${hasPixels ? 'glyph-cell--filled' : ''}`}
      onClick={onClick}
    >
      {hasPixels ? (
        <canvas ref={canvasRef} className="glyph-cell-preview" />
      ) : (
        <span className="glyph-cell-char">{charDef.char}</span>
      )}
      <span className="glyph-cell-name">{charDef.name}</span>
    </div>
  );
}
