import { useRef, useCallback, useEffect, useState } from 'react';

interface LeverOption<T extends string> {
  key: T;
  label: string;
}

interface VerticalLeverProps<T extends string> {
  options: LeverOption<T>[];
  value: T;
  onChange: (key: T) => void;
  trackHeight?: number;
  trackWidth?: number;
}

export function VerticalLever<T extends string>({
  options,
  value,
  onChange,
  trackHeight = 180,
  trackWidth = 56,
}: VerticalLeverProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);

  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));
  const stopCount = options.length;
  // Y positions of each snap stop (center of each thumb position)
  const stopSpacing = trackHeight / stopCount;
  const stopYs = options.map((_, i) => stopSpacing * (i + 0.5));

  const thumbY = dragY ?? stopYs[activeIndex];

  const yToIndex = useCallback((y: number) => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < stopYs.length; i++) {
      const d = Math.abs(y - stopYs[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }, [stopYs]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = Math.max(0, Math.min(trackHeight, e.clientY - rect.top));
    setDragging(true);
    setDragY(y);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [trackHeight]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = Math.max(0, Math.min(trackHeight, e.clientY - rect.top));
    setDragY(y);
  }, [dragging, trackHeight]);

  const handlePointerUp = useCallback(() => {
    if (!dragging) return;
    if (dragY !== null) {
      const idx = yToIndex(dragY);
      onChange(options[idx].key);
    }
    setDragging(false);
    setDragY(null);
  }, [dragging, dragY, yToIndex, onChange, options]);

  // Click on a label to snap directly
  const handleLabelClick = useCallback((key: T) => {
    onChange(key);
  }, [onChange]);

  // Make thumb slightly smaller than stop spacing
  const thumbHeight = Math.min(stopSpacing - 8, 40);

  useEffect(() => {
    if (!dragging) return;
    const up = () => handlePointerUp();
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging, handlePointerUp]);

  return (
    <div className="lever" style={{ width: trackWidth + 120, height: trackHeight }}>
      {/* Track */}
      <div
        className="lever-track"
        ref={trackRef}
        style={{ width: trackWidth, height: trackHeight }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Thumb */}
        <div
          className={`lever-thumb ${dragging ? 'lever-thumb--dragging' : ''}`}
          style={{
            width: trackWidth - 8,
            height: thumbHeight,
            top: thumbY - thumbHeight / 2,
            transition: dragging ? 'none' : 'top 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>

      {/* Labels */}
      <div className="lever-labels" style={{ height: trackHeight }}>
        {options.map((opt, i) => {
          const isActive = opt.key === value;
          const isHover = dragY !== null && yToIndex(dragY) === i;
          return (
            <div
              key={opt.key}
              className={`lever-label ${isActive ? 'lever-label--active' : ''} ${isHover ? 'lever-label--hover' : ''}`}
              style={{ top: stopYs[i], transform: 'translateY(-50%)' }}
              onClick={() => handleLabelClick(opt.key)}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
