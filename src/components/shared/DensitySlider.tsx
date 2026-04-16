import { useRef, useCallback, useState, useEffect } from 'react';

interface DensitySliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function DensitySlider({ value, min, max, onChange }: DensitySliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [, forceUpdate] = useState(0);

  const fraction = (value - min) / (max - min);

  const valueFromX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return min;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return min + (x / rect.width) * (max - min);
  }, [min, max]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;
    forceUpdate((n) => n + 1);
    onChange(valueFromX(e.clientX));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [valueFromX, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    onChange(valueFromX(e.clientX));
  }, [valueFromX, onChange]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
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
          style={{ left: `calc(${fraction * 100}% - 4px)` }}
        />
      </div>
    </div>
  );
}
