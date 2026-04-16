import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Matter from 'matter-js';
import decomp from 'poly-decomp';

// Enable concave polygon decomposition (required for some fromVertices shapes)
Matter.Common.setDecomp(decomp);

export interface PanelDef {
  id: string;
  width: number;
  height: number;
  color: string;
  title: string;
  shape?: 'rect' | 'pen' | 'ticket' | 'snowman' | 'pill' | 'canvas' | 'onion' | 'pencil' | 'banner' | 'dumbbell';
  children: React.ReactNode;
}

export interface PhysicsPanelsHandle {
  addPanelBody(panel: PanelDef, x: number, y: number): void;
}

interface PhysicsPanelsProps {
  panels: PanelDef[];
  containerWidth: number;
  containerHeight: number;
  drawerOpen?: boolean;
  drawerRightEdge?: number;
  onPanelDroppedInDrawer?: (panelId: string, x: number, y: number) => void;
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

  if (panel.shape === 'banner') {
    // Banner: flat rect top + pointed tip at bottom (inverted pencil).
    // The tip section is the bottom ~27% (96/353 ≈ 0.272).
    const tipFraction = 96 / 353;
    const tipStartY = h * (1 - tipFraction); // where the angled sides begin
    const halfW = w / 2;
    const halfH = h / 2;
    const verts = [
      { x: -halfW, y: -halfH },                // top-left
      { x: halfW, y: -halfH },                 // top-right
      { x: halfW, y: -halfH + tipStartY },     // right shoulder
      { x: 0, y: halfH },                      // bottom tip
      { x: -halfW, y: -halfH + tipStartY },    // left shoulder
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

  if (panel.shape === 'dumbbell') {
    // Two-section panel — approximate with rounded rectangle
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 16 } });
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
export const TICKET_SVG_PATH ="M214.412 111.011C218.639 111.225 222 114.72 222 119V167C222 171.418 218.418 175 214 175H8C3.58172 175 0 171.418 0 167V119C0 114.72 3.36114 111.225 7.58789 111.011L8.41211 110.989C12.6389 110.775 16 107.28 16 103C16 98.7199 12.6389 95.2252 8.41211 95.0107L7.58789 94.9893C3.36114 94.7748 1.79435e-07 91.2801 0 87V8C0 3.58172 3.58172 1.04692e-07 8 0H214C218.418 0 222 3.58172 222 8V87C222 91.2801 218.639 94.7748 214.412 94.9893L213.588 95.0107C209.361 95.2252 206 98.7199 206 103C206 107.28 209.361 110.775 213.588 110.989L214.412 111.011Z";

// Snowman/figure-8 shape: small circle on top (r=65.5), large circle on bottom
// (r=110.5), connected with concave curves. User-provided SVG at 221x310.
export const SNOWMAN_SVG_PATH ="M110.5 0C146.675 0 176 29.3253 176 65.5C176 79.4191 171.657 92.323 164.254 102.934C198.106 121.818 221 157.985 221 199.5C221 260.527 171.527 310 110.5 310C49.4725 310 0 260.527 0 199.5C0 157.985 22.8938 121.818 56.7451 102.934C49.3424 92.3231 45 79.4189 45 65.5C45 29.3253 74.3253 0 110.5 0Z";

// Canvas size panel: wide rounded rectangle with 4 semi-circular notches (2 top,
// 2 bottom) dividing it into three sections. User-provided SVG at 341x103.
export const CANVAS_SVG_PATH ="M95 0C99.4183 4.67273e-06 103 3.58173 103 8V19.9707C103 24.389 106.582 27.9707 111 27.9707C115.418 27.9707 119 24.389 119 19.9707V8C119 3.58173 122.582 8.38122e-06 127 0H214C218.418 0 222 3.58172 222 8V19.9707C222 24.389 225.582 27.9707 230 27.9707C234.418 27.9707 238 24.389 238 19.9707V8C238 3.58172 241.582 1.34754e-07 246 0H333C337.418 4.67273e-06 341 3.58173 341 8V95C341 99.4183 337.418 103 333 103H246C241.582 103 238 99.4183 238 95V83.0293C238 78.611 234.418 75.0293 230 75.0293C225.582 75.0293 222 78.611 222 83.0293V95C222 99.4183 218.418 103 214 103H127C122.582 103 119 99.4183 119 95V83.0293C119 78.611 115.418 75.0293 111 75.0293C106.582 75.0293 103 78.611 103 83.0293V95C103 99.4183 99.4183 103 95 103H8C3.58173 103 4.25813e-06 99.4183 0 95V8C5.49512e-07 3.58172 3.58172 1.34754e-07 8 0H95Z";

// Onion skin panel: unified shape — pointed stem at top, rounded-rect bulb body,
// concave connector at bottom. ViewBox 0 0 320 305.
// Stem (81x28) centered, bulb body (320 wide, r=96) from y=28 to y=288,
// bottom connector (127x17) centered from y=288 to y=305.
export const ONION_SVG_PATH_V2 =(() => {
  const W = 320, stemH = 28, bulbH = 260, connH = 17;
  const stemW = 81, connW = 127, br = 96;

  // Stem: centered
  const sx = (W - stemW) / 2; // 99.5
  const stem = `M${sx + 19.991} 11.499L${sx + 16.988} 16.418C${sx + 13.265} 22.518 ${sx + 6.996} 26.559 ${sx} 27.985L${sx + 80.935} 27.985C${sx + 73.939} 26.559 ${sx + 67.670} 22.518 ${sx + 63.946} 16.418L${sx + 60.944} 11.500C${sx + 51.585} -3.833 ${sx + 29.350} -3.833 ${sx + 19.991} 11.499Z`;

  // Bulb body: rounded rect
  const by = stemH, bw = W;
  const bulb = `M${br} ${by}` +
    `H${bw - br}` +
    `C${bw - br + 53.02} ${by} ${bw} ${by + br - 53.02} ${bw} ${by + br}` +
    `V${by + bulbH - br}` +
    `C${bw} ${by + bulbH - br + 53.02} ${bw - br + 53.02} ${by + bulbH} ${bw - br} ${by + bulbH}` +
    `H${br}` +
    `C${br - 53.02} ${by + bulbH} 0 ${by + bulbH - br + 53.02} 0 ${by + bulbH - br}` +
    `V${by + br}` +
    `C0 ${by + br - 53.02} ${br - 53.02} ${by} ${br} ${by}Z`;

  // Bottom connector: centered
  const cx = (W - connW) / 2; // 76.5
  const cy = stemH + bulbH; // 288
  const conn = `M${cx + 14.957} ${cy + connH}` +
    `H${cx + 111.728}` +
    `C${cx + 116.417} ${cy + connH} ${cx + 120.219} ${cy + 13.073} ${cx + 120.219} ${cy + 8.377}` +
    `C${cx + 120.219} ${cy + 4.451} ${cx + 122.909} ${cy + 1.054} ${cx + 126.685} ${cy}` +
    `H${cx}` +
    `C${cx + 3.776} ${cy + 1.054} ${cx + 6.466} ${cy + 4.451} ${cx + 6.466} ${cy + 8.377}` +
    `C${cx + 6.466} ${cy + 13.073} ${cx + 10.268} ${cy + connH} ${cx + 14.957} ${cy + connH}Z`;

  return `${stem} ${bulb} ${conn}`;
})();

// Pencil panel (redesigned tools): rectangle body at top with pointed tip at
// bottom. User-provided SVG at 222x353, tip starts at y=269.904.
export const PENCIL_SVG_PATH ="M222 269.904C222 272.476 220.764 274.891 218.678 276.395L115.678 350.629C112.884 352.642 109.116 352.642 106.322 350.629L3.32227 276.395C1.23613 274.891 -2.24812e-07 272.476 0 269.904V8C2.06169e-06 3.58172 3.58172 1.04692e-07 8 0H214C218.418 0 222 3.58172 222 8V269.904Z";

// Banner panel (Brush tool redesign): rectangular body with rounded top corners
// and a downward-pointing triangular tip at the bottom. Reuses the pencil tip
// geometry (from y=269.904 to y=353) but with a flat rectangular top (y=0 to
// y=269.904). SVG viewBox 0 0 222 353.
export const BANNER_SVG_PATH ="M0 8C0 3.582 3.582 0 8 0H214C218.418 0 222 3.582 222 8V269.904C222 272.476 220.764 274.891 218.678 276.395L115.678 350.629C112.884 352.642 109.116 352.642 106.322 350.629L3.322 276.395C1.236 274.891 0 272.476 0 269.904V8Z";

// Dumbbell panel: single unified SVG path — two rounded rects connected by a
// bridge with circular notches on each side. ViewBox 0 0 222 368.
// Top section: y 0–264 (r=8). Bridge: y 264–280 (16px tall, circular notches r=8).
// Bottom section: y 280–368 (r=8). Panel is 222px wide; the bridge/connector is
// 206px wide centered (inset 8px each side), matching the Figma Union SVG.
// The notch is a semicircle: from the bottom of the top rect's corner, arcing
// inward 8px then back out to the top of the bottom rect's corner.
export const DUMBBELL_SVG_PATH =[
  // Top-left corner
  'M8 0',
  'C3.582 0 0 3.582 0 8',
  // Left side of top rect down to bottom-left corner
  'V256',
  'C0 260.418 3.582 264 8 264',
  // Bottom edge of top rect to right
  'H214',
  'C218.418 264 222 260.418 222 256',
  // Right side of top rect up to top-right corner
  'V8',
  'C222 3.582 218.418 0 214 0',
  // Top edge back to start
  'H8 Z',
  // Bottom rect as separate subpath
  'M8 280',
  'C3.582 280 0 283.582 0 288',
  // Left side of bottom rect
  'V360',
  'C0 364.418 3.582 368 8 368',
  // Bottom edge
  'H214',
  'C218.418 368 222 364.418 222 360',
  // Right side of bottom rect
  'V288',
  'C222 283.582 218.418 280 214 280',
  'H8 Z',
  // Bridge connector (Union shape) — centered at x=8, y=264, 206x16
  // The connector path: starts at right (x=214, y=264), goes left, with
  // semicircular notches biting inward on each side
  'M214 264',
  'C209.582 264 206 267.582 206 272',  // right notch: arc inward
  'C206 276.418 209.582 280 214 280',  // right notch: arc back out
  'H8',                                  // bottom edge to left
  'C12.418 280 16 276.418 16 272',      // left notch: arc inward
  'C16 267.582 12.418 264 8 264',       // left notch: arc back out
  'H214 Z',                              // top edge back to right
].join(' ');

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

function PhysicsPanelsInner(
  { panels, containerWidth, containerHeight, drawerOpen, drawerRightEdge, onPanelDroppedInDrawer }: PhysicsPanelsProps,
  ref: React.Ref<PhysicsPanelsHandle>
) {
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const panelRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragRef = useRef<{ id: string; constraint: Matter.Constraint } | null>(null);
  const mouseBodyRef = useRef<Matter.Body | null>(null);
  const wakeRef = useRef<() => void>(() => {});
  // Keep latest props accessible via refs to avoid stale closures
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const drawerOpenRef = useRef(drawerOpen);
  drawerOpenRef.current = drawerOpen;
  const drawerRightEdgeRef = useRef(drawerRightEdge);
  drawerRightEdgeRef.current = drawerRightEdge;
  const onPanelDroppedInDrawerRef = useRef(onPanelDroppedInDrawer);
  onPanelDroppedInDrawerRef.current = onPanelDroppedInDrawer;

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

    for (const panel of panels) {
      const margin = 60;
      const spawnX = margin + Math.random() * (containerWidth - panel.width - margin * 2);
      const spawnY = margin + Math.random() * (containerHeight - panel.height - margin * 2);
      const body = createPanelBody(panel, spawnX, spawnY);
      Matter.Composite.add(engine.world, body);
      bodiesRef.current.set(panel.id, body);
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
  }, [containerWidth, containerHeight]);

  // Remove bodies for panels that left (e.g. dropped into drawer)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const panelIds = new Set(panels.map((p) => p.id));

    for (const [id, body] of bodiesRef.current) {
      if (!panelIds.has(id)) {
        Matter.Composite.remove(engine.world, body);
        bodiesRef.current.delete(id);
        panelRefs.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels.map((p) => p.id).join(',')]);

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

  // Imperative handle for adding panel bodies from outside (drawer → canvas)
  useImperativeHandle(ref, () => ({
    addPanelBody(panel: PanelDef, x: number, y: number) {
      const engine = engineRef.current;
      if (!engine) return;
      // Remove existing body if any (shouldn't happen, but safety)
      const existing = bodiesRef.current.get(panel.id);
      if (existing) {
        Matter.Composite.remove(engine.world, existing);
      }
      const body = createPanelBody(panel, x, y);
      Matter.Composite.add(engine.world, body);
      bodiesRef.current.set(panel.id, body);
      wakeRef.current();
    },
  }));

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
    setDraggingPanelId(panelId);
    wakeRef.current();
  }, [pinned]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    if (!dragRef.current || !mouseBodyRef.current) return;
    const mx = Math.max(0, Math.min(containerWidth, e.clientX));
    const my = Math.max(0, Math.min(containerHeight, e.clientY - 44));
    Matter.Body.setPosition(mouseBodyRef.current, { x: mx, y: my });
  }, [containerWidth, containerHeight]);

  // Track last mouse position for drop detection
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current || !engineRef.current) return;
    const panelId = dragRef.current.id;
    const body = bodiesRef.current.get(panelId);
    setDraggingPanelId(null);

    // Read latest values from refs (avoids stale closure)
    const isDrawerOpen = drawerOpenRef.current;
    const edge = drawerRightEdgeRef.current;
    const mouseX = lastPointerRef.current.x;

    // Check if the cursor is inside the open drawer
    if (body && isDrawerOpen && edge && edge > 0 && mouseX < edge) {
      Matter.Composite.remove(engineRef.current.world, dragRef.current.constraint);
      Matter.Composite.remove(engineRef.current.world, body);
      bodiesRef.current.delete(panelId);
      panelRefs.current.delete(panelId);
      dragRef.current = null;
      onPanelDroppedInDrawerRef.current?.(panelId, body.position.x, body.position.y);
      wakeRef.current();
      return;
    }

    Matter.Composite.remove(engineRef.current.world, dragRef.current.constraint);
    dragRef.current = null;
    wakeRef.current();
  }, []); // No deps — uses refs for all external values

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
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {panels.map((panel) => {
        const isPinned = pinned.has(panel.id);
        const panelZIndex = draggingPanelId === panel.id ? 30 : 10;
        const isPen = panel.shape === 'pen';
        const isTicket = panel.shape === 'ticket';
        const isDumbbell = panel.shape === 'dumbbell';
        const isSnowman = panel.shape === 'snowman';
        const isPill = panel.shape === 'pill';
        const isCanvas = panel.shape === 'canvas';
        const isOnion = panel.shape === 'onion';
        const isPencil = panel.shape === 'pencil';
        const isBanner = panel.shape === 'banner';
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
                zIndex: panelZIndex,
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
                zIndex: panelZIndex,
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
              <div className="canvas-panel-label">CANVAS</div>
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
                zIndex: panelZIndex,
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 320 305"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={ONION_SVG_PATH_V2} fill={panel.color} />
              </svg>
              <div className="onion-header">
                {dragIcon}
                <span className="onion-title">{panel.title}</span>
              </div>
              <div className="onion-body">{panel.children}</div>
            </div>
          );
        }

        if (isBanner) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel banner-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
                zIndex: panelZIndex,
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 222 353"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={BANNER_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="banner-header">
                <span className="banner-title">{panel.title}</span>
                {dragIcon}
              </div>
              <div className="banner-body">{panel.children}</div>
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
                zIndex: panelZIndex,
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
                zIndex: panelZIndex,
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

        if (isDumbbell) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel dumbbell-panel"
              style={{
                width: w,
                height: h,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
                zIndex: panelZIndex,
              }}
            >
              <svg
                width={w}
                height={h}
                viewBox="0 0 222 368"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={DUMBBELL_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="dumbbell-header">
                <span className="dumbbell-title">{panel.title}</span>
                {dragIcon}
              </div>
              <div className="dumbbell-body">{panel.children}</div>
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
                zIndex: panelZIndex,
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
                zIndex: panelZIndex,
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

export const PhysicsPanels = forwardRef(PhysicsPanelsInner);
