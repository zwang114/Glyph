import { useRef, useState, useCallback } from 'react';

interface DraggablePanelProps {
  title: string;
  color: string;
  initialX: number;
  initialY: number;
  width?: number;
  children: React.ReactNode;
}

export function DraggablePanel({
  title,
  color,
  initialX,
  initialY,
  width,
  children,
}: DraggablePanelProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      className="floating-panel"
      style={{
        left: pos.x,
        top: pos.y,
        backgroundColor: color,
        width: width ?? 'auto',
      }}
    >
      <div
        className="floating-panel-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="floating-panel-title">{title}</span>
        <div className="floating-panel-drag-icon" />
      </div>
      <div className="floating-panel-body">{children}</div>
    </div>
  );
}
