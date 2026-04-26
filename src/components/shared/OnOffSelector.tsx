import { useRef, useCallback, useState, useEffect } from 'react';
import { useClickSound } from '../../hooks/useClickSound';

interface OnOffSelectorProps {
  /** Current on/off state. */
  value: boolean;
  /** Called with the new boolean state when the dial snaps. */
  onChange: (next: boolean) => void;
  /**
   * Accent color for the indicator + active label. Defaults to the Forest
   * Tone brown so the selector feels at home inside the mushroom panel.
   */
  accent?: string;
}

/**
 * Two-position dial: ON (left) vs OFF (right). Same drag/click model as
 * RadialMirrorSelector / RadialShapeSelector — drag the central dial to
 * snap between the two side buttons, or click a button directly.
 *
 * Layout matches the supplied Figma frame (Forest Tone, 174×80 control area):
 *   [ON button 38] ── dotted line ──[ DIAL 80 ]── dotted line ── [OFF button 38]
 */
const SELECTOR_W = 174;
const SELECTOR_H = 80;
const BTN_SIZE = 38;
const DIAL_SIZE = 80;
const DIAL_LEFT = (SELECTOR_W - DIAL_SIZE) / 2; // 47
const DIAL_TOP = 0;
const DIAL_CX = DIAL_LEFT + DIAL_SIZE / 2; // 87
const DIAL_CY = DIAL_TOP + DIAL_SIZE / 2;  // 40

// Two snap positions: ON at angle 180° (pointing left), OFF at 0° (pointing right).
const OPTIONS: { key: 'on' | 'off'; left: number; top: number; angle: number; label: string }[] = [
  { key: 'on',  left: 0,                       top: (SELECTOR_H - BTN_SIZE) / 2, angle: 180, label: 'ON' },
  { key: 'off', left: SELECTOR_W - BTN_SIZE,   top: (SELECTOR_H - BTN_SIZE) / 2, angle: 0,   label: 'OFF' },
];

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function snapToNearest(angleDeg: number): 'on' | 'off' {
  // ON is at ±180, OFF at 0. The midpoint is ±90: anything with |dx|<90 from
  // 0 snaps to OFF, otherwise ON. Easier: compare to the two option angles.
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

export function OnOffSelector({ value, onChange, accent = '#966538' }: OnOffSelectorProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragAngle, setDragAngle] = useState<number | null>(null);
  const clickFiredRef = useRef(false);
  const lastHoverRef = useRef<'on' | 'off' | null>(null);
  const { playClick } = useClickSound();

  const activeKey: 'on' | 'off' = value ? 'on' : 'off';
  const activeOption = OPTIONS.find((o) => o.key === activeKey) ?? OPTIONS[0];
  const displayAngle = dragAngle ?? activeOption.angle;

  const getAngleFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = dialRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }, []);

  const commit = useCallback((next: 'on' | 'off') => {
    const nextBool = next === 'on';
    if (nextBool !== value && !clickFiredRef.current) {
      clickFiredRef.current = true;
      playClick();
    }
    onChange(nextBool);
  }, [onChange, playClick, value]);

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
    if (dragAngle !== null) commit(snapToNearest(dragAngle));
    setDragging(false);
    setDragAngle(null);
  }, [dragging, dragAngle, commit]);

  // Global pointerup fallback (release outside the dial)
  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      if (dragAngle !== null) commit(snapToNearest(dragAngle));
      setDragging(false);
      setDragAngle(null);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging, dragAngle, commit]);

  return (
    <div
      className="onoff-selector"
      style={{ width: SELECTOR_W, height: SELECTOR_H, '--dial-color': accent } as React.CSSProperties}
    >
      {/* Decorative horizontal dotted line through the dial center */}
      <svg
        className="onoff-line"
        width={SELECTOR_W}
        height={SELECTOR_H}
        viewBox={`0 0 ${SELECTOR_W} ${SELECTOR_H}`}
      >
        <line
          x1={BTN_SIZE} y1={DIAL_CY}
          x2={SELECTOR_W - BTN_SIZE} y2={DIAL_CY}
          stroke="black"
          strokeWidth="2"
          strokeDasharray="3 6"
          strokeLinecap="round"
        />
      </svg>

      {/* ON / OFF pill buttons */}
      {OPTIONS.map((o) => {
        const isActive = o.key === activeKey;
        const isHover = dragging && dragAngle !== null && snapToNearest(dragAngle) === o.key;
        return (
          <button
            key={o.key}
            className={`onoff-btn onoff-btn--${o.key} ${isActive ? 'onoff-btn--active' : ''} ${isHover ? 'onoff-btn--hover' : ''}`}
            style={{
              position: 'absolute',
              left: o.left,
              top: o.top,
              width: BTN_SIZE,
              height: BTN_SIZE,
              // Inactive ON: black with accent text. Active ON: filled accent.
              // Inactive OFF: accent fill with black border + black text. Active OFF: black with accent text.
              // We let CSS handle the variants via the active modifier.
              ['--accent' as string]: accent,
            } as React.CSSProperties}
            onClick={() => {
              const nextBool = o.key === 'on';
              if (nextBool !== value) playClick();
              onChange(nextBool);
            }}
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
