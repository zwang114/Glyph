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
    frictionAir: 0.04,
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
    // Banner: upward-pointing arrow top (house shape) + rect body with rounded bottom.
    // Topper is ~31% of height (84/270), peak at center top.
    const topperH = h * 0.311; // 84/270
    const halfW = w / 2;
    const halfH = h / 2;
    const verts = [
      { x: 0, y: -halfH },                     // peak (top center)
      { x: halfW, y: -halfH + topperH },        // right shoulder
      { x: halfW, y: halfH },                   // bottom-right
      { x: -halfW, y: halfH },                  // bottom-left
      { x: -halfW, y: -halfH + topperH },       // left shoulder
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 8 } });
  }

  if (panel.shape === 'canvas') {
    // Wide bar with notch cutouts — use rectangle matching the visual bounds
    return Matter.Bodies.rectangle(x, y, w, h, {
      ...bodyOpts,
      chamfer: { radius: Math.min(h / 2 - 2, 12) },
    });
  }

  if (panel.shape === 'onion') {
    // Onion bulb: wide elliptical body + narrow stem at top + connector at bottom
    // Approximate with an ellipse-like polygon
    const halfW = w / 2;
    const halfH = h / 2;
    const stemH = 28;   // stem height at top
    const stemW = 40;   // stem width
    const connH = 17;   // connector at bottom
    const bulbTop = -halfH + stemH;
    const bulbBottom = halfH - connH;
    const bulbH = bulbBottom - bulbTop;
    const bulbCY = (bulbTop + bulbBottom) / 2;
    const bulbRX = halfW;
    const bulbRY = bulbH / 2;
    // Generate ellipse vertices for the bulb
    const steps = 16;
    const verts: { x: number; y: number }[] = [];
    // Stem top
    verts.push({ x: -stemW / 2, y: -halfH });
    verts.push({ x: stemW / 2, y: -halfH });
    // Right side of bulb (top to bottom)
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / steps;
      verts.push({
        x: Math.cos(angle) * bulbRX,
        y: bulbCY + Math.sin(angle) * bulbRY,
      });
    }
    // Left side of bulb (bottom to top)
    for (let i = 0; i <= steps; i++) {
      const angle = Math.PI / 2 + (Math.PI * i) / steps;
      verts.push({
        x: Math.cos(angle) * bulbRX,
        y: bulbCY + Math.sin(angle) * bulbRY,
      });
    }
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: Math.min(w, h) / 2.2 } });
  }

  if (panel.shape === 'snowman') {
    // Approximate with rounded rectangle (concave snowman can't be a single body)
    return Matter.Bodies.rectangle(x, y, w, h, {
      ...bodyOpts,
      chamfer: { radius: Math.min(w / 2, 80) },
    });
  }

  if (panel.shape === 'dumbbell') {
    // Dumbbell: two rounded rects connected by a narrow bridge
    const halfW = w / 2;
    const halfH = h / 2;
    // Top section ~57%, bottom ~35%, bridge ~8%
    const topH = h * 0.57;
    const bridgeH = h * 0.08;
    const bottomH = h * 0.35;
    const bridgeW = w * 0.4; // narrow middle
    const verts = [
      // Top section
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: -halfH + topH },
      // Bridge right
      { x: bridgeW / 2, y: -halfH + topH },
      { x: bridgeW / 2, y: -halfH + topH + bridgeH },
      // Bottom section
      { x: halfW, y: -halfH + topH + bridgeH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
      { x: -halfW, y: -halfH + topH + bridgeH },
      // Bridge left
      { x: -bridgeW / 2, y: -halfH + topH + bridgeH },
      { x: -bridgeW / 2, y: -halfH + topH },
      { x: -halfW, y: -halfH + topH },
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
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

// Canvas size panel: wide rounded rectangle with 2 semi-circular notches (1 top,
// 1 bottom) dividing it into two sections (W and H). ViewBox 0 0 228 106.
// Section 1 (W): x=0-106. Connector: x=106-122 (16 wide). Section 2 (H): x=122-228.
// Notches: top at y=21.47-29.47 (r=8 circle centered at x=114, y=21.47 outside
// shape, arcing inward). Bottom notch mirrored at y=76.53-84.53.
export const CANVAS_SVG_PATH = "M98 0C102.418 4.67273e-06 106 3.58173 106 8V21.4707C106 25.889 109.582 29.4707 114 29.4707C118.418 29.4707 122 25.889 122 21.4707V8C122 3.58173 125.582 8.38122e-06 130 0H220C224.418 0 228 3.58172 228 8V98C228 102.418 224.418 106 220 106H130C125.582 106 122 102.418 122 98V84.5293C122 80.111 118.418 76.5293 114 76.5293C109.582 76.5293 106 80.111 106 84.5293V98C106 102.418 102.418 106 98 106H8C3.58173 106 4.25813e-06 102.418 0 98V8C5.49512e-07 3.58172 3.58172 1.34754e-07 8 0H98Z";

// Onion skin panel: unified shape — pointed stem at top, rounded-rect bulb body,
// concave connector at bottom. ViewBox 0 0 320 225.
// Stem (81x28) centered, bulb body (320x180, r=90) from y=28 to y=208,
// bottom connector (127x17) centered from y=208 to y=225.
export const ONION_SVG_PATH_V2 =(() => {
  const W = 320, stemH = 28, bulbH = 180, connH = 17;
  const stemW = 81, connW = 127, br = 90;

  // Stem: centered
  const sx = (W - stemW) / 2; // 99.5
  const stem = `M${sx + 19.991} 11.499L${sx + 16.988} 16.418C${sx + 13.265} 22.518 ${sx + 6.996} 26.559 ${sx} 27.985L${sx + 80.935} 27.985C${sx + 73.939} 26.559 ${sx + 67.670} 22.518 ${sx + 63.946} 16.418L${sx + 60.944} 11.500C${sx + 51.585} -3.833 ${sx + 29.350} -3.833 ${sx + 19.991} 11.499Z`;

  // Bulb body: rounded rect
  const by = stemH, bw = W;
  const k = br * 0.5523; // bezier control offset for circular corner
  const bulb = `M${br} ${by}` +
    `H${bw - br}` +
    `C${bw - br + k} ${by} ${bw} ${by + br - k} ${bw} ${by + br}` +
    `V${by + bulbH - br}` +
    `C${bw} ${by + bulbH - br + k} ${bw - br + k} ${by + bulbH} ${bw - br} ${by + bulbH}` +
    `H${br}` +
    `C${br - k} ${by + bulbH} 0 ${by + bulbH - br + k} 0 ${by + bulbH - br}` +
    `V${by + br}` +
    `C0 ${by + br - k} ${br - k} ${by} ${br} ${by}Z`;

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

// Banner panel (Brush tool redesign): upward-pointing arrow top + rectangular
// body with rounded bottom corners. Topper: 222x85, Body: 222x142, Total: 222x227.
export const BANNER_SVG_PATH = [
  // Topper triangle (pointing up) — starts at the peak
  'M106.322 1.510C109.116 -0.503 112.884 -0.503 115.678 1.510',
  'L218.678 76.744C220.764 78.248 222 80.663 222 83.234V84.139',
  // Right side down to body, rounded bottom-right corner
  'V219C222 223.418 218.418 227 214 227',
  // Bottom edge
  'H8C3.582 227 0 223.418 0 219',
  // Left side up to topper
  'V84.139V83.234C0 80.663 1.236 78.248 3.322 76.744',
  'L106.322 1.510Z',
].join('');

// Dumbbell panel: single unified SVG path — two rounded rects connected by a
// bridge with circular notches on each side. ViewBox 0 0 222 302.
// Top section: y 0–224 (r=8). Bridge: y 224–240 (16px tall, circular notches r=8).
// Bottom section: y 240–302 (r=8). Panel is 222px wide; the bridge/connector is
// 206px wide centered (inset 8px each side), matching the Figma Union SVG.
// The notch is a semicircle: from the bottom of the top rect's corner, arcing
// inward 8px then back out to the top of the bottom rect's corner.
export const DUMBBELL_SVG_PATH =[
  // Top-left corner
  'M8 0',
  'C3.582 0 0 3.582 0 8',
  // Left side of top rect down to bottom-left corner
  'V216',
  'C0 220.418 3.582 224 8 224',
  // Bottom edge of top rect to right
  'H214',
  'C218.418 224 222 220.418 222 216',
  // Right side of top rect up to top-right corner
  'V8',
  'C222 3.582 218.418 0 214 0',
  // Top edge back to start
  'H8 Z',
  // Bottom rect as separate subpath
  'M8 240',
  'C3.582 240 0 243.582 0 248',
  // Left side of bottom rect
  'V294',
  'C0 298.418 3.582 302 8 302',
  // Bottom edge
  'H214',
  'C218.418 302 222 298.418 222 294',
  // Right side of bottom rect
  'V248',
  'C222 243.582 218.418 240 214 240',
  'H8 Z',
  // Bridge connector (Union shape) — centered at x=8, y=224, 206x16
  // The connector path: starts at right (x=214, y=224), goes left, with
  // semicircular notches biting inward on each side
  'M214 224',
  'C209.582 224 206 227.582 206 232',  // right notch: arc inward
  'C206 236.418 209.582 240 214 240',  // right notch: arc back out
  'H8',                                  // bottom edge to left
  'C12.418 240 16 236.418 16 232',      // left notch: arc inward
  'C16 227.582 12.418 224 8 224',       // left notch: arc back out
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
  const wallsRef = useRef<{ floor: Matter.Body; ceiling: Matter.Body; left: Matter.Body; right: Matter.Body; drawer: Matter.Body } | null>(null);
  // Keep latest props accessible via refs to avoid stale closures
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const containerWidthRef = useRef(containerWidth);
  containerWidthRef.current = containerWidth;
  const containerHeightRef = useRef(containerHeight);
  containerHeightRef.current = containerHeight;
  const drawerOpenRef = useRef(drawerOpen);
  drawerOpenRef.current = drawerOpen;
  const drawerRightEdgeRef = useRef(drawerRightEdge);
  drawerRightEdgeRef.current = drawerRightEdge;
  const onPanelDroppedInDrawerRef = useRef(onPanelDroppedInDrawer);
  onPanelDroppedInDrawerRef.current = onPanelDroppedInDrawer;

  // Initialize physics engine once
  useEffect(() => {
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 },
    });
    engineRef.current = engine;

    const cw = containerWidthRef.current;
    const ch = containerHeightRef.current;
    const wallThickness = 60;
    const floor = Matter.Bodies.rectangle(
      cw / 2, ch + wallThickness / 2, cw * 2, wallThickness,
      { isStatic: true, restitution: 0.3, friction: 0.8 }
    );
    const ceiling = Matter.Bodies.rectangle(
      cw / 2, -wallThickness - 20, cw * 2, wallThickness,
      { isStatic: true, restitution: 0.3 }
    );
    const leftWall = Matter.Bodies.rectangle(
      -wallThickness / 2, ch / 2, wallThickness, ch * 2,
      { isStatic: true, restitution: 0.3 }
    );
    const rightWall = Matter.Bodies.rectangle(
      cw + wallThickness / 2, ch / 2, wallThickness, ch * 2,
      { isStatic: true, restitution: 0.3 }
    );
    // Drawer wall: dynamically repositioned when the drawer opens/closes. Parks
    // far off-screen when the drawer is closed so it doesn't affect anything.
    const drawerWall = Matter.Bodies.rectangle(
      -5000, ch / 2, wallThickness, ch * 2,
      { isStatic: true, restitution: 0.3 }
    );
    Matter.Composite.add(engine.world, [floor, ceiling, leftWall, rightWall, drawerWall]);
    wallsRef.current = { floor, ceiling, left: leftWall, right: rightWall, drawer: drawerWall };

    for (const panel of panelsRef.current) {
      const margin = 60;
      const spawnX = margin + Math.random() * (cw - panel.width - margin * 2);
      const spawnY = margin + Math.random() * (ch - panel.height - margin * 2);
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
      const panel = panelsRef.current.find((p) => p.id === id);
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

      const curW = containerWidthRef.current;
      const curH = containerHeightRef.current;
      const draggingId = dragRef.current?.id ?? null;
      const MAX_TILT = 0.35; // ~20° soft rotation cap

      // Soft clamp + angular damping + rotation cap
      for (const [id, body] of bodiesRef.current) {
        const panel = panelsRef.current.find((p) => p.id === id);
        if (!panel || body.isStatic) continue;

        // Angular damping — Matter's default is too weak; kill runaway spin.
        Matter.Body.setAngularVelocity(body, body.angularVelocity * 0.92);

        // Rotation soft cap: bounce back if a collision throws a panel past the
        // cap. Skip while the user is dragging so interactions stay responsive.
        if (id !== draggingId) {
          if (body.angle > MAX_TILT) {
            Matter.Body.setAngle(body, MAX_TILT);
            Matter.Body.setAngularVelocity(body, -body.angularVelocity * 0.3);
          } else if (body.angle < -MAX_TILT) {
            Matter.Body.setAngle(body, -MAX_TILT);
            Matter.Body.setAngularVelocity(body, -body.angularVelocity * 0.3);
          }
        }

        // Position soft clamp — damp velocity instead of zeroing so collisions
        // don't feel like a teleport.
        const halfW = panel.width / 2;
        const halfH = panel.height / 2;
        const bx = Math.max(halfW, Math.min(curW - halfW, body.position.x));
        const by = Math.max(halfH, Math.min(curH - halfH, body.position.y));
        if (bx !== body.position.x || by !== body.position.y) {
          Matter.Body.setPosition(body, { x: bx, y: by });
          Matter.Body.setVelocity(body, {
            x: body.velocity.x * 0.5,
            y: body.velocity.y * 0.5,
          });
        }
      }

      // Direct DOM updates & detect if any body is moving
      let anyMoving = false;
      for (const [id, body] of bodiesRef.current) {
        const speed = Math.abs(body.velocity.x) + Math.abs(body.velocity.y) + Math.abs(body.angularVelocity);
        if (speed > 0.5) anyMoving = true;
        const el = panelRefs.current.get(id);
        const panel = panelsRef.current.find((p) => p.id === id);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposition walls when container size changes (without recreating the engine)
  useEffect(() => {
    const walls = wallsRef.current;
    if (!walls) return;
    const wallThickness = 60;
    Matter.Body.setPosition(walls.floor, { x: containerWidth / 2, y: containerHeight + wallThickness / 2 });
    Matter.Body.setPosition(walls.ceiling, { x: containerWidth / 2, y: -wallThickness - 20 });
    Matter.Body.setPosition(walls.left, { x: -wallThickness / 2, y: containerHeight / 2 });
    Matter.Body.setPosition(walls.right, { x: containerWidth + wallThickness / 2, y: containerHeight / 2 });
    // Drawer wall keeps its x (managed by drawer effect below) but tracks height.
    Matter.Body.setPosition(walls.drawer, { x: walls.drawer.position.x, y: containerHeight / 2 });
    wakeRef.current();
  }, [containerWidth, containerHeight]);

  // Move the drawer wall in/out based on drawer state. When open, canvas panels
  // cannot drift past drawerRightEdge. When closed, the wall parks off-screen.
  // While a panel is being dragged, the wall also parks off-screen so the
  // user can carry panels into the drawer region — the drop handler decides
  // whether to hand off to the drawer on pointerup.
  useEffect(() => {
    const walls = wallsRef.current;
    if (!walls) return;
    const wallThickness = 60;
    const edge = drawerRightEdge ?? 0;
    const active = drawerOpen && edge > 0 && draggingPanelId === null;
    const targetX = active ? edge + wallThickness / 2 : -5000;
    Matter.Body.setPosition(walls.drawer, { x: targetX, y: containerHeightRef.current / 2 });
    wakeRef.current();
  }, [drawerOpen, drawerRightEdge, draggingPanelId]);

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
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
      } else if (!isPinned && body.isStatic) {
        Matter.Body.setStatic(body, false);
        // Clear any residual motion so the panel doesn't re-inherit stale tilt.
        Matter.Body.setAngle(body, 0);
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
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
    // Don't start drag if clicking on interactive elements (buttons, inputs, dials, sliders)
    const target = e.target as HTMLElement;
    if (target.closest('button, input, .radial-dial, .radial-btn, .density-slider, .onion-toggle-btn, .canvas-input')) return;

    e.stopPropagation();
    if (pinned.has(panelId)) return;

    const engine = engineRef.current;
    const body = bodiesRef.current.get(panelId);
    const mouseBody = mouseBodyRef.current;
    if (!engine || !body || !mouseBody) return;

    Matter.Body.setPosition(mouseBody, { x: e.clientX, y: e.clientY - 44 });

    // Convert the grab offset into body-local coords so a rotated panel doesn't
    // jerk when the drag starts. Matter.js expects pointB in the body's frame.
    const dx = e.clientX - body.position.x;
    const dy = (e.clientY - 44) - body.position.y;
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
    dragRef.current = { id: panelId, constraint };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingPanelId(panelId);
    wakeRef.current();
  }, [pinned]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    if (!dragRef.current || !mouseBodyRef.current) return;
    // Allow the cursor to enter the drawer region so panels can be dropped in.
    // The drop handler decides whether to hand off to the drawer on pointerup.
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

    // Drop into drawer only when the body's center has clearly crossed into
    // the drawer region AND the cursor confirms intent. Using the body position
    // (not just cursor) prevents a flick that leaves the body on the canvas
    // from incorrectly handing off to the drawer.
    const panel = panelsRef.current.find((p) => p.id === panelId);
    const halfW = panel ? panel.width / 2 : 0;
    const bodyInDrawer = body && edge ? body.position.x < edge - halfW / 1.5 : false;
    const cursorInDrawer = edge ? mouseX < edge : false;
    if (body && isDrawerOpen && edge && edge > 0 && bodyInDrawer && cursorInDrawer) {
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
      onPointerCancel={handlePointerUp}
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
        const panelDragProps = {
          onPointerDown: (e: React.PointerEvent) => handleDragStart(e, panel.id),
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerUp,
          onContextMenu: (e: React.MouseEvent) => handleTogglePin(e, panel.id),
          style: { cursor: isPinned ? 'default' : 'grab' } as React.CSSProperties,
        };

        if (isPill) {
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel pill-panel"
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
                width: panel.width,
                height: panel.height,
                backgroundColor: panel.color,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
                zIndex: panelZIndex,
              }}
            >
              <div className="pill-header">
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
                viewBox="0 0 228 106"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={CANVAS_SVG_PATH} fill={panel.color} />
              </svg>
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
                viewBox="0 0 320 225"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={ONION_SVG_PATH_V2} fill={panel.color} />
              </svg>
              <div className="onion-header">
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
                viewBox="0 0 222 227"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={BANNER_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="banner-header">
                <span className="banner-title">{panel.title}</span>
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
                viewBox="0 0 222 302"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={DUMBBELL_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="dumbbell-header">
                <span className="dumbbell-title">{panel.title}</span>
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
              {...panelDragProps}
              style={{
                ...panelDragProps.style,
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
            {...panelDragProps}
            style={{
              ...panelDragProps.style,
              width: panel.width,
              backgroundColor: panel.color,
              transformOrigin: 'center center',
              pointerEvents: 'auto',
            }}
          >
            <div className="floating-panel-header">
              <span className="floating-panel-title">{panel.title}</span>
            </div>
            <div className="floating-panel-body">{panel.children}</div>
          </div>
        );
      })}
    </div>
  );
}

export const PhysicsPanels = forwardRef(PhysicsPanelsInner);
