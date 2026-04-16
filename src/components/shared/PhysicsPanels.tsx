import { useRef, useEffect, useState, useCallback } from 'react';
import Matter from 'matter-js';
import decomp from 'poly-decomp';

// Enable concave polygon decomposition (required for some fromVertices shapes)
Matter.Common.setDecomp(decomp);

interface PanelDef {
  id: string;
  width: number;
  height: number;
  color: string;
  title: string;
  shape?: 'rect' | 'pen' | 'ticket' | 'snowman' | 'pill' | 'canvas' | 'onion' | 'pencil';
  children: React.ReactNode;
}

interface PhysicsPanelsProps {
  panels: PanelDef[];
  containerWidth: number;
  containerHeight: number;
}

const PEN_TIP_HEIGHT = 82;

/**
 * Create a Matter body that visually matches the panel's shape.
 * Fall back to a rounded rectangle if fromVertices fails.
 */
function createPanelBody(panel: PanelDef, x: number, y: number): Matter.Body {
  const w = panel.width;
  const h = panel.height;
  const bodyOpts = {
    restitution: 0.25,
    friction: 0.6,
    frictionAir: 0.02,
    density: 0.002,
  };

  if (panel.shape === 'pill') {
    // Stadium — corner radius = min(w,h)/2 so it's fully rounded
    return Matter.Bodies.rectangle(x, y, w, h, {
      ...bodyOpts,
      chamfer: { radius: Math.min(w, h) / 2 - 1 },
    });
  }

  if (panel.shape === 'pen') {
    // Convex pentagon: peak + 2 shoulders + 2 bottom corners
    const tipH = PEN_TIP_HEIGHT;
    const verts = [
      { x: 0, y: -h / 2 },                // top peak
      { x: w / 2, y: -h / 2 + tipH },     // right shoulder
      { x: w / 2, y: h / 2 },             // bottom-right
      { x: -w / 2, y: h / 2 },            // bottom-left
      { x: -w / 2, y: -h / 2 + tipH },    // left shoulder
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    // Fallback: rounded rect
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 16 } });
  }

  if (panel.shape === 'pencil') {
    // Pencil: flat rect top + pointed tip bottom. Tip starts at 76.4% of height.
    const tipStart = h * 0.7645;          // 269.904/353
    const halfW = w / 2;
    const halfH = h / 2;
    const verts = [
      { x: -halfW, y: -halfH },                        // top-left
      { x: halfW, y: -halfH },                         // top-right
      { x: halfW, y: -halfH + tipStart },              // right shoulder
      { x: 0, y: halfH },                              // bottom tip
      { x: -halfW, y: -halfH + tipStart },             // left shoulder
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 8 } });
  }

  if (panel.shape === 'canvas') {
    // Rounded bar (notches are small — approximate with chamfered rect)
    return Matter.Bodies.rectangle(x, y, w, h, {
      ...bodyOpts,
      chamfer: { radius: 8 },
    });
  }

  if (panel.shape === 'onion') {
    // Bulbous shape — approximate with large chamfer so corners round into a bulb
    return Matter.Bodies.rectangle(x, y, w, h, {
      ...bodyOpts,
      chamfer: { radius: Math.min(w, h) / 2.2 },
    });
  }

  if (panel.shape === 'snowman') {
    // Approximate with rounded rectangle (concave snowman can't be a single body)
    return Matter.Bodies.rectangle(x, y, w, h, {
      ...bodyOpts,
      chamfer: { radius: Math.min(w / 2, 80) },
    });
  }

  // Default rect (with small chamfer) — used for ticket and plain panels
  return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 16 } });
}

/**
 * Build the pen-outline path for a panel of width `w` and height `h`.
 * Tip height is fixed at PEN_TIP_HEIGHT (82px); the straight body section
 * between the shoulders and the rounded bottom corners grows with `h`.
 * Modeled on the user-provided SVG at 222x211:
 * M222 202.139 C222 206.557 218.418 210.139 214 210.139 H8 C3.582 210.139 0 206.557 0 202.139
 * V82.235 C0 79.663 1.236 77.248 3.322 75.744 L106.322 1.510
 * C109.116 -0.503 112.884 -0.503 115.678 1.510 L218.678 75.744
 * C220.764 77.248 222 79.663 222 82.235 V202.139 Z
 */
// Ticket/card shape with side notches (from user-provided SVG at 222x175,
// notches centered at y=103).
const TICKET_SVG_PATH = "M214.412 111.011C218.639 111.225 222 114.72 222 119V167C222 171.418 218.418 175 214 175H8C3.58172 175 0 171.418 0 167V119C0 114.72 3.36114 111.225 7.58789 111.011L8.41211 110.989C12.6389 110.775 16 107.28 16 103C16 98.7199 12.6389 95.2252 8.41211 95.0107L7.58789 94.9893C3.36114 94.7748 1.79435e-07 91.2801 0 87V8C0 3.58172 3.58172 1.04692e-07 8 0H214C218.418 0 222 3.58172 222 8V87C222 91.2801 218.639 94.7748 214.412 94.9893L213.588 95.0107C209.361 95.2252 206 98.7199 206 103C206 107.28 209.361 110.775 213.588 110.989L214.412 111.011Z";

// Snowman/figure-8 shape: small circle on top (r=65.5), large circle on bottom
// (r=110.5), connected with concave curves. User-provided SVG at 221x310.
const SNOWMAN_SVG_PATH = "M110.5 0C146.675 0 176 29.3253 176 65.5C176 79.4191 171.657 92.323 164.254 102.934C198.106 121.818 221 157.985 221 199.5C221 260.527 171.527 310 110.5 310C49.4725 310 0 260.527 0 199.5C0 157.985 22.8938 121.818 56.7451 102.934C49.3424 92.3231 45 79.4189 45 65.5C45 29.3253 74.3253 0 110.5 0Z";

// Canvas size panel: wide rounded rectangle with 4 semi-circular notches (2 top,
// 2 bottom) dividing it into three sections. User-provided SVG at 341x103.
const CANVAS_SVG_PATH = "M95 0C99.4183 4.67273e-06 103 3.58173 103 8V19.9707C103 24.389 106.582 27.9707 111 27.9707C115.418 27.9707 119 24.389 119 19.9707V8C119 3.58173 122.582 8.38122e-06 127 0H214C218.418 0 222 3.58172 222 8V19.9707C222 24.389 225.582 27.9707 230 27.9707C234.418 27.9707 238 24.389 238 19.9707V8C238 3.58172 241.582 1.34754e-07 246 0H333C337.418 4.67273e-06 341 3.58173 341 8V95C341 99.4183 337.418 103 333 103H246C241.582 103 238 99.4183 238 95V83.0293C238 78.611 234.418 75.0293 230 75.0293C225.582 75.0293 222 78.611 222 83.0293V95C222 99.4183 218.418 103 214 103H127C122.582 103 119 99.4183 119 95V83.0293C119 78.611 115.418 75.0293 111 75.0293C106.582 75.0293 103 78.611 103 83.0293V95C103 99.4183 99.4183 103 95 103H8C3.58173 103 4.25813e-06 99.4183 0 95V8C5.49512e-07 3.58172 3.58172 1.34754e-07 8 0H95Z";

// Onion skin panel: bulb/onion shape — pointed stem at top, round bulbous body,
// flat base. User-provided SVG at 341x319.
const ONION_SVG_PATH = "M193.978 16.4176C197.702 22.5181 203.971 26.5589 210.967 27.9845C285.597 43.193 341 99.5179 341 166.678C341 229.722 292.181 283.218 224.466 302.119C220.69 303.173 218 306.57 218 310.496C218 315.193 214.199 319 209.509 319H131.491C126.801 319 123 315.193 123 310.496C123 306.57 120.31 303.173 116.534 302.119C48.8188 283.218 0 229.722 0 166.678C0.000113463 99.5181 55.4026 43.1932 130.032 27.9845C137.028 26.5589 143.297 22.5183 147.021 16.4179L150.023 11.4993C159.382 -3.83324 181.617 -3.83308 190.976 11.4996L193.978 16.4996Z";

// Pencil panel (redesigned tools): rectangle body at top with pointed tip at
// bottom. User-provided SVG at 222x353, tip starts at y=269.904.
const PENCIL_SVG_PATH = "M222 269.904C222 272.476 220.764 274.891 218.678 276.395L115.678 350.629C112.884 352.642 109.116 352.642 106.322 350.629L3.32227 276.395C1.23613 274.891 -2.24812e-07 272.476 0 269.904V8C2.06169e-06 3.58172 3.58172 1.04692e-07 8 0H214C218.418 0 222 3.58172 222 8V269.904Z";

function buildPenPath(w: number, h: number): string {
  const bottomStraight = h - 7.861; // 210.139 - 202.139 = 8 for radius
  const cornerCtrlY = h - 3.582; // 210.139 - 206.557 = 3.582
  const shoulderY = 82.2346;
  const shoulderCtrlY = shoulderY - 2.572; // 82.235 - 79.663
  const shoulderRampY = shoulderY - 6.49;  // 82.235 - 75.744
  const peakX = w / 2;
  const cx = w / 2;
  // Scale horizontal path points from original 222 width
  const s = w / 222;
  return (
    `M${w} ${bottomStraight}` +
    `C${w} ${cornerCtrlY} ${w - 3.582 * s} ${h} ${w - 8 * s} ${h}` +
    `H${8 * s}` +
    `C${3.582 * s} ${h} 0 ${cornerCtrlY} 0 ${bottomStraight}` +
    `V${shoulderY}` +
    `C0 ${shoulderCtrlY} ${1.236 * s} ${shoulderY - 4.99} ${3.322 * s} ${shoulderRampY}` +
    `L${(peakX - 4.678 * s)} 1.510` +
    `C${cx - 1.884 * s} -0.503 ${cx + 1.884 * s} -0.503 ${peakX + 4.678 * s} 1.510` +
    `L${w - 3.322 * s} ${shoulderRampY}` +
    `C${w - 1.236 * s} ${shoulderY - 4.99} ${w} ${shoulderCtrlY} ${w} ${shoulderY}` +
    `V${bottomStraight}Z`
  );
}

export function PhysicsPanels({ panels, containerWidth, containerHeight }: PhysicsPanelsProps) {
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const panelRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragRef = useRef<{ id: string; constraint: Matter.Constraint } | null>(null);
  const mouseBodyRef = useRef<Matter.Body | null>(null);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 },
    });
    engineRef.current = engine;

    const wallThickness = 60;
    const floor = Matter.Bodies.rectangle(
      containerWidth / 2, containerHeight + wallThickness / 2, containerWidth * 2, wallThickness,
      { isStatic: true, restitution: 0.3, friction: 0.8 }
    );
    const ceiling = Matter.Bodies.rectangle(
      containerWidth / 2, -wallThickness - 20, containerWidth * 2, wallThickness,
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
    let startY = 150;
    for (const panel of panels) {
      const body = createPanelBody(panel, startX, startY);
      Matter.Composite.add(engine.world, body);
      bodiesRef.current.set(panel.id, body);
      startY += panel.height + 30;
    }

    const mouseBody = Matter.Bodies.circle(0, 0, 1, { isStatic: true, collisionFilter: { mask: 0 } });
    Matter.Composite.add(engine.world, mouseBody);
    mouseBodyRef.current = mouseBody;

    // Initial DOM placement
    for (const [id, body] of bodiesRef.current) {
      const el = panelRefs.current.get(id);
      const panel = panels.find((p) => p.id === id);
      if (el && panel) {
        el.style.left = `${body.position.x - panel.width / 2}px`;
        el.style.top = `${body.position.y - panel.height / 2}px`;
        el.style.transform = `rotate(${body.angle}rad)`;
      }
    }

    let restFrames = 0;
    let lastTime = performance.now();
    const step = () => {
      const now = performance.now();
      const delta = Math.min(now - lastTime, 32);
      lastTime = now;
      Matter.Engine.update(engine, delta);

      // Clamp so panel edges stay within container (center clamp = halfSize)
      for (const [id, body] of bodiesRef.current) {
        const panel = panels.find((p) => p.id === id);
        if (!panel) continue;
        const halfW = panel.width / 2;
        const halfH = panel.height / 2;
        const bx = Math.max(halfW, Math.min(containerWidth - halfW, body.position.x));
        const by = Math.max(halfH, Math.min(containerHeight - halfH, body.position.y));
        if (bx !== body.position.x || by !== body.position.y) {
          Matter.Body.setPosition(body, { x: bx, y: by });
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
      }

      // Direct DOM updates & detect if any body is moving
      let anyMoving = false;
      for (const [id, body] of bodiesRef.current) {
        const speed = Math.abs(body.velocity.x) + Math.abs(body.velocity.y) + Math.abs(body.angularVelocity);
        if (speed > 0.5) anyMoving = true;
        const el = panelRefs.current.get(id);
        const panel = panels.find((p) => p.id === id);
        if (el && panel) {
          el.style.left = `${body.position.x - panel.width / 2}px`;
          el.style.top = `${body.position.y - panel.height / 2}px`;
          el.style.transform = `rotate(${body.angle}rad)`;
        }
      }

      // Auto-pause when everything has been at rest for 60 consecutive ticks (~1s)
      if (!anyMoving && !dragRef.current) {
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
  }, [containerWidth, containerHeight, panels.length]);

  // Resize physics bodies when panel dimensions change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const panel of panels) {
      const body = bodiesRef.current.get(panel.id);
      if (!body) continue;
      const currentW = body.bounds.max.x - body.bounds.min.x;
      const currentH = body.bounds.max.y - body.bounds.min.y;
      if (Math.abs(currentW - panel.width) > 1 || Math.abs(currentH - panel.height) > 1) {
        const pos = { x: body.position.x, y: body.position.y };
        const angle = body.angle;
        const wasStatic = body.isStatic;
        Matter.Composite.remove(engine.world, body);
        const newBody = createPanelBody(panel, pos.x, pos.y);
        Matter.Body.setAngle(newBody, angle);
        if (wasStatic) Matter.Body.setStatic(newBody, true);
        Matter.Composite.add(engine.world, newBody);
        bodiesRef.current.set(panel.id, newBody);
        wakeRef.current();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels.map((p) => `${p.id}:${p.width}x${p.height}`).join('|')]);

  useEffect(() => {
    let needsWake = false;
    for (const [id, body] of bodiesRef.current) {
      const isPinned = pinned.has(id);
      if (isPinned && !body.isStatic) {
        Matter.Body.setStatic(body, true);
        Matter.Body.setAngle(body, 0);
      } else if (!isPinned && body.isStatic) {
        Matter.Body.setStatic(body, false);
        needsWake = true;
      }
    }
    if (needsWake) wakeRef.current();
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
    wakeRef.current();
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
    wakeRef.current();
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
        const isPinned = pinned.has(panel.id);
        const isPen = panel.shape === 'pen';
        const isTicket = panel.shape === 'ticket';
        const isSnowman = panel.shape === 'snowman';
        const isPill = panel.shape === 'pill';
        const isCanvas = panel.shape === 'canvas';
        const isOnion = panel.shape === 'onion';
        const isPencil = panel.shape === 'pencil';
        const dragIcon = (
          <div
            className={`floating-panel-drag-icon ${isPinned ? 'pinned' : ''}`}
            onPointerDown={(e) => handleDragStart(e, panel.id)}
            onContextMenu={(e) => handleTogglePin(e, panel.id)}
            style={{ cursor: isPinned ? 'default' : 'grab' }}
          />
        );

        if (isPill) {
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel pill-panel"
              style={{
                width: panel.width,
                height: panel.height,
                backgroundColor: panel.color,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <div className="pill-header">
                {dragIcon}
                <span className="pill-title">{panel.title}</span>
              </div>
              <div className="pill-body">{panel.children}</div>
            </div>
          );
        }

        if (isCanvas) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel canvas-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 341 103"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={CANVAS_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="canvas-panel-drag">{dragIcon}</div>
              <div className="canvas-panel-body">{panel.children}</div>
            </div>
          );
        }

        if (isOnion) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel onion-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 341 319"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={ONION_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="onion-stem">{dragIcon}</div>
              <div className="onion-title">{panel.title}</div>
              <div className="onion-body">{panel.children}</div>
            </div>
          );
        }

        if (isPencil) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel pencil-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 222 353"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={PENCIL_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="pencil-drag">{dragIcon}</div>
              <div className="pencil-title">{panel.title}</div>
              <div className="pencil-body">{panel.children}</div>
            </div>
          );
        }

        if (isSnowman) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel snowman-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 221 310"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={SNOWMAN_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="snowman-head">
                <div className="snowman-drag">{dragIcon}</div>
                <div className="snowman-title">{panel.title}</div>
              </div>
              <div className="snowman-body">{panel.children}</div>
            </div>
          );
        }

        if (isTicket) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel ticket-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 222 175"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={TICKET_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="floating-panel-header ticket-header">
                <span className="floating-panel-title">{panel.title}</span>
                {dragIcon}
              </div>
              <div className="ticket-body">{panel.children}</div>
            </div>
          );
        }

        if (isPen) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel pen-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <svg
                width={w}
                height={h}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={buildPenPath(w, h)} fill={panel.color} />
              </svg>
              <div className="pen-tip-icon">{dragIcon}</div>
              <div className="pen-title">{panel.title}</div>
              <div className="pen-body">{panel.children}</div>
            </div>
          );
        }

        return (
          <div
            key={panel.id}
            ref={(el) => { panelRefs.current.set(panel.id, el); }}
            className="floating-panel"
            style={{
              width: panel.width,
              backgroundColor: panel.color,
              transformOrigin: 'center center',
              pointerEvents: 'auto',
            }}
          >
            <div className="floating-panel-header">
              <span className="floating-panel-title">{panel.title}</span>
              {dragIcon}
            </div>
            <div className="floating-panel-body">{panel.children}</div>
          </div>
        );
      })}
    </div>
  );
}
