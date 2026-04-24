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
  TRIANGLE_SVG_PATH,
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
  canvas:   { path: CANVAS_SVG_PATH,   viewBox: '0 0 228 106' },
  onion:    { path: ONION_SVG_PATH_V2, viewBox: '0 0 320 225' },
  pencil:   { path: PENCIL_SVG_PATH,   viewBox: '0 0 222 353' },
  banner:   { path: BANNER_SVG_PATH,   viewBox: '0 0 222 227' },
  dumbbell: { path: DUMBBELL_SVG_PATH, viewBox: '0 0 222 302' },
  triangle: { path: TRIANGLE_SVG_PATH, viewBox: '0 0 222 200' },
};

function getShapeSvgInfo(shape?: string) {
  if (!shape) return null;
  return SHAPE_SVGS[shape] ?? null;
}

export function ToolDrawer({ panels, containerWidth, containerHeight, onPanelDraggedOut, onOpenChange, dropPositions }: ToolDrawerProps) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const dragStartRef = useRef<{ startX: number; startOffset: number } | null>(null);

  // Panel drag state
  const [physicsDragging, setPhysicsDragging] = useState(false);
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
  const wallsRef = useRef<{ floor: Matter.Body; ceiling: Matter.Body; left: Matter.Body; right: Matter.Body } | null>(null);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  // Drag constraint for dragging panels inside the drawer
  const panelDragRef = useRef<{ id: string; constraint: Matter.Constraint } | null>(null);
  const mouseBodyRef = useRef<Matter.Body | null>(null);

  // Initialize physics engine — tuned to match the canvas PhysicsPanels feel
  useEffect(() => {
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
    });
    engineRef.current = engine;

    const wallThickness = 60;
    const wallOpts = { isStatic: true, restitution: 0.4, friction: 0.3 };
    const floor = Matter.Bodies.rectangle(
      drawerWidth / 2, containerHeight + wallThickness / 2, drawerWidth * 2, wallThickness, wallOpts
    );
    const ceiling = Matter.Bodies.rectangle(
      drawerWidth / 2, -wallThickness / 2, drawerWidth * 2, wallThickness, wallOpts
    );
    const left = Matter.Bodies.rectangle(
      -wallThickness / 2, containerHeight / 2, wallThickness, containerHeight * 2, wallOpts
    );
    const right = Matter.Bodies.rectangle(
      drawerWidth + wallThickness / 2, containerHeight / 2, wallThickness, containerHeight * 2, wallOpts
    );
    Matter.Composite.add(engine.world, [floor, ceiling, left, right]);
    wallsRef.current = { floor, ceiling, left, right };

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

      // Soft clamp + angular damping + rotation cap (mirrors canvas physics)
      const currentPanels = panelsRef.current;
      const draggingId = panelDragRef.current?.id ?? null;
      const MAX_TILT = 0.35;
      for (const [id, body] of bodiesRef.current) {
        const panel = currentPanels.find((p) => p.id === id);
        if (!panel || body.isStatic) continue;

        Matter.Body.setAngularVelocity(body, body.angularVelocity * 0.92);

        if (id !== draggingId) {
          if (body.angle > MAX_TILT) {
            Matter.Body.setAngle(body, MAX_TILT);
            Matter.Body.setAngularVelocity(body, -body.angularVelocity * 0.3);
          } else if (body.angle < -MAX_TILT) {
            Matter.Body.setAngle(body, -MAX_TILT);
            Matter.Body.setAngularVelocity(body, -body.angularVelocity * 0.3);
          }
        }

        const halfW = panel.width / 2;
        const halfH = panel.height / 2;
        const bx = Math.max(halfW, Math.min(drawerWidth - halfW, body.position.x));
        const by = Math.max(halfH, Math.min(containerHeight - halfH, body.position.y));
        if (bx !== body.position.x || by !== body.position.y) {
          Matter.Body.setPosition(body, { x: bx, y: by });
          // Only dampen, don't zero — preserves momentum
          Matter.Body.setVelocity(body, {
            x: body.velocity.x * 0.5,
            y: body.velocity.y * 0.5,
          });
        }
      }

      // Sync DOM
      let anyMoving = false;
      for (const [id, body] of bodiesRef.current) {
        const speed = Math.abs(body.velocity.x) + Math.abs(body.velocity.y) + Math.abs(body.angularVelocity);
        if (speed > 0.3) anyMoving = true;
        const el = panelElsRef.current.get(id);
        const panel = currentPanels.find((p) => p.id === id);
        if (el && panel) {
          el.style.left = `${body.position.x - panel.width / 2}px`;
          el.style.top = `${body.position.y - panel.height / 2}px`;
          el.style.transform = `rotate(${body.angle}rad)`;
        }
      }

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

  // Add/remove bodies when panels change — use same physics as canvas
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const bodyOpts = {
      restitution: 0.25,
      friction: 0.3,
      frictionAir: 0.015,
      density: 0.002,
    };

    for (const panel of panels) {
      if (!bodiesRef.current.has(panel.id)) {
        let x: number;
        let y: number;
        const dropPos = dropPositions?.get(panel.id);
        if (dropPos) {
          // Clamp inside the drawer's currently visible region. Using `offset`
          // (actual open width) instead of the 2/3 design width prevents
          // panels from landing off-screen when the drawer is only partly open.
          const visibleW = Math.max(panel.width, offset || drawerWidth);
          x = Math.max(panel.width / 2, Math.min(visibleW - panel.width / 2, dropPos.x));
          y = Math.max(panel.height / 2, Math.min(containerHeight - panel.height / 2, dropPos.y));
          dropPositions?.delete(panel.id);
        } else {
          x = Math.random() * (drawerWidth - panel.width) + panel.width / 2;
          y = -panel.height;
        }

        // Use chamfer radius based on shape for better collision matching
        let chamferRadius = 16;
        if (panel.shape === 'pill') chamferRadius = Math.min(panel.width, panel.height) / 2 - 1;
        else if (panel.shape === 'onion') chamferRadius = Math.min(panel.width, panel.height) / 3;
        else if (panel.shape === 'banner' || panel.shape === 'pencil') chamferRadius = 8;

        const body = Matter.Bodies.rectangle(x, y, panel.width, panel.height, {
          ...bodyOpts,
          chamfer: { radius: chamferRadius },
        });
        Matter.Composite.add(engine.world, body);
        bodiesRef.current.set(panel.id, body);
        wakeRef.current();
      }
    }

    const panelIds = new Set(panels.map((p) => p.id));
    for (const [id, body] of bodiesRef.current) {
      if (!panelIds.has(id)) {
        Matter.Composite.remove(engine.world, body);
        bodiesRef.current.delete(id);
        panelElsRef.current.delete(id);
      }
    }
  }, [panels, drawerWidth]);

  // React to drawer sliding — stronger force for natural feel
  useEffect(() => {
    const prevOffset = prevOffsetRef.current;
    const velocity = offset - prevOffset;
    prevOffsetRef.current = offset;

    if (Math.abs(velocity) < 0.5) return;

    const engine = engineRef.current;
    if (!engine) return;

    for (const [, body] of bodiesRef.current) {
      Matter.Body.applyForce(body, body.position, {
        x: velocity * 0.0005 * body.mass,
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
    if (e.button !== 0) return;
    if (e.buttons !== undefined && e.buttons !== 1) return;
    e.stopPropagation();
    dragStartRef.current = { startX: e.clientX, startOffset: offset };
    setDragging(true);
  }, [offset]);

  // Window-level listeners for the drawer handle drag — avoids pointer capture
  // losing the drag on trackpads.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const newOffset = Math.max(0, Math.min(drawerWidth, dragStartRef.current.startOffset + dx));
      setOffset(newOffset);
    };
    const onUp = () => {
      setDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, drawerWidth]);

  // Panel drag: starts with physics constraint inside drawer,
  // transitions to direct DOM ghost when cursor crosses drawer edge
  const handlePanelDragStart = useCallback((e: React.PointerEvent, panelId: string) => {
    // Only start drag on a real left-button press — ignore trackpad hover/force-touch quirks.
    if (e.button !== 0) return;
    if (e.buttons !== undefined && e.buttons !== 1) return;

    e.stopPropagation();
    e.preventDefault();

    const engine = engineRef.current;
    const body = bodiesRef.current.get(panelId);
    const mouseBody = mouseBodyRef.current;
    if (!engine || !body || !mouseBody) return;

    // Position mouse body at cursor (relative to drawer)
    const drawerEl = (e.currentTarget as HTMLElement).closest('.tool-drawer');
    const drawerRect = drawerEl?.getBoundingClientRect();
    const localX = e.clientX - (drawerRect?.left ?? 0);
    const localY = e.clientY - (drawerRect?.top ?? 0);

    Matter.Body.setPosition(mouseBody, { x: localX, y: localY });

    // Rotate the grab offset into body-local coords so a tilted panel doesn't
    // jerk when grabbed.
    const dx = localX - body.position.x;
    const dy = localY - body.position.y;
    const cos = Math.cos(-body.angle);
    const sin = Math.sin(-body.angle);
    const constraint = Matter.Constraint.create({
      bodyA: mouseBody,
      bodyB: body,
      pointB: {
        x: dx * cos - dy * sin,
        y: dx * sin + dy * cos,
      },
      stiffness: 0.7, damping: 0.3, length: 0,
    });

    Matter.Composite.add(engine.world, constraint);
    panelDragRef.current = { id: panelId, constraint };
    setPhysicsDragging(true);
    wakeRef.current();
  }, []);

  // Global pointer events for panel drag (physics inside drawer + drag-out)
  useEffect(() => {
    if (!physicsDragging && !dragOutPanel) return;

    const move = (e: PointerEvent) => {
      // If in drag-out mode (ghost), track cursor
      if (dragOutPanel && dragOutStartRef.current) {
        const dx = e.clientX - dragOutStartRef.current.startX;
        const dy = e.clientY - dragOutStartRef.current.startY;
        setDragOutPos({
          x: dragOutStartRef.current.panelX + dx,
          y: dragOutStartRef.current.panelY + dy,
        });
        return;
      }

      // Physics drag inside drawer
      if (!panelDragRef.current) return;
      const engine = engineRef.current;
      const mouseBody = mouseBodyRef.current;
      const drawerEl = document.querySelector('.tool-drawer');
      if (!engine || !mouseBody || !drawerEl) return;

      const drawerRect = drawerEl.getBoundingClientRect();
      const localX = e.clientX - drawerRect.left;
      const localY = e.clientY - drawerRect.top;

      Matter.Body.setPosition(mouseBody, { x: localX, y: localY });
      wakeRef.current();

      // If cursor crosses right edge of drawer, transition to drag-out
      if (e.clientX > offset) {
        const panelId = panelDragRef.current.id;
        const body = bodiesRef.current.get(panelId);
        const panel = panelsRef.current.find((p) => p.id === panelId);

        // Remove physics constraint
        Matter.Composite.remove(engine.world, panelDragRef.current.constraint);
        panelDragRef.current = null;
        setPhysicsDragging(false);

        // Remove physics body
        if (body) {
          Matter.Composite.remove(engine.world, body);
          bodiesRef.current.delete(panelId);
        }

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
      }
    };

    const up = (e: PointerEvent) => {
      const engine = engineRef.current;

      // If in drag-out mode, finalize
      if (dragOutPanel) {
        if (e.clientX > offset) {
          const canvasX = e.clientX;
          const canvasY = e.clientY - 44;
          onPanelDraggedOut(dragOutPanel, canvasX, canvasY);
        }
        setDragOutPanel(null);
        dragOutStartRef.current = null;
        return;
      }

      // Release physics constraint
      if (panelDragRef.current && engine) {
        Matter.Composite.remove(engine.world, panelDragRef.current.constraint);
        panelDragRef.current = null;
        setPhysicsDragging(false);
        wakeRef.current();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [physicsDragging, dragOutPanel, offset, onPanelDraggedOut]);

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
                cursor: 'grab',
              }}
              onPointerDown={(e) => handlePanelDragStart(e, panel.id)}
            >
              <DrawerPanelShape panel={panel} />
            </div>
          ))}
        </div>

        {/* Handle */}
        <div
          className="tool-drawer-handle"
          onPointerDown={handlePointerDown}
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
        data-panel-id={panel.id}
        style={{
          width: panel.width,
          height: panel.height,
          backgroundColor: panel.color,
        }}
      >
        <div className="pill-header">
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
  switch (panel.shape) {
    case 'banner':
      return (
        <>
          <div className="banner-header">
            <span className="banner-title">{panel.title}</span>
          </div>
          <div className="banner-body">{panel.children}</div>
        </>
      );
    case 'dumbbell':
      return (
        <>
          <div className="dumbbell-header">
            <span className="dumbbell-title">{panel.title}</span>
          </div>
          <div className="dumbbell-body">{panel.children}</div>
        </>
      );
    case 'canvas':
      return (
        <>
          <div className="canvas-panel-label">CANVAS</div>
          <div className="canvas-panel-body">{panel.children}</div>
        </>
      );
    case 'onion':
      return (
        <>
          <div className="onion-header">
            <span className="onion-title">{panel.title}</span>
          </div>
          <div className="onion-body">{panel.children}</div>
        </>
      );
    case 'pencil':
      return (
        <>
          <div className="pencil-title">{panel.title}</div>
          <div className="pencil-body">{panel.children}</div>
        </>
      );
    case 'snowman':
      return (
        <>
          <div className="snowman-head">
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
          </div>
          <div className="ticket-body">{panel.children}</div>
        </>
      );
    default:
      return (
        <>
          <div className="floating-panel-header">
            <span className="floating-panel-title">{panel.title}</span>
          </div>
          <div className="floating-panel-body">{panel.children}</div>
        </>
      );
  }
}
