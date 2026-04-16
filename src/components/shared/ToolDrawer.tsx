import { useRef, useState, useCallback, useEffect } from 'react';
import Matter from 'matter-js';
import type { PanelDef } from './PhysicsPanels';
import {
  TICKET_SVG_PATH,
  SNOWMAN_SVG_PATH,
  CANVAS_SVG_PATH,
  ONION_SVG_PATH_V2,
  PENCIL_SVG_PATH,
  BANNER_SVG_PATH,
  DUMBBELL_SVG_PATH,
} from './PhysicsPanels';

interface ToolDrawerProps {
  panels: PanelDef[];
  containerWidth: number;
  containerHeight: number;
  onPanelDraggedOut: (panelId: string, x: number, y: number) => void;
  onOpenChange?: (open: boolean, drawerRightEdge: number) => void;
  dropPositions?: Map<string, { x: number; y: number }>;
}

const SHAPE_SVGS: Record<string, { path: string; viewBox: string }> = {
  ticket:   { path: TICKET_SVG_PATH,   viewBox: '0 0 222 175' },
  snowman:  { path: SNOWMAN_SVG_PATH,  viewBox: '0 0 221 310' },
  canvas:   { path: CANVAS_SVG_PATH,   viewBox: '0 0 341 103' },
  onion:    { path: ONION_SVG_PATH_V2, viewBox: '0 0 320 305' },
  pencil:   { path: PENCIL_SVG_PATH,   viewBox: '0 0 222 353' },
  banner:   { path: BANNER_SVG_PATH,   viewBox: '0 0 222 353' },
  dumbbell: { path: DUMBBELL_SVG_PATH, viewBox: '0 0 222 368' },
};

function getShapeSvgInfo(shape?: string) {
  if (!shape) return null;
  return SHAPE_SVGS[shape] ?? null;
}

export function ToolDrawer({ panels, containerWidth, containerHeight, onPanelDraggedOut, onOpenChange, dropPositions }: ToolDrawerProps) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const dragStartRef = useRef<{ startX: number; startOffset: number } | null>(null);

  // Panel drag-out state
  const [dragOutPanel, setDragOutPanel] = useState<string | null>(null);
  const [dragOutPos, setDragOutPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragOutStartRef = useRef<{ startX: number; startY: number; panelX: number; panelY: number } | null>(null);

  const drawerWidth = Math.round(containerWidth * (2 / 3));

  // Physics engine for panels inside the drawer
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const panelElsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeRef = useRef<() => void>(() => {});
  const prevOffsetRef = useRef(0);
  const wallsRef = useRef<{ floor: Matter.Body; left: Matter.Body; right: Matter.Body } | null>(null);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  // Drag constraint for dragging panels inside the drawer
  const panelDragRef = useRef<{ id: string; constraint: Matter.Constraint } | null>(null);
  const mouseBodyRef = useRef<Matter.Body | null>(null);

  // Initialize physics engine
  useEffect(() => {
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 },
    });
    engineRef.current = engine;

    const wallThickness = 60;
    // Walls: floor, left, right — no ceiling (panels fall in from top)
    const floor = Matter.Bodies.rectangle(
      drawerWidth / 2, containerHeight + wallThickness / 2, drawerWidth * 2, wallThickness,
      { isStatic: true, restitution: 0.3, friction: 0.8 }
    );
    const left = Matter.Bodies.rectangle(
      -wallThickness / 2, containerHeight / 2, wallThickness, containerHeight * 2,
      { isStatic: true, restitution: 0.3 }
    );
    const right = Matter.Bodies.rectangle(
      drawerWidth + wallThickness / 2, containerHeight / 2, wallThickness, containerHeight * 2,
      { isStatic: true, restitution: 0.3 }
    );
    Matter.Composite.add(engine.world, [floor, left, right]);
    wallsRef.current = { floor, left, right };

    // Mouse body for drag constraints
    const mouseBody = Matter.Bodies.circle(0, 0, 1, { isStatic: true, collisionFilter: { mask: 0 } });
    Matter.Composite.add(engine.world, mouseBody);
    mouseBodyRef.current = mouseBody;

    let restFrames = 0;
    let lastTime = performance.now();
    const step = () => {
      const now = performance.now();
      const delta = Math.min(now - lastTime, 32);
      lastTime = now;
      Matter.Engine.update(engine, delta);

      // Clamp bodies to drawer bounds
      const currentPanels = panelsRef.current;
      for (const [id, body] of bodiesRef.current) {
        const panel = currentPanels.find((p) => p.id === id);
        if (!panel) continue;
        const halfW = panel.width / 2;
        const halfH = panel.height / 2;
        const bx = Math.max(halfW, Math.min(drawerWidth - halfW, body.position.x));
        const by = Math.max(halfH, Math.min(containerHeight - halfH, body.position.y));
        if (bx !== body.position.x || by !== body.position.y) {
          Matter.Body.setPosition(body, { x: bx, y: by });
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
      }

      // Sync DOM
      let anyMoving = false;
      for (const [id, body] of bodiesRef.current) {
        const speed = Math.abs(body.velocity.x) + Math.abs(body.velocity.y) + Math.abs(body.angularVelocity);
        if (speed > 0.5) anyMoving = true;
        const el = panelElsRef.current.get(id);
        const panel = currentPanels.find((p) => p.id === id);
        if (el && panel) {
          el.style.left = `${body.position.x - panel.width / 2}px`;
          el.style.top = `${body.position.y - panel.height / 2}px`;
          el.style.transform = `rotate(${body.angle}rad)`;
        }
      }

      // Auto-pause when at rest
      if (!anyMoving && !panelDragRef.current) {
        restFrames++;
        if (restFrames > 60 && loopRef.current !== null) {
          clearInterval(loopRef.current);
          loopRef.current = null;
        }
      } else {
        restFrames = 0;
      }
    };

    const wake = () => {
      restFrames = 0;
      if (loopRef.current === null) {
        lastTime = performance.now();
        loopRef.current = setInterval(step, 1000 / 60);
      }
    };
    wakeRef.current = wake;

    loopRef.current = setInterval(step, 1000 / 60);

    return () => {
      if (loopRef.current !== null) clearInterval(loopRef.current);
      loopRef.current = null;
      Matter.Engine.clear(engine);
      bodiesRef.current.clear();
    };
  }, [drawerWidth, containerHeight]);

  // Add/remove bodies when panels change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // Add new panels at their drop position (or default if none)
    for (const panel of panels) {
      if (!bodiesRef.current.has(panel.id)) {
        let x: number;
        let y: number;
        const dropPos = dropPositions?.get(panel.id);
        if (dropPos) {
          // Use the canvas drop position — it's already in the drawer's coordinate space
          // since the drawer overlaps the left side of the canvas
          x = Math.max(panel.width / 2, Math.min(drawerWidth - panel.width / 2, dropPos.x));
          y = Math.max(panel.height / 2, Math.min(containerHeight - panel.height / 2, dropPos.y));
          dropPositions?.delete(panel.id); // consume the position
        } else {
          // No drop position (e.g. restored from localStorage) — drop from top
          x = Math.random() * (drawerWidth - panel.width) + panel.width / 2;
          y = -panel.height;
        }
        const body = Matter.Bodies.rectangle(x, y, panel.width, panel.height, {
          restitution: 0.25,
          friction: 0.6,
          frictionAir: 0.02,
          density: 0.002,
          chamfer: { radius: 16 },
        });
        Matter.Composite.add(engine.world, body);
        bodiesRef.current.set(panel.id, body);
        wakeRef.current();
      }
    }

    // Remove panels that are no longer stored
    const panelIds = new Set(panels.map((p) => p.id));
    for (const [id, body] of bodiesRef.current) {
      if (!panelIds.has(id)) {
        Matter.Composite.remove(engine.world, body);
        bodiesRef.current.delete(id);
        panelElsRef.current.delete(id);
      }
    }
  }, [panels, drawerWidth]);

  // React to drawer sliding — apply horizontal force based on velocity
  useEffect(() => {
    const prevOffset = prevOffsetRef.current;
    const velocity = offset - prevOffset;
    prevOffsetRef.current = offset;

    if (Math.abs(velocity) < 1) return;

    const engine = engineRef.current;
    if (!engine) return;

    // Apply force proportional to drawer velocity
    for (const [, body] of bodiesRef.current) {
      Matter.Body.applyForce(body, body.position, {
        x: velocity * 0.0002 * body.mass,
        y: 0,
      });
    }
    wakeRef.current();
  }, [offset]);

  // Notify parent of drawer state
  const isOpenEnough = offset > drawerWidth * 0.2;
  useEffect(() => {
    onOpenChange?.(isOpenEnough, offset);
  }, [isOpenEnough, offset, onOpenChange]);

  // Drawer handle drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    dragStartRef.current = { startX: e.clientX, startOffset: offset };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const newOffset = Math.max(0, Math.min(drawerWidth, dragStartRef.current.startOffset + dx));
    setOffset(newOffset);
  }, [drawerWidth]);

  const handlePointerUp = useCallback(() => {
    if (!dragStartRef.current) return;
    setDragging(false);
    dragStartRef.current = null;
  }, []);

  // Panel drag-out: direct DOM drag (no physics constraint — smooth 1:1 tracking)
  const handlePanelDragStart = useCallback((e: React.PointerEvent, panelId: string) => {
    e.stopPropagation();
    e.preventDefault();

    const panel = panelsRef.current.find((p) => p.id === panelId);
    const pw = panel?.width ?? 0;
    const ph = panel?.height ?? 0;

    setDragOutPanel(panelId);
    setDragOutPos({ x: e.clientX - pw / 2, y: e.clientY - ph / 2 });
    dragOutStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panelX: e.clientX - pw / 2,
      panelY: e.clientY - ph / 2,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePanelDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragOutStartRef.current || !dragOutPanel) return;
    const dx = e.clientX - dragOutStartRef.current.startX;
    const dy = e.clientY - dragOutStartRef.current.startY;
    setDragOutPos({
      x: dragOutStartRef.current.panelX + dx,
      y: dragOutStartRef.current.panelY + dy,
    });
  }, [dragOutPanel]);

  const handlePanelDragUp = useCallback((e: React.PointerEvent) => {
    if (!dragOutPanel) return;

    // Check if dropped outside the drawer
    if (e.clientX > offset) {
      // Dropped on canvas — restore panel to physics world
      const canvasX = e.clientX;
      const canvasY = e.clientY - 44;
      onPanelDraggedOut(dragOutPanel, canvasX, canvasY);
    }

    setDragOutPanel(null);
    dragOutStartRef.current = null;
  }, [dragOutPanel, offset, onPanelDraggedOut]);

  // Global pointer events during drag-out (so cursor can leave the drawer)
  useEffect(() => {
    if (!dragOutPanel) return;
    const move = (e: PointerEvent) => {
      if (!dragOutStartRef.current) return;
      const dx = e.clientX - dragOutStartRef.current.startX;
      const dy = e.clientY - dragOutStartRef.current.startY;
      setDragOutPos({
        x: dragOutStartRef.current.panelX + dx,
        y: dragOutStartRef.current.panelY + dy,
      });
    };
    const up = (e: PointerEvent) => {
      if (dragOutPanel && e.clientX > offset) {
        const canvasX = e.clientX;
        const canvasY = e.clientY - 44;
        onPanelDraggedOut(dragOutPanel, canvasX, canvasY);
      }
      setDragOutPanel(null);
      dragOutStartRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragOutPanel, offset, onPanelDraggedOut]);

  const translateX = offset - drawerWidth;

  return (
    <>
      <div
        className="tool-drawer"
        style={{
          width: drawerWidth,
          height: containerHeight,
          transform: `translateX(${translateX}px)`,
        }}
      >
        {/* Physics-driven panels */}
        <div className="tool-drawer-content">
          {panels.map((panel) => (
            <div
              key={panel.id}
              ref={(el) => { panelElsRef.current.set(panel.id, el); }}
              className={`drawer-panel ${dragOutPanel === panel.id ? 'drawer-panel--dragging' : ''}`}
              style={{
                width: panel.width,
                height: panel.height,
                position: 'absolute',
                transformOrigin: 'center center',
              }}
            >
              <DrawerPanelShape panel={panel} />
              <div
                className="drawer-panel-drag-handle"
                onPointerDown={(e) => handlePanelDragStart(e, panel.id)}
              />
            </div>
          ))}
        </div>

        {/* Handle */}
        <div
          className="tool-drawer-handle"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="tool-drawer-handle-grip">
            <span /><span /><span />
          </div>
        </div>
      </div>

      {/* Ghost panel — follows cursor directly during drag-out */}
      {dragOutPanel && (() => {
        const panel = panels.find((p) => p.id === dragOutPanel);
        if (!panel) return null;
        return (
          <div
            className="tool-drawer-ghost"
            style={{
              left: dragOutPos.x,
              top: dragOutPos.y,
              width: panel.width,
              height: panel.height,
            }}
          >
            <DrawerPanelShape panel={panel} />
          </div>
        );
      })()}
    </>
  );
}

// Renders the visual shape of a panel (SVG + children)
function DrawerPanelShape({ panel }: { panel: PanelDef }) {
  const svgInfo = getShapeSvgInfo(panel.shape);
  const isPill = panel.shape === 'pill';

  if (isPill) {
    return (
      <div
        className="drawer-panel-inner pill-panel"
        style={{
          width: panel.width,
          height: panel.height,
          backgroundColor: panel.color,
        }}
      >
        <div className="pill-header">
          <div className="floating-panel-drag-icon" />
          <span className="pill-title">{panel.title}</span>
        </div>
        <div className="pill-body">{panel.children}</div>
      </div>
    );
  }

  const shapeClass = panel.shape ? `${panel.shape}-panel` : '';
  const innerContent = renderShapeInner(panel);

  return (
    <div
      className={`drawer-panel-inner ${shapeClass}`}
      style={{ width: panel.width, height: panel.height }}
    >
      {svgInfo && (
        <svg
          width={panel.width}
          height={panel.height}
          viewBox={svgInfo.viewBox}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <path d={svgInfo.path} fill={panel.color} />
        </svg>
      )}
      {innerContent}
    </div>
  );
}

function renderShapeInner(panel: PanelDef): React.ReactNode {
  const dragIcon = <div className="floating-panel-drag-icon" />;

  switch (panel.shape) {
    case 'banner':
      return (
        <>
          <div className="banner-header">
            <span className="banner-title">{panel.title}</span>
            {dragIcon}
          </div>
          <div className="banner-body">{panel.children}</div>
        </>
      );
    case 'dumbbell':
      return (
        <>
          <div className="dumbbell-header">
            <span className="dumbbell-title">{panel.title}</span>
            {dragIcon}
          </div>
          <div className="dumbbell-body">{panel.children}</div>
        </>
      );
    case 'canvas':
      return (
        <>
          <div className="canvas-panel-drag">{dragIcon}</div>
          <div className="canvas-panel-label">CANVAS</div>
          <div className="canvas-panel-body">{panel.children}</div>
        </>
      );
    case 'onion':
      return (
        <>
          <div className="onion-header">
            {dragIcon}
            <span className="onion-title">{panel.title}</span>
          </div>
          <div className="onion-body">{panel.children}</div>
        </>
      );
    case 'pencil':
      return (
        <>
          <div className="pencil-drag">{dragIcon}</div>
          <div className="pencil-title">{panel.title}</div>
          <div className="pencil-body">{panel.children}</div>
        </>
      );
    case 'snowman':
      return (
        <>
          <div className="snowman-head">
            <div className="snowman-drag">{dragIcon}</div>
            <div className="snowman-title">{panel.title}</div>
          </div>
          <div className="snowman-body">{panel.children}</div>
        </>
      );
    case 'ticket':
      return (
        <>
          <div className="floating-panel-header ticket-header">
            <span className="floating-panel-title">{panel.title}</span>
            {dragIcon}
          </div>
          <div className="ticket-body">{panel.children}</div>
        </>
      );
    default:
      return (
        <>
          <div className="floating-panel-header">
            <span className="floating-panel-title">{panel.title}</span>
            {dragIcon}
          </div>
          <div className="floating-panel-body">{panel.children}</div>
        </>
      );
  }
}
