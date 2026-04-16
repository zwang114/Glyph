import { useRef, useCallback, useState, useEffect } from 'react';
import type { MirrorMode } from '../../types/editor';

interface RadialMirrorSelectorProps {
  value: MirrorMode;
  onChange: (mode: MirrorMode) => void;
}

// 4 mirror options arranged in a cross pattern (exact Figma positions within 190x190 area)
const OPTIONS: { key: MirrorMode; label: string; left: number; top: number; angle: number }[] = [
  { key: 'none',       label: 'OFF', left: 75,  top: 0,   angle: -90 },  // top
  { key: 'horizontal', label: 'H',   left: 0,   top: 75,  angle: 180 },  // left
  { key: 'vertical',   label: 'V',   left: 150, top: 75,  angle: 0 },    // right
  { key: 'both',       label: 'H+V', left: 75,  top: 150, angle: 90 },   // bottom
];

const SELECTOR_SIZE = 190;
const DIAL_SIZE = 80;
const DIAL_LEFT = 55;
const DIAL_TOP = 55;
const DIAL_CX = DIAL_LEFT + DIAL_SIZE / 2; // 95
const DIAL_CY = DIAL_TOP + DIAL_SIZE / 2;  // 95
const BTN_SIZE = 40;
const CIRCLE_SIZE = 150;

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function snapToNearest(angleDeg: number): MirrorMode {
  let best = OPTIONS[0];
  let bestDist = Infinity;
  for (const o of OPTIONS) {
    const dist = Math.abs(normalizeAngle(angleDeg - o.angle));
    if (dist < bestDist) {
      bestDist = dist;
      best = o;
    }
  }
  return best.key;
}

export function RadialMirrorSelector({ value, onChange }: RadialMirrorSelectorProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragAngle, setDragAngle] = useState<number | null>(null);

  const activeOption = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];
  const displayAngle = dragAngle ?? activeOption.angle;

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
    setDragging(true);
    setDragAngle(getAngleFromEvent(e));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [getAngleFromEvent]);

  const handleDialPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragAngle(getAngleFromEvent(e));
  }, [dragging, getAngleFromEvent]);

  const handleDialPointerUp = useCallback(() => {
    if (!dragging) return;
    if (dragAngle !== null) onChange(snapToNearest(dragAngle));
    setDragging(false);
    setDragAngle(null);
  }, [dragging, dragAngle, onChange]);

  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      if (dragAngle !== null) onChange(snapToNearest(dragAngle));
      setDragging(false);
      setDragAngle(null);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging, dragAngle, onChange]);

  return (
    <div
      className="mirror-selector"
      style={{ width: SELECTOR_SIZE, height: SELECTOR_SIZE, '--dial-color': '#aeaeae' } as React.CSSProperties}
    >
      {/* Decorative dotted circle */}
      <svg
        className="mirror-selector-circle"
        width={SELECTOR_SIZE}
        height={SELECTOR_SIZE}
        viewBox={`0 0 ${SELECTOR_SIZE} ${SELECTOR_SIZE}`}
      >
        <circle
          cx={DIAL_CX}
          cy={DIAL_CY}
          r={CIRCLE_SIZE / 2}
          fill="none"
          stroke="black"
          strokeWidth="1"
          strokeDasharray="3 6"
          strokeLinecap="round"
        />
      </svg>

      {/* Option buttons at exact Figma positions */}
      {OPTIONS.map((o) => {
        const isActive = o.key === value;
        const isHover = dragging && dragAngle !== null && snapToNearest(dragAngle) === o.key;
        return (
          <button
            key={o.key}
            className={`mirror-sel-btn ${isActive ? 'mirror-sel-btn--active' : ''} ${isHover ? 'mirror-sel-btn--hover' : ''}`}
            style={{
              position: 'absolute',
              left: o.left,
              top: o.top,
              width: BTN_SIZE,
              height: BTN_SIZE,
            }}
            onClick={() => onChange(o.key)}
          >
            {o.label}
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
