import { useRef, useCallback, useState, useEffect } from 'react';
import type { PixelShape } from '../../types/editor';
import { useClickSound } from '../../hooks/useClickSound';

interface RadialShapeSelectorProps {
  value: PixelShape;
  onChange: (shape: PixelShape) => void;
}

// ── Exact positions from Figma metadata (node 120:196, 190×208 frame) ──────────
//
// Dial:     x=55, y=64, w=80, h=80  → center=(95, 104)
// Square:   left=79, top=12, 32×32 (border, rounded-4px)
// Circle:   left=146, top=51, 32×32 (border, rounded-100px)
// Star:     left=10, top=48, 37×37
// Cross:    left=12, top=127, 32×32
// Diamond:  left=141, top=122, 41×41 wrapper, 29×29 inner rotated-45 (border)
// Triangle: left=79, top=166, 32×32

const SELECTOR_W = 190;
const SELECTOR_H = 208;
const DIAL_W = 80;
const DIAL_H = 80;
const DIAL_X = 55;
const DIAL_Y = 64;

// Snap angles: 0°=right, -90°=top, 90°=bottom (atan2 convention)
const SNAP_ANGLES: Record<PixelShape, number> = {
  square:   -90,  // top center
  circle:   -29,  // upper-right
  cross:    -150, // upper-left
  star:     150,  // lower-left
  diamond:  30,   // lower-right
  triangle: 90,   // bottom center
};

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function snapToNearest(angleDeg: number): PixelShape {
  let best: PixelShape = 'square';
  let bestDist = Infinity;
  for (const [key, angle] of Object.entries(SNAP_ANGLES)) {
    const dist = Math.abs(normalizeAngle(angleDeg - angle));
    if (dist < bestDist) { bestDist = dist; best = key as PixelShape; }
  }
  return best;
}

// ── Shape icons rendered as inline SVG so we can toggle fill/stroke ─────────────
// Resting:  fill="none"  stroke="black"  → outlined shape only
// Active:   fill="black" stroke="black"  → solid black filled shape

function StarIcon({ active, size }: { active: boolean; size: number }) {
  // 4-point sparkle star — same path geometry as shapes.ts, scaled to size×size
  const u = (size - 4) / 8;
  const ox = 2, oy = 2;
  const P = (x: number, y: number) => `${ox + x * u},${oy + y * u}`;
  const d = [
    `M${P(6.4394,0.1464)}`,
    `C${P(6.6347,-0.0488)} ${P(6.9512,-0.0488)} ${P(7.1464,0.1464)}`,
    `L${P(7.8535,0.8535)}`,
    `C${P(8.0485,1.0487)} ${P(8.0486,1.3653)} ${P(7.8535,1.5605)}`,
    `L${P(6.1211,3.2928)}`,
    `C${P(5.7306,3.6834)} ${P(5.7306,4.3165)} ${P(6.1211,4.7071)}`,
    `L${P(7.8535,6.4394)}`,
    `C${P(8.0485,6.6347)} ${P(8.0486,6.9512)} ${P(7.8535,7.1464)}`,
    `L${P(7.1464,7.8535)}`,
    `C${P(6.9512,8.0486)} ${P(6.6347,8.0485)} ${P(6.4394,7.8535)}`,
    `L${P(4.7071,6.1211)}`,
    `C${P(4.3165,5.7306)} ${P(3.6834,5.7306)} ${P(3.2928,6.1211)}`,
    `L${P(1.5605,7.8535)}`,
    `C${P(1.3653,8.0486)} ${P(1.0487,8.0485)} ${P(0.8535,7.8535)}`,
    `L${P(0.1464,7.1464)}`,
    `C${P(-0.0488,6.9512)} ${P(-0.0488,6.6347)} ${P(0.1464,6.4394)}`,
    `L${P(1.8788,4.7071)}`,
    `C${P(2.2693,4.3165)} ${P(2.2693,3.6834)} ${P(1.8788,3.2928)}`,
    `L${P(0.1464,1.5605)}`,
    `C${P(-0.0488,1.3652)} ${P(-0.0488,1.0487)} ${P(0.1464,0.8535)}`,
    `L${P(0.8535,0.1464)}`,
    `C${P(1.0487,-0.0488)} ${P(1.3652,-0.0488)} ${P(1.5605,0.1464)}`,
    `L${P(3.2928,1.8788)}`,
    `C${P(3.6834,2.2693)} ${P(4.3165,2.2693)} ${P(4.7071,1.8788)}`,
    `L${P(6.4394,0.1464)}`,
    'Z',
  ].join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <path d={d} fill={active ? 'black' : 'none'} stroke="black" strokeWidth={1} />
    </svg>
  );
}

function CrossIcon({ active, size }: { active: boolean; size: number }) {
  // Rounded plus — same geometry as shapes.ts, scaled to size×size
  const u = (size - 4) / 8;
  const ox = 2, oy = 2;
  const P = (x: number, y: number) => `${ox + x * u},${oy + y * u}`;
  const d = [
    `M${P(5,1.5)}`,
    `C${P(5,2.32843)} ${P(5.67157,3)} ${P(6.5,3)}`,
    `L${P(7,3)}`,
    `C${P(7.55228,3)} ${P(8,3.44772)} ${P(8,4)}`,
    `C${P(8,4.55228)} ${P(7.55228,5)} ${P(7,5)}`,
    `L${P(6.5,5)}`,
    `C${P(5.67157,5)} ${P(5,5.67157)} ${P(5,6.5)}`,
    `L${P(5,7)}`,
    `C${P(5,7.55228)} ${P(4.55228,8)} ${P(4,8)}`,
    `C${P(3.44772,8)} ${P(3,7.55228)} ${P(3,7)}`,
    `L${P(3,6.5)}`,
    `C${P(3,5.67157)} ${P(2.32843,5)} ${P(1.5,5)}`,
    `L${P(1,5)}`,
    `C${P(0.44772,5)} ${P(0,4.55228)} ${P(0,4)}`,
    `C${P(0,3.44772)} ${P(0.44772,3)} ${P(1,3)}`,
    `L${P(1.5,3)}`,
    `C${P(2.32843,3)} ${P(3,2.32843)} ${P(3,1.5)}`,
    `L${P(3,1)}`,
    `C${P(3,0.44772)} ${P(3.44772,0)} ${P(4,0)}`,
    `C${P(4.55228,0)} ${P(5,0.44772)} ${P(5,1)}`,
    `L${P(5,1.5)}`,
    'Z',
  ].join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <path d={d} fill={active ? 'black' : 'none'} stroke="black" strokeWidth={1} />
    </svg>
  );
}

function TriangleIcon({ active, size }: { active: boolean; size: number }) {
  // Right-angle triangle — same geometry as shapes.ts, scaled to size×size
  const u = (size - 4) / 8;
  const ox = 2, oy = 2;
  const P = (x: number, y: number) => `${ox + x * u},${oy + y * u}`;
  const d = [
    `M${P(7.8383,7.0638)}`,
    `L${P(0.9362,0.1617)}`,
    `C${P(0.5907,-0.1838)} ${P(0,0.0609)} ${P(0,0.5495)}`,
    `L${P(0,7.4516)}`,
    `C${P(0,7.7545)} ${P(0.2455,8)} ${P(0.5484,8)}`,
    `L${P(7.4505,8)}`,
    `C${P(7.9391,8)} ${P(8.1838,7.4093)} ${P(7.8383,7.0638)}`,
    'Z',
  ].join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <path d={d} fill={active ? 'black' : 'none'} stroke="black" strokeWidth={1} />
    </svg>
  );
}

export function RadialShapeSelector({ value, onChange }: RadialShapeSelectorProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [dragAngle, setDragAngle] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const lastHoverRef = useRef<PixelShape | null>(null);
  const { playClick } = useClickSound();

  // Display angle: live during drag, snapped at rest
  const restAngle = SNAP_ANGLES[value];
  const displayAngle = dragAngle ?? restAngle;
  const dialRotation = displayAngle - 90; // pointer is at bottom

  // Pending shape during drag (drives active fill preview + click ticks)
  const pendingShape = dragAngle !== null ? snapToNearest(dragAngle) : null;
  const activeShape = pendingShape ?? value;

  const getAngleFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = dialRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }, []);

  const handleDialPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const angle = getAngleFromEvent(e);
    lastHoverRef.current = snapToNearest(angle);
    setDragAngle(angle);
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [getAngleFromEvent]);

  const handleDialPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const angle = getAngleFromEvent(e);
    const hover = snapToNearest(angle);
    // Click sound on every snap-position change as the dial cycles through shapes
    if (hover !== lastHoverRef.current) {
      lastHoverRef.current = hover;
      playClick();
    }
    setDragAngle(angle);
  }, [dragging, getAngleFromEvent, playClick]);

  const commit = useCallback((angle: number) => {
    const next = snapToNearest(angle);
    if (next !== value) onChange(next);
    setDragging(false);
    setDragAngle(null);
    lastHoverRef.current = null;
  }, [value, onChange]);

  const handleDialPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    commit(getAngleFromEvent(e));
  }, [dragging, commit, getAngleFromEvent]);

  // Global fallback so release outside the dial still commits
  useEffect(() => {
    if (!dragging) return;
    const up = (e: PointerEvent) => {
      const el = dialRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      commit(Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI));
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging, commit]);

  const isActive = (key: PixelShape) => key === activeShape;

  // Shared button base style
  const btn = (left: number, top: number, w: number, h: number): React.CSSProperties => ({
    position: 'absolute', left, top, width: w, height: h,
    border: 'none', background: 'transparent', cursor: 'pointer',
    padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  });

  const handleShapeClick = (key: PixelShape) => {
    if (key !== value) { playClick(); onChange(key); }
  };

  return (
    <div style={{ position: 'relative', width: SELECTOR_W, height: SELECTOR_H, userSelect: 'none', touchAction: 'none' }}>

      {/* Square — outlined CSS div; active = solid black fill, same shape */}
      <button style={btn(79, 12, 32, 32)} aria-label="square" aria-pressed={value === 'square'}
        onClick={() => handleShapeClick('square')}>
        <div style={{
          width: 32, height: 32, borderRadius: 4,
          border: '1px solid black',
          background: isActive('square') ? 'black' : 'transparent',
        }} />
      </button>

      {/* Circle — outlined CSS div; active = solid black fill */}
      <button style={btn(146, 51, 32, 32)} aria-label="circle" aria-pressed={value === 'circle'}
        onClick={() => handleShapeClick('circle')}>
        <div style={{
          width: 32, height: 32, borderRadius: 100,
          border: '1px solid black',
          background: isActive('circle') ? 'black' : 'transparent',
        }} />
      </button>

      {/* Cross — upper-left, 32×32. SVG plus: stroke at rest, fill+stroke when active */}
      <button style={btn(12, 51, 32, 32)} aria-label="cross" aria-pressed={value === 'cross'}
        onClick={() => handleShapeClick('cross')}>
        <CrossIcon active={isActive('cross')} size={32} />
      </button>

      {/* Star — lower-left, 32×32. SVG sparkle: stroke at rest, fill+stroke when active */}
      <button style={btn(12, 127, 32, 32)} aria-label="star" aria-pressed={value === 'star'}
        onClick={() => handleShapeClick('star')}>
        <StarIcon active={isActive('star')} size={32} />
      </button>

      {/* Diamond — rotated CSS square; active = solid black fill */}
      <button style={btn(141, 122, 41, 41)} aria-label="diamond" aria-pressed={value === 'diamond'}
        onClick={() => handleShapeClick('diamond')}>
        <div style={{
          width: 29, height: 29, borderRadius: 4,
          border: '1px solid black',
          background: isActive('diamond') ? 'black' : 'transparent',
          transform: 'rotate(-45deg)',
        }} />
      </button>

      {/* Triangle — SVG; stroke at rest, fill+stroke when active */}
      <button style={btn(79, 166, 32, 32)} aria-label="triangle" aria-pressed={value === 'triangle'}
        onClick={() => handleShapeClick('triangle')}>
        <TriangleIcon active={isActive('triangle')} size={32} />
      </button>

      {/* Radio Dial: black 80×80 pill, dot pointer at bottom, rotates to active */}
      <div
        ref={dialRef}
        style={{
          position: 'absolute',
          left: DIAL_X, top: DIAL_Y,
          width: DIAL_W, height: DIAL_H,
          background: '#000',
          borderRadius: 100,
          cursor: dragging ? 'grabbing' : 'grab',
          zIndex: 3,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingLeft: 39, paddingRight: 39, paddingBottom: 8,
          transform: `rotate(${dialRotation}deg)`,
          transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transformOrigin: 'center center',
        }}
        onPointerDown={handleDialPointerDown}
        onPointerMove={handleDialPointerMove}
        onPointerUp={handleDialPointerUp}
      >
        {/* Dot pointer: 6 × 2×2px olive dots, 4px apart (Figma node 120:453) */}
        <div style={{ position: 'relative', width: 2, height: 22, flexShrink: 0 }}>
          {[0, 4, 8, 12, 16, 20].map((y) => (
            <div key={y} style={{
              position: 'absolute', left: 0, top: y,
              width: 2, height: 2, borderRadius: '50%',
              background: '#879900',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
