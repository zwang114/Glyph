import { useRef, useCallback, useState, useEffect } from 'react';
import type { EditorTool } from '../../types/editor';

interface RadialBrushSelectorProps {
  value: EditorTool;
  onChange: (tool: EditorTool) => void;
}

// 4 tools arranged in a 2x2 grid around a central dial
// Positions within a 190x120 selector area
const TOOLS: { key: EditorTool; label: string; left: number; top: number; angle: number }[] = [
  { key: 'pixel', label: 'PX',  left: 0,   top: 0,  angle: -135 },  // top-left
  { key: 'rect',  label: 'REC', left: 150, top: 0,  angle: -45 },   // top-right
  { key: 'line',  label: 'LI',  left: 0,   top: 80, angle: 135 },   // bottom-left
  { key: 'fill',  label: 'FIL', left: 150, top: 80, angle: 45 },    // bottom-right
];

const SELECTOR_W = 190;
const SELECTOR_H = 120;
const DIAL_SIZE = 80;
const DIAL_LEFT = 55;
const DIAL_TOP = 20;
const DIAL_CX = DIAL_LEFT + DIAL_SIZE / 2; // 95
const DIAL_CY = DIAL_TOP + DIAL_SIZE / 2;  // 60
const BTN_SIZE = 40;

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function snapToNearest(angleDeg: number): EditorTool {
  let best = TOOLS[0];
  let bestDist = Infinity;
  for (const t of TOOLS) {
    const dist = Math.abs(normalizeAngle(angleDeg - t.angle));
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best.key;
}

export function RadialBrushSelector({ value, onChange }: RadialBrushSelectorProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragAngle, setDragAngle] = useState<number | null>(null);

  const activeTool = TOOLS.find((t) => t.key === value) ?? TOOLS[0];
  const displayAngle = dragAngle ?? activeTool.angle;

  const getAngleFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = dialRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }, []);

  const handleDialPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const angle = getAngleFromEvent(e);
    setDragging(true);
    setDragAngle(angle);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [getAngleFromEvent]);

  const handleDialPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const angle = getAngleFromEvent(e);
    setDragAngle(angle);
  }, [dragging, getAngleFromEvent]);

  const handleDialPointerUp = useCallback(() => {
    if (!dragging) return;
    if (dragAngle !== null) {
      onChange(snapToNearest(dragAngle));
    }
    setDragging(false);
    setDragAngle(null);
  }, [dragging, dragAngle, onChange]);

  // Global pointerup fallback
  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      if (dragAngle !== null) {
        onChange(snapToNearest(dragAngle));
      }
      setDragging(false);
      setDragAngle(null);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging, dragAngle, onChange]);

  // Decorative dotted lines: X pattern extending to button corners
  // Pattern area: 150x80, centered in the 190x120 selector
  const patternLines = [
    { x1: 20, y1: 20, x2: 170, y2: 100 },   // top-left to bottom-right
    { x1: 170, y1: 20, x2: 20, y2: 100 },    // top-right to bottom-left
  ];

  return (
    <div
      className="radial-selector"
      style={{ width: SELECTOR_W, height: SELECTOR_H, '--dial-color': '#FF6200' } as React.CSSProperties}
    >
      {/* Decorative dotted lines through center */}
      <svg
        className="radial-lines"
        width={SELECTOR_W}
        height={SELECTOR_H}
        viewBox={`0 0 ${SELECTOR_W} ${SELECTOR_H}`}
      >
        {patternLines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="black"
            strokeWidth="3"
            strokeDasharray="0 8"
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* Tool buttons at exact positions */}
      {TOOLS.map((t) => {
        const isActive = t.key === value;
        const isHover = dragging && dragAngle !== null && snapToNearest(dragAngle) === t.key;
        return (
          <button
            key={t.key}
            className={`radial-btn ${isActive ? 'radial-btn--active' : ''} ${isHover ? 'radial-btn--hover' : ''}`}
            style={{
              position: 'absolute',
              left: t.left,
              top: t.top,
              width: BTN_SIZE,
              height: BTN_SIZE,
              '--active-color': '#FF6200',
            } as React.CSSProperties}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        );
      })}

      {/* Central dial */}
      <div
        ref={dialRef}
        className={`radial-dial ${dragging ? 'radial-dial--dragging' : ''}`}
        style={{
          position: 'absolute',
          left: DIAL_LEFT,
          top: DIAL_TOP,
          width: DIAL_SIZE,
          height: DIAL_SIZE,
        }}
        onPointerDown={handleDialPointerDown}
        onPointerMove={handleDialPointerMove}
        onPointerUp={handleDialPointerUp}
      >
        {/* Indicator line from center outward */}
        <div
          className="radial-dial-indicator"
          style={{
            transform: `rotate(${displayAngle + 90}deg)`,
            transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>
    </div>
  );
}
