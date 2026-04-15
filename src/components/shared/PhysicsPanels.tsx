import { useRef, useEffect, useState, useCallback } from 'react';
import Matter from 'matter-js';

interface PanelDef {
  id: string;
  width: number;
  height: number;
  color: string;
  title: string;
  children: React.ReactNode;
}

interface PhysicsPanelsProps {
  panels: PanelDef[];
  containerWidth: number;
  containerHeight: number;
}

export function PhysicsPanels({ panels, containerWidth, containerHeight }: PhysicsPanelsProps) {
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const [positions, setPositions] = useState<Map<string, { x: number; y: number; angle: number }>>(new Map());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ id: string; constraint: Matter.Constraint } | null>(null);
  const mouseBodyRef = useRef<Matter.Body | null>(null);

  useEffect(() => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    engineRef.current = engine;

    const wallThickness = 60;
    const floor = Matter.Bodies.rectangle(
      containerWidth / 2, containerHeight + wallThickness / 2, containerWidth * 2, wallThickness,
      { isStatic: true, restitution: 0.3, friction: 0.8 }
    );
    const ceiling = Matter.Bodies.rectangle(
      containerWidth / 2, -wallThickness / 2, containerWidth * 2, wallThickness,
      { isStatic: true, restitution: 0.3 }
    );
    const leftWall = Matter.Bodies.rectangle(
      -wallThickness / 2, containerHeight / 2, wallThickness, containerHeight * 2,
      { isStatic: true, restitution: 0.3 }
    );
    const rightWall = Matter.Bodies.rectangle(
      containerWidth + wallThickness / 2, containerHeight / 2, wallThickness, containerHeight * 2,
      { isStatic: true, restitution: 0.3 }
    );
    Matter.Composite.add(engine.world, [floor, ceiling, leftWall, rightWall]);

    const startX = 140;
    let startY = 100;
    for (const panel of panels) {
      const body = Matter.Bodies.rectangle(
        startX, startY, panel.width, panel.height,
        {
          restitution: 0.25, friction: 0.6, frictionAir: 0.02,
          chamfer: { radius: 16 }, density: 0.002,
        }
      );
      Matter.Composite.add(engine.world, body);
      bodiesRef.current.set(panel.id, body);
      startY += panel.height + 30;
    }

    const mouseBody = Matter.Bodies.circle(0, 0, 1, { isStatic: true, collisionFilter: { mask: 0 } });
    Matter.Composite.add(engine.world, mouseBody);
    mouseBodyRef.current = mouseBody;

    let lastTime = performance.now();
    const step = () => {
      const now = performance.now();
      const delta = Math.min(now - lastTime, 32);
      lastTime = now;
      Matter.Engine.update(engine, delta);

      const margin = 10;
      for (const [, body] of bodiesRef.current) {
        const bx = Math.max(margin, Math.min(containerWidth - margin, body.position.x));
        const by = Math.max(margin, Math.min(containerHeight - margin, body.position.y));
        if (bx !== body.position.x || by !== body.position.y) {
          Matter.Body.setPosition(body, { x: bx, y: by });
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
      }

      const newPositions = new Map<string, { x: number; y: number; angle: number }>();
      for (const [id, body] of bodiesRef.current) {
        newPositions.set(id, { x: body.position.x, y: body.position.y, angle: body.angle });
      }
      setPositions(newPositions);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafRef.current);
      Matter.Engine.clear(engine);
    };
  }, [containerWidth, containerHeight, panels.length]);

  // Sync pinned state to physics bodies
  useEffect(() => {
    for (const [id, body] of bodiesRef.current) {
      const isPinned = pinned.has(id);
      if (isPinned && !body.isStatic) {
        Matter.Body.setStatic(body, true);
        Matter.Body.setAngle(body, 0);
      } else if (!isPinned && body.isStatic) {
        Matter.Body.setStatic(body, false);
      }
    }
  }, [pinned]);

  const handleDragStart = useCallback((e: React.PointerEvent, panelId: string) => {
    e.stopPropagation();
    if (pinned.has(panelId)) return;

    const engine = engineRef.current;
    const body = bodiesRef.current.get(panelId);
    const mouseBody = mouseBodyRef.current;
    if (!engine || !body || !mouseBody) return;

    Matter.Body.setPosition(mouseBody, { x: e.clientX, y: e.clientY - 44 });

    const constraint = Matter.Constraint.create({
      bodyA: mouseBody,
      bodyB: body,
      pointB: {
        x: e.clientX - body.position.x,
        y: (e.clientY - 44) - body.position.y,
      },
      stiffness: 0.7, damping: 0.3, length: 0,
    });

    Matter.Composite.add(engine.world, constraint);
    dragRef.current = { id: panelId, constraint };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pinned]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !mouseBodyRef.current) return;
    const mx = Math.max(0, Math.min(containerWidth, e.clientX));
    const my = Math.max(0, Math.min(containerHeight, e.clientY - 44));
    Matter.Body.setPosition(mouseBodyRef.current, { x: mx, y: my });
  }, [containerWidth, containerHeight]);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current || !engineRef.current) return;
    Matter.Composite.remove(engineRef.current.world, dragRef.current.constraint);
    dragRef.current = null;
  }, []);

  const handleTogglePin = useCallback((e: React.MouseEvent, panelId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  }, []);

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {panels.map((panel) => {
        const pos = positions.get(panel.id);
        if (!pos) return null;
        const isPinned = pinned.has(panel.id);
        return (
          <div
            key={panel.id}
            className="floating-panel"
            style={{
              left: pos.x - panel.width / 2,
              top: pos.y - panel.height / 2,
              width: panel.width,
              backgroundColor: panel.color,
              transform: `rotate(${pos.angle}rad)`,
              transformOrigin: 'center center',
              pointerEvents: 'auto',
            }}
          >
            <div className="floating-panel-header">
              <span className="floating-panel-title">{panel.title}</span>
              <div
                className={`floating-panel-drag-icon ${isPinned ? 'pinned' : ''}`}
                onPointerDown={(e) => handleDragStart(e, panel.id)}
                onContextMenu={(e) => handleTogglePin(e, panel.id)}
                style={{ cursor: isPinned ? 'default' : 'grab' }}
              />
            </div>
            <div className="floating-panel-body">{panel.children}</div>
          </div>
        );
      })}
    </div>
  );
}
