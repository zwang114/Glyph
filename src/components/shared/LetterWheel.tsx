import { useRef, useCallback, useEffect, useState } from 'react';
import { BASIC_LATIN } from '../../utils/charset';

interface LetterWheelProps {
  /** Currently assigned character (single char) or null. */
  value: string | null;
  /** All characters already taken by other canvases (disabled, cannot commit). */
  disabled: Set<string>;
  /** Commit a valid (non-disabled) letter to the selected canvas. */
  onCommit: (letter: string) => void;
}

const ITEM_HEIGHT = 22;
const GAP = 15;
const STEP = ITEM_HEIGHT + GAP; // 37

// Full character list — BASIC_LATIN is constant, so derive once at module scope.
const chars = BASIC_LATIN.map((c) => c.char);

/**
 * Vertical letter wheel (iOS-picker style). Scroll / drag / wheel to cycle
 * through the full BASIC_LATIN character set. The centered slot is the
 * "active" letter; if it's disabled, we do not commit (canvas keeps previous
 * assignment). Disabled letters render at 40% opacity.
 */
export function LetterWheel({ value, disabled, onCommit }: LetterWheelProps) {
  // Find initial index from current value
  const initialIndex = value ? Math.max(0, chars.indexOf(value)) : 0;

  // Wheel offset in pixels. offset = 0 means chars[0] is centered.
  // Negative scroll moves later characters into view.
  const [offset, setOffset] = useState<number>(initialIndex * STEP);
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Keep wheel in sync if the canvas's letter is changed externally.
  // Adjusting state during render (with a previous-value guard) avoids the
  // extra commit an effect-based sync would cause.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) {
      const idx = chars.indexOf(value);
      if (idx >= 0) setOffset(idx * STEP);
    }
  }

  const commitIfValid = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(chars.length - 1, idx));
      const letter = chars[clamped];
      if (disabled.has(letter)) return; // keep previous assignment
      onCommit(letter);
    },
    [disabled, onCommit]
  );

  const snapToNearest = useCallback(
    (raw: number) => {
      const idx = Math.round(raw / STEP);
      const clamped = Math.max(0, Math.min(chars.length - 1, idx));
      setOffset(clamped * STEP);
      commitIfValid(clamped);
    },
    [commitIfValid]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;
    lastYRef.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dy = e.clientY - lastYRef.current;
    lastYRef.current = e.clientY;
    // Drag down = move toward earlier letters (decrease offset)
    setOffset((prev) => {
      const next = prev - dy;
      const max = (chars.length - 1) * STEP;
      return Math.max(0, Math.min(max, next));
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setOffset((prev) => {
      const idx = Math.round(prev / STEP);
      const clamped = Math.max(0, Math.min(chars.length - 1, idx));
      commitIfValid(clamped);
      return clamped * STEP;
    });
  }, [commitIfValid]);

  // Wheel / trackpad scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    // preventDefault on wheel requires passive:false listener; skip and just scroll
    const dy = e.deltaY;
    setOffset((prev) => {
      const next = prev + dy;
      const max = (chars.length - 1) * STEP;
      return Math.max(0, Math.min(max, next));
    });
  }, []);

  // Debounced snap-on-wheel-stop using offset changes
  const snapTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (draggingRef.current) return;
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      snapToNearest(offset);
    }, 140);
    return () => {
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    };
  }, [offset, snapToNearest]);

  return (
    <div
      ref={wheelRef}
      className="letter-wheel"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <div
        className="letter-wheel-track"
        style={{ transform: `translateY(${-offset}px)` }}
      >
        {chars.map((ch) => {
          const isDisabled = disabled.has(ch);
          return (
            <div
              key={ch}
              className={`letter-wheel-item${isDisabled ? ' is-disabled' : ''}`}
            >
              {ch === ' ' ? '\u00A0' : ch}
            </div>
          );
        })}
      </div>
    </div>
  );
}
