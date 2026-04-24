import { useRef, useCallback, useState, useEffect } from 'react';
import { useClickSound } from '../../hooks/useClickSound';

interface DensitySliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function DensitySlider({ value, min, max, onChange }: DensitySliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastTickRef = useRef(-1);
  const lastClickTimeRef = useRef(0);
  const [, forceUpdate] = useState(0);
  const { playClick } = useClickSound();

  const fraction = (value - min) / (max - min);

  const valueFromX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return min;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const raw = min + (x / rect.width) * (max - min);
    // Snap to 1% increments of the (min..max) range
    const step = (max - min) / 100;
    return Math.round(raw / step) * step;
  }, [min, max]);

  const playClickThrottled = useCallback(() => {
    const now = performance.now();
    if (now - lastClickTimeRef.current >= 80) {
      lastClickTimeRef.current = now;
      playClick();
    }
  }, [playClick]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;
    lastClickTimeRef.current = 0;
    const v = valueFromX(e.clientX);
    lastTickRef.current = Math.floor(((v - min) / (max - min)) * 100);
    playClickThrottled();
    forceUpdate((n) => n + 1);
    onChange(v);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [valueFromX, onChange, min, max, playClickThrottled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const v = valueFromX(e.clientX);
    const tick = Math.floor(((v - min) / (max - min)) * 100);
    if (tick !== lastTickRef.current) {
      lastTickRef.current = tick;
      playClickThrottled();
    }
    onChange(v);
  }, [valueFromX, onChange, min, max, playClickThrottled]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    lastTickRef.current = -1;
  }, []);

  useEffect(() => {
    const up = () => { draggingRef.current = false; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  return (
    <div
      className="density-slider"
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="density-slider-track">
        <div
          className="density-slider-thumb"
          style={{ left: `calc((100% - var(--thumb-w, 48px)) * ${fraction})` }}
        >
          <svg
            className="density-slider-thumb-grip"
            width="8"
            height="11"
            viewBox="0 0 8 11"
            aria-hidden="true"
          >
            <rect x="0" y="0" width="1" height="11" fill="#000" />
            <rect x="3.5" y="0" width="1" height="11" fill="#000" />
            <rect x="7" y="0" width="1" height="11" fill="#000" />
          </svg>
          <span className="density-slider-thumb-value">{Math.round(fraction * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
