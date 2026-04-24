import { useRef, useCallback, useState, useEffect } from 'react';
import type { PixelShape } from '../../types/editor';
import { useClickSound } from '../../hooks/useClickSound';

interface RadialShapeSelectorProps {
  value: PixelShape;
  onChange: (shape: PixelShape) => void;
}

// Exact positions from Figma (within 190x208 selector area)
const SHAPES: { key: PixelShape; label: string; left: number; top: number; angle: number }[] = [
  { key: 'square',   label: 'SQ',  left: 75,  top: 0,   angle: -90 },   // top center
  { key: 'star',     label: 'STR', left: 0,   top: 40,  angle: -150 },  // upper-left
  { key: 'circle',   label: 'CL',  left: 150, top: 40,  angle: -30 },   // upper-right
  { key: 'metaball', label: 'MB',  left: 0,   top: 128, angle: 150 },   // lower-left
  { key: 'diamond',  label: 'DM',  left: 150, top: 128, angle: 30 },    // lower-right
  { key: 'triangle', label: 'TR',  left: 75,  top: 168, angle: 90 },    // bottom center
];

const SELECTOR_W = 190;
const SELECTOR_H = 208;
const DIAL_SIZE = 80;
const DIAL_LEFT = 55;
const DIAL_TOP = 64;
const DIAL_CX = DIAL_LEFT + DIAL_SIZE / 2; // 95
const DIAL_CY = DIAL_TOP + DIAL_SIZE / 2;  // 104
const BTN_SIZE = 40;

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function snapToNearest(angleDeg: number): PixelShape {
  let best = SHAPES[0];
  let bestDist = Infinity;
  for (const s of SHAPES) {
    const dist = Math.abs(normalizeAngle(angleDeg - s.angle));
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best.key;
}

export function RadialShapeSelector({ value, onChange }: RadialShapeSelectorProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragAngle, setDragAngle] = useState<number | null>(null);
  const clickFiredRef = useRef(false);
  const lastHoverRef = useRef<PixelShape | null>(null);
  const { playClick } = useClickSound();

  const activeShape = SHAPES.find((s) => s.key === value) ?? SHAPES[0];
  const displayAngle = dragAngle ?? activeShape.angle;

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
    clickFiredRef.current = false;
    const angle = getAngleFromEvent(e);
    lastHoverRef.current = snapToNearest(angle);
    setDragging(true);
    setDragAngle(angle);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [getAngleFromEvent]);

  const handleDialPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const angle = getAngleFromEvent(e);
    const hover = snapToNearest(angle);
    if (hover !== lastHoverRef.current) {
      lastHoverRef.current = hover;
      playClick();
      clickFiredRef.current = true;
    }
    setDragAngle(angle);
  }, [dragging, getAngleFromEvent, playClick]);

  const handleDialPointerUp = useCallback(() => {
    if (!dragging) return;
    if (dragAngle !== null) {
      const next = snapToNearest(dragAngle);
      if (next !== value && !clickFiredRef.current) {
        clickFiredRef.current = true;
        playClick();
      }
      onChange(next);
    }
    setDragging(false);
    setDragAngle(null);
  }, [dragging, dragAngle, onChange, value, playClick]);

  // Global pointerup fallback
  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      if (dragAngle !== null) {
        const next = snapToNearest(dragAngle);
        if (next !== value && !clickFiredRef.current) {
          clickFiredRef.current = true;
          playClick();
        }
        onChange(next);
      }
      setDragging(false);
      setDragAngle(null);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging, dragAngle, onChange, value, playClick]);

  // Decorative lines: 3 lines through center (vertical, +30°, -30°)
  const lineLength = 120;
  const lines = [90, 30, -30].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const dx = Math.cos(rad) * (lineLength / 2);
    const dy = Math.sin(rad) * (lineLength / 2);
    return {
      x1: DIAL_CX - dx,
      y1: DIAL_CY - dy,
      x2: DIAL_CX + dx,
      y2: DIAL_CY + dy,
    };
  });

  return (
    <div
      className="radial-selector"
      style={{ width: SELECTOR_W, height: SELECTOR_H, '--dial-color': '#879900', '--active-color': '#879900' } as React.CSSProperties}
    >
      {/* Decorative dotted lines through center */}
      <svg
        className="radial-lines"
        width={SELECTOR_W}
        height={SELECTOR_H}
        viewBox={`0 0 ${SELECTOR_W} ${SELECTOR_H}`}
      >
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="black"
            strokeWidth="2"
            strokeDasharray="3 6"
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* Shape buttons at exact Figma positions */}
      {SHAPES.map((s) => {
        const isActive = s.key === value;
        const isHover = dragging && dragAngle !== null && snapToNearest(dragAngle) === s.key;
        return (
          <button
            key={s.key}
            className={`radial-btn ${isActive ? 'radial-btn--active' : ''} ${isHover ? 'radial-btn--hover' : ''}`}
            style={{
              position: 'absolute',
              left: s.left,
              top: s.top,
              width: BTN_SIZE,
              height: BTN_SIZE,
            }}
            onClick={() => { if (s.key !== value) playClick(); onChange(s.key); }}
          >
            {s.label}
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
