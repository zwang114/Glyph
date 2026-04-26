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
  shape?: 'rect' | 'pen' | 'ticket' | 'snowman' | 'pill' | 'canvas' | 'onion' | 'pencil' | 'banner' | 'dumbbell' | 'triangle' | 'mushroom' | 'pencil-tool' | 'square-tone';
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
  /**
   * Fires whenever a child panel forms or breaks a snap with its partner.
   * `childId` is the connector panel (e.g. 'forest' mushroom); `partnerId`
   * is the panel it snapped onto (e.g. 'shape') or `null` on detach.
   * Use this to drive side effects tied to the connection — e.g. switching
   * the audio profile when the forest mushroom plugs into the pixel tool.
   */
  onSnapChange?: (childId: string, partnerId: string | null) => void;
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

  if (panel.shape === 'triangle') {
    // Triangle: peak at top-center, base along the bottom.
    const halfW = w / 2;
    const halfH = h / 2;
    const verts = [
      { x: 0, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 16 } });
  }

  if (panel.shape === 'square-tone') {
    // Square sound-profile connector — 74×80. Rounded square body (0..74,
    // 0..74, 8px corner radius) with a single 28×6 peg at the bottom edge
    // (x=22.998..50.998, y=74..80). Same snap geometry as the mushroom:
    // shoulders at child-local y=74 sit on the partner panel's top edge,
    // peg descends 6px into the partner's notch.
    const sx = w / 74;
    const sy = h / 80;
    const halfW = w / 2;
    const halfH = h / 2;
    const u = (px: number, py: number) => ({ x: px * sx - halfW, y: py * sy - halfH });
    const verts = [
      // Body — clockwise from top-left rolling over the top to the right.
      // The 8px corner radius is approximated with two corner verts each.
      u(0,     8),
      u(8,     0),
      u(66,    0),
      u(74,    8),
      u(74,    66),
      u(66,    74),
      // Drop down past the peg's right shoulder
      u(51,    74),
      u(51,    79),
      u(50,    80),
      u(24,    80),
      u(23,    79),
      u(23,    74),
      // Back along the bottom-left of the body
      u(8,     74),
      u(0,     66),
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 8 } });
  }

  if (panel.shape === 'mushroom') {
    // Mushroom — small 74×80 connector. Wide rounded cap (0..37) tapering
    // into a narrow stem (37..74), with two small downward pegs (75..79)
    // at x≈21..23 and x≈51..52. We scale to (w, h) since panels can be
    // resized, but the source geometry assumes the 74×80 SVG aspect.
    const sx = w / 74;
    const sy = h / 80;
    const halfW = w / 2;
    const halfH = h / 2;
    const u = (px: number, py: number) => ({ x: px * sx - halfW, y: py * sy - halfH });
    const verts = [
      // Cap — clockwise from left shoulder rolling over the top
      u(0,    34),
      u(4,    20),
      u(15,   6),
      u(37,   0),
      u(59,   6),
      u(70,   20),
      u(74,   34),
      // Cap underside cinches into the stem
      u(74,   37),
      u(51,   37),
      u(48,   42),
      u(60,   65),
      // Stem flare to bottom-right peg
      u(58,   72),
      u(53,   74),
      u(52,   74),
      u(52,   79),
      u(50,   80),
      u(24,   80),
      u(22,   79),
      u(22,   74),
      u(21,   74),
      u(20,   74),
      u(15,   72),
      u(13,   65),
      u(25,   42),
      u(22,   37),
      u(0,    37),
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 8 } });
  }

  if (panel.shape === 'pencil-tool') {
    // Pencil tool: 513×70 horizontal silhouette — flat-left rounded body,
    // long tapered point on the right. Tip apex is at x=513, y=35 in SVG
    // coords; body→tip transition is around x=109. The two decorative
    // notches at the body→tip seam are visual-only and ignored by physics.
    const halfW = w / 2;
    const halfH = h / 2;
    // Convert SVG x (0..513) to body-local x (-halfW..+halfW), same for y.
    const sx = (px: number) => -halfW + (px / 513) * w;
    const sy = (py: number) => -halfH + (py / 70) * h;
    const verts = [
      // Rounded-left body (corners are approximated as straight verts;
      // Matter chamfer fills in the visual roundness but here we just
      // need a convex-ish silhouette for collision).
      { x: sx(0), y: sy(8) },
      { x: sx(8), y: sy(0) },
      { x: sx(93), y: sy(0) },
      // Skip the decorative notches — collide as a straight body→tip edge.
      { x: sx(117), y: sy(0) },
      // Tip taper: top edge into apex
      { x: sx(427), y: sy(0) },
      { x: sx(513), y: sy(35) },
      // Tip taper: apex back down to bottom edge
      { x: sx(427), y: sy(70) },
      { x: sx(117), y: sy(70) },
      { x: sx(93), y: sy(70) },
      { x: sx(8), y: sy(70) },
      { x: sx(0), y: sy(62) },
    ];
    const body = Matter.Bodies.fromVertices(x, y, [verts], bodyOpts);
    if (body) return body;
    return Matter.Bodies.rectangle(x, y, w, h, { ...bodyOpts, chamfer: { radius: 8 } });
  }

  if (panel.shape === 'dumbbell') {
    // Dumbbell: two rounded rects connected by a narrow bridge.
    // Reference SVG: 222×308 — top rect 0..222 (~72%), bridge 222..246 (~8%),
    // bottom rect 246..308 (~20%). Bridge waist pinches inward (~75% of full
    // width). The connector notch in the top edge is too small to model in
    // the physics body — collisions there will be approximate.
    const halfW = w / 2;
    const halfH = h / 2;
    const topH = h * (222 / 308);
    const bridgeH = h * (24 / 308);
    const bridgeW = w * 0.75;
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

// Triangle panel (Character tool): equilateral-ish triangle, peak at top-center,
// base along the bottom. ViewBox 0 0 222 200. Corners rounded ~12px.
export const TRIANGLE_SVG_PATH = (() => {
  const W = 222, H = 200;
  const r = 12;
  // Corner centers
  const top = { x: W / 2, y: r };
  const br = { x: W - r, y: H - r };
  const bl = { x: r, y: H - r };
  // Each side is a straight line between corner-tangent points; corners are arc-rounded.
  // Use arc commands with large-arc=0, sweep=1 (clockwise) for outside corners.
  return [
    `M${top.x - r} ${top.y + r * 0.4}`,
    `L${bl.x - r * 0.4} ${bl.y - r}`,
    `A${r} ${r} 0 0 0 ${bl.x} ${bl.y + r}`,
    `L${br.x} ${br.y + r}`,
    `A${r} ${r} 0 0 0 ${br.x + r * 0.4} ${br.y - r}`,
    `L${top.x + r} ${top.y + r * 0.4}`,
    `A${r} ${r} 0 0 0 ${top.x - r} ${top.y + r * 0.4}`,
    'Z',
  ].join(' ');
})();

// Canvas size panel: wide rounded rectangle with 2 semi-circular notches (1 top,
// 3 notches) dividing it into three sections (W, H, Density). ViewBox 0 0 456 106.
// Section 1 (W): x=0-106. Connector: x=106-122 (16). Section 2 (H): x=122-228.
// Connector: x=228-244 (16). Section 3 (Density): x=244-456.
// Notches: at each connector, top y=21.47-29.47 (r=8 circle), bottom mirrored.
export const CANVAS_SVG_PATH = "M98 0C102.418 4.67273e-06 106 3.58173 106 8V21.4707C106 25.889 109.582 29.4707 114 29.4707C118.418 29.4707 122 25.889 122 21.4707V8C122 3.58173 125.582 8.38122e-06 130 0H220C224.418 0 228 3.58172 228 8V98C228 102.418 224.418 106 220 106H130C125.582 106 122 102.418 122 98V84.5293C122 80.111 118.418 76.5293 114 76.5293C109.582 76.5293 106 80.111 106 84.5293V98C106 102.418 102.418 106 98 106H8C3.58173 106 4.25813e-06 102.418 0 98V8C5.49512e-07 3.58172 3.58172 1.34754e-07 8 0H98Z";

// Onion skin panel: unified shape — pointed stem at top, rounded-rect bulb body,
// concave connector at bottom. ViewBox 0 0 320 225.
// Stem (81x28) centered, bulb body (320x180, r=90) from y=28 to y=208,
// bottom connector (127x17) centered from y=208 to y=225.
export const ONION_SVG_PATH_V2 =(() => {
  const W = 320, stemH = 28, bulbH = 180, connH = 17;
  const stemW = 81, connW = 127, br = 64;
  // Bulb inset — 16px on each side, so bulb spans x=16 to x=304 (width 288)
  const bulbX = 16;
  const bulbW = W - bulbX * 2; // 288

  // Stem: centered
  const sx = (W - stemW) / 2; // 119.5
  const stem = `M${sx + 19.991} 11.499L${sx + 16.988} 16.418C${sx + 13.265} 22.518 ${sx + 6.996} 26.559 ${sx} 27.985L${sx + 80.935} 27.985C${sx + 73.939} 26.559 ${sx + 67.670} 22.518 ${sx + 63.946} 16.418L${sx + 60.944} 11.500C${sx + 51.585} -3.833 ${sx + 29.350} -3.833 ${sx + 19.991} 11.499Z`;

  // Bulb body: rounded rect at x=bulbX, width=bulbW, radius=br (64)
  const by = stemH;
  const bxL = bulbX;
  const bxR = bulbX + bulbW;
  const k = br * 0.5523; // bezier control offset for circular corner
  const bulb = `M${bxL + br} ${by}` +
    `H${bxR - br}` +
    `C${bxR - br + k} ${by} ${bxR} ${by + br - k} ${bxR} ${by + br}` +
    `V${by + bulbH - br}` +
    `C${bxR} ${by + bulbH - br + k} ${bxR - br + k} ${by + bulbH} ${bxR - br} ${by + bulbH}` +
    `H${bxL + br}` +
    `C${bxL + br - k} ${by + bulbH} ${bxL} ${by + bulbH - br + k} ${bxL} ${by + bulbH - br}` +
    `V${by + br}` +
    `C${bxL} ${by + br - k} ${bxL + br - k} ${by} ${bxL + br} ${by}Z`;

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

// Mushroom panel (Forest Tone): one closed path tracing a wide rounded cap
// Mushroom — small 74×80 connector shape. Wide rounded cap (y=0..37), narrow
// stem (y=37..74) with two small downward pegs at y=74..79 (x=21..23 and
// x=51..52) intended to slot into the connector notch on the shape panel.
// Drawn from the user-supplied SVG (fill-rule: nonzero).
export const MUSHROOM_SVG_PATH = "M37.2192 0.000976562H37.2212C56.7051 0.114759 72.6286 15.2572 73.9937 34.4268C74.0985 35.8998 72.8918 37.1015 71.4155 37.1016H51.3862C49.6097 37.1016 48.3278 38.8032 48.8169 40.5117L59.9624 65.4746C61.185 69.7459 57.979 74 53.5376 74H51.9976C51.4453 74 50.9976 74.4477 50.9976 75V79C50.9976 79.5523 50.5499 80 49.9976 80H23.9976C23.4453 80 22.9976 79.5523 22.9976 79V75C22.9976 74.4477 22.5499 74 21.9976 74H20.9028C16.4615 73.9999 13.2564 69.7459 14.479 65.4746L25.6245 40.5117C26.1136 38.8032 24.8308 37.1016 23.0542 37.1016H2.58448C1.10824 37.1015 -0.0985257 35.8998 0.00635843 34.4268C1.37659 15.1847 17.4162 3.06858e-05 37.0005 0C37.0734 3.69803e-06 37.1464 0.000552551 37.2192 0.000976562Z";

// Square sound-profile connector — 74×80. Rounded square body (74×74, r=8)
// with a single 28×6 peg at the bottom edge (x=22.998..50.998, y=74..80).
// Same snap target geometry as the mushroom (shoulders at child-local y=74).
// Path supplied verbatim by the user.
export const SQUARE_TONE_SVG_PATH = "M66 0C70.4183 0 74 3.58172 74 8V66C74 70.4183 70.4183 74 66 74H51.998C51.4458 74 50.998 74.4477 50.998 75V79C50.998 79.5521 50.5501 79.9997 49.998 80H23.998C23.4458 80 22.998 79.5523 22.998 79V75C22.998 74.4479 22.5501 74.0003 21.998 74H8C3.58172 74 1.04695e-07 70.4183 0 66V8C0 3.58172 3.58172 1.04692e-07 8 0H66Z";

// Pencil tool panel (redesigned): 513×70 horizontal pencil silhouette —
// flat-left rounded body (x=0..93, 8px radius) with two decorative-only
// circular notches centered at (101, 8) and (101, 62) at the body→tip seam,
// then a long tapered point ending at (513, 35). Path supplied verbatim by
// the user. Notches are PURELY decorative — no snap behavior.
export const PENCIL_TOOL_SVG_PATH = "M85 0C89.4183 0 93 3.58172 93 8V7.97656C93 12.3948 96.5817 15.9766 101 15.9766C105.418 15.9766 109 12.3948 109 7.97656C109 3.57123 112.571 0 116.977 0H427.175C430.727 2.98099e-05 434.18 0.589451 436.988 1.67578L506.79 28.6758C515.07 31.8785 515.07 38.1215 506.79 41.3242L436.988 68.3242C434.18 69.4106 430.727 70 427.175 70H116.977C112.571 70 109 66.4288 109 62.0234C109 57.6052 105.418 54.0234 101 54.0234C96.5817 54.0234 93 57.6052 93 62.0234V62C93 66.4183 89.4183 70 85 70H8C3.58172 70 0 66.4183 0 62V8C0 3.58172 3.58172 0 8 0H85Z";

// Dumbbell panel: single unified SVG path — two rounded rects connected by a
// bridge with circular notches on each side. ViewBox 0 0 222 302.
// Top section: y 0–224 (r=8). Bridge: y 224–240 (16px tall, circular notches r=8).
// Bottom section: y 240–302 (r=8). Panel is 222px wide; the bridge/connector is
// 206px wide centered (inset 8px each side), matching the Figma Union SVG.
// The notch is a semicircle: from the bottom of the top rect's corner, arcing
// inward 8px then back out to the top of the bottom rect's corner.
// Dumbbell — single closed path (222×308) provided directly by the user.
// Top rect (y=0..222) has a small connector notch in the top edge: x=97..125
// dips inward from y=0 down to y=6 (a rectangular bite out of the top edge).
// Waist pinches inward at y=222..246 (side notches), bottom rect y=246..308
// holds the density slider. The notch is reserved for a future feature.
export const DUMBBELL_SVG_PATH =
  'M214.412 246.011C218.639 246.225 222 249.72 222 254V300C222 304.418 218.418 308 214 308H8C3.58172 308 0 304.418 0 300V254C0 249.72 3.36114 246.225 7.58789 246.011L8.41211 245.989C12.6389 245.775 16 242.28 16 238C16 233.72 12.6389 230.225 8.41211 230.011L7.58789 229.989C3.36114 229.775 1.0142e-07 226.28 0 222V8C0 3.58172 3.58172 1.04692e-07 8 0H95.998C96.5501 0.000251851 96.998 0.447871 96.998 1V5C96.998 5.55228 97.4458 6 97.998 6H123.998C124.55 5.99975 124.998 5.55213 124.998 5V1C124.998 0.447716 125.446 1.70037e-06 125.998 0H214C218.418 0 222 3.58172 222 8V222C222 226.28 218.639 229.775 214.412 229.989L213.588 230.011C209.361 230.225 206 233.72 206 238C206 242.28 209.361 245.775 213.588 245.989L214.412 246.011Z';

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

/**
 * Snap pairs — child panel id → partner panel id.
 *
 * The child has a connector peg (mushroom's stem pegs) that mates with a notch
 * on the partner (shape panel's top connector notch). When the child is dragged
 * within SNAP_RADIUS of its partner's notch, releasing locks them together with
 * a rigid pair of Matter constraints. While snapped, dragging the child far
 * enough (DETACH_RADIUS) tears the constraints down and they become free again.
 */
const SNAP_PAIRS: Record<string, string> = {
  forest: 'shape',
  'square-tone': 'shape',
};

const SNAP_RADIUS = 40;     // pointer-up within this distance of snap point → snap

/**
 * Compute, in world coordinates, the position the child body must occupy so
 * its connector peg sits perfectly inside the partner's notch.
 *
 * Geometry (matches both SVG paths exactly):
 *   - Mushroom (74×80): peg sticks from y=74 to y=80, between x≈22 and x≈52
 *     (a 26px-wide × 6px-tall tab). Mushroom shoulders are at y=74.
 *   - Shape panel (222×308): notch dips from y=0 to y=6, between x≈98 and
 *     x≈126 (a 28px-wide × 6px-deep socket). Panel top edge is y=0.
 *
 * For a clean silhouette, the mushroom shoulders (mushroom y=74) must rest
 * exactly on the panel's top edge (panel y=0), which puts the peg's bottom
 * (mushroom y=80) exactly at the panel notch's bottom (panel y=6) — no gap,
 * no overlap, the two shapes form one continuous body.
 */
function computeSnapPosition(
  partnerBody: Matter.Body,
  childPanel: PanelDef,
  partnerPanel: PanelDef,
): { x: number; y: number } {
  const partnerHalfH = partnerPanel.height / 2;
  const childHalfH = childPanel.height / 2;
  // The mushroom's shoulders (child-local y=74) must sit on the partner's
  // top edge (partner-local y=0). Express the child's center in the
  // partner's LOCAL frame, then rotate by the partner's angle so the
  // mushroom follows the partner as it tumbles around the screen.
  const SHOULDER_Y_IN_CHILD = 74;
  const shoulderOffsetFromChildCenter = SHOULDER_Y_IN_CHILD - childHalfH; // 34
  // Local-frame position of the child's center, relative to partner center:
  //   x: 0 (centered horizontally on the panel)
  //   y: -(partnerHalfH + shoulderOffsetFromChildCenter) — sits above panel top
  const localX = 0;
  const localY = -(partnerHalfH + shoulderOffsetFromChildCenter);
  // Rotate by partner's angle so the offset tracks the panel's rotation.
  const a = partnerBody.angle;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const worldDx = localX * cos - localY * sin;
  const worldDy = localX * sin + localY * cos;
  return {
    x: partnerBody.position.x + worldDx,
    y: partnerBody.position.y + worldDy,
  };
}

function PhysicsPanelsInner(
  { panels, containerWidth, containerHeight, drawerOpen, drawerRightEdge, onPanelDroppedInDrawer, onSnapChange }: PhysicsPanelsProps,
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
  // Snapped pairs — maps a child panel id (the mushroom) to its partner.
  // While snapped, every physics tick we hard-position the child to track the
  // partner's body so the pair behaves as one rigid unit. We do NOT use
  // Matter constraints — they oscillate at this stiffness. Direct position
  // tracking is rock-solid and guarantees the visual seam stays clean.
  const snappedRef = useRef<Map<string, { partnerId: string }>>(new Map());
  // Mirror of snappedRef in React state so we can re-render the UI (data-snapped
  // attribute) when pairs form/break.
  const [snappedSet, setSnappedSet] = useState<Set<string>>(new Set());
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
  const onSnapChangeRef = useRef(onSnapChange);
  onSnapChangeRef.current = onSnapChange;

  // Initialize physics engine once
  useEffect(() => {
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
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

      // Snap tracker: every tick, position the static child so its peg stays
      // seated in the partner's notch — accounting for the partner's current
      // rotation so the pair tumbles together as one rigid unit. The partner
      // keeps full physics (drag, throw, tilt, bounce); the child rides along.
      for (const [childId, pair] of snappedRef.current) {
        const childBody = bodiesRef.current.get(childId);
        const partnerBody = bodiesRef.current.get(pair.partnerId);
        const childPanel = panelsRef.current.find((p) => p.id === childId);
        const partnerPanel = panelsRef.current.find((p) => p.id === pair.partnerId);
        if (!childBody || !partnerBody || !childPanel || !partnerPanel) continue;
        const target = computeSnapPosition(partnerBody, childPanel, partnerPanel);
        Matter.Body.setPosition(childBody, target);
        Matter.Body.setAngle(childBody, partnerBody.angle);
      }

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
        // Break any snap involving the removed panel — both as child and
        // as partner — before tearing down its body, otherwise the constraint
        // would dangle.
        if (snappedRef.current.has(id)) breakSnap(id);
        for (const [childId, pair] of snappedRef.current) {
          if (pair.partnerId === id) breakSnap(childId);
        }
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

  // Tear down the snap between a child and its partner. The child returns to
  // dynamic physics. Used when the user pulls a snapped child away or when
  // one of the panels gets stored in the drawer.
  const breakSnap = useCallback((childId: string) => {
    const childBody = bodiesRef.current.get(childId);
    const pair = snappedRef.current.get(childId);
    const partnerBody = pair ? bodiesRef.current.get(pair.partnerId) : null;
    if (childBody && childBody.isStatic) {
      Matter.Body.setStatic(childBody, false);
      Matter.Body.setVelocity(childBody, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(childBody, 0);
    }
    // Restore default collision filter on both bodies so they collide with
    // everything again.
    if (childBody) {
      childBody.collisionFilter = { ...childBody.collisionFilter, group: 0 };
    }
    if (partnerBody) {
      partnerBody.collisionFilter = { ...partnerBody.collisionFilter, group: 0 };
    }
    snappedRef.current.delete(childId);
    setSnappedSet((prev) => {
      const next = new Set(prev);
      next.delete(childId);
      return next;
    });
    onSnapChangeRef.current?.(childId, null);
    wakeRef.current();
  }, []);

  // Lock a child onto its partner: place it precisely in the snap position,
  // make it static, and let the per-tick tracker keep it glued to the partner
  // as the partner moves. This is more reliable than Matter constraints
  // (zero oscillation, exact pixel placement, predictable behavior).
  const formSnap = useCallback((childId: string, partnerId: string) => {
    const engine = engineRef.current;
    const childBody = bodiesRef.current.get(childId);
    const partnerBody = bodiesRef.current.get(partnerId);
    const childPanel = panelsRef.current.find((p) => p.id === childId);
    const partnerPanel = panelsRef.current.find((p) => p.id === partnerId);
    if (!engine || !childBody || !partnerBody || !childPanel || !partnerPanel) return;

    // Straighten the partner so the snap target is calculated correctly. The
    // child gets straightened too — peg only mates cleanly when both are level.
    Matter.Body.setAngle(partnerBody, 0);
    Matter.Body.setAngularVelocity(partnerBody, 0);
    Matter.Body.setVelocity(partnerBody, { x: 0, y: 0 });
    Matter.Body.setAngle(childBody, 0);
    Matter.Body.setAngularVelocity(childBody, 0);
    Matter.Body.setVelocity(childBody, { x: 0, y: 0 });

    const snapPos = computeSnapPosition(partnerBody, childPanel, partnerPanel);
    Matter.Body.setPosition(childBody, snapPos);
    // Make the child static — its position is now derived from the partner
    // every tick (see the snap-tracking loop in the physics step).
    Matter.Body.setStatic(childBody, true);

    // Disable collision between the two snapped bodies. The mushroom peg
    // overlaps the panel notch by design, and without this the dynamic
    // partner gets shoved away from the static child every tick — sinking
    // the panel toward the bottom of the screen. Negative-valued groups in
    // Matter never collide with each other, so a unique pair group isolates
    // this pair without affecting how either body collides with the rest of
    // the world.
    const pairGroup = -(Date.now() & 0x7fffffff);
    childBody.collisionFilter = { ...childBody.collisionFilter, group: pairGroup };
    partnerBody.collisionFilter = { ...partnerBody.collisionFilter, group: pairGroup };

    snappedRef.current.set(childId, { partnerId });
    setSnappedSet((prev) => {
      const next = new Set(prev);
      next.add(childId);
      return next;
    });
    onSnapChangeRef.current?.(childId, partnerId);
    wakeRef.current();
  }, []);

  const handleDragStart = useCallback((e: React.PointerEvent, panelId: string) => {
    // Only start drag on a real press — button 0 (left mouse/trackpad) with buttons bit set.
    // This ignores spurious pointerdown events from trackpad hovers / force touch.
    if (e.button !== 0) return;
    if (e.buttons !== undefined && e.buttons !== 1) return;

    // Don't start drag if clicking on interactive elements (buttons, inputs, dials, sliders)
    const target = e.target as HTMLElement;
    if (target.closest('button, input, .radial-dial, .radial-btn, .density-slider, .onion-toggle-btn, .canvas-input')) return;

    e.stopPropagation();
    if (pinned.has(panelId)) return;

    const engine = engineRef.current;
    const body = bodiesRef.current.get(panelId);
    const mouseBody = mouseBodyRef.current;
    if (!engine || !body || !mouseBody) return;

    // If this panel is currently snapped to a partner, grabbing it immediately
    // detaches the snap. The body becomes dynamic again so the mouse drag
    // constraint can move it. (Without this, the body stays static and the
    // user gets a frozen panel that ignores the mouse.)
    if (snappedRef.current.has(panelId)) {
      breakSnap(panelId);
    }

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
    setDraggingPanelId(panelId);
    wakeRef.current();
  }, [pinned, breakSnap]);

  // Window-level drag listeners — installed only while a drag is active.
  // Using window events (instead of setPointerCapture on the panel) avoids
  // trackpad stickiness: on trackpads, cursor jumps can lose pointer capture
  // when the panel element rerenders, leaving the drag constraint attached
  // after the user has released.
  useEffect(() => {
    if (draggingPanelId === null) return;

    const onMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!dragRef.current || !mouseBodyRef.current) return;
      const mx = Math.max(0, Math.min(containerWidth, e.clientX));
      const my = Math.max(0, Math.min(containerHeight, e.clientY - 44));
      Matter.Body.setPosition(mouseBodyRef.current, { x: mx, y: my });
    };

    const onUp = () => {
      handlePointerUp();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingPanelId, containerWidth, containerHeight]);

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

    // Attempt to snap onto a partner if this panel has one defined and the
    // child's peg is close enough to the partner's notch. Skipped if the
    // child is already snapped (still attached from a prior interaction).
    const partnerId = SNAP_PAIRS[panelId];
    if (partnerId && body && !snappedRef.current.has(panelId)) {
      const partnerBody = bodiesRef.current.get(partnerId);
      const childPanel = panelsRef.current.find((p) => p.id === panelId);
      const partnerPanel = panelsRef.current.find((p) => p.id === partnerId);
      if (partnerBody && childPanel && partnerPanel) {
        const target = computeSnapPosition(partnerBody, childPanel, partnerPanel);
        const dx = body.position.x - target.x;
        const dy = body.position.y - target.y;
        if (Math.hypot(dx, dy) < SNAP_RADIUS) {
          formSnap(panelId, partnerId);
        }
      }
    }

    wakeRef.current();
  }, [formSnap]);

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
        const isPencilTool = panel.shape === 'pencil-tool';
        const isTriangle = panel.shape === 'triangle';
        const isMushroom = panel.shape === 'mushroom';
        const isSquareTone = panel.shape === 'square-tone';
        const panelDragProps = {
          onPointerDown: (e: React.PointerEvent) => handleDragStart(e, panel.id),
          onContextMenu: (e: React.MouseEvent) => handleTogglePin(e, panel.id),
          style: { cursor: isPinned ? 'default' : 'grab' } as React.CSSProperties,
        };

        if (isPill) {
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              data-panel-id={panel.id}
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

        if (isMushroom) {
          const w = panel.width;
          const h = panel.height;
          // When snapped to a partner, swap the solid mushroom fill for a
          // vertical gradient that blends into the partner's color at the
          // bottom (peg) edge, so the two shapes read as one continuous body.
          const isSnapped = snappedSet.has(panel.id);
          const partnerId = SNAP_PAIRS[panel.id];
          const partnerColor = partnerId
            ? panelsRef.current.find((p) => p.id === partnerId)?.color
            : undefined;
          const gradientId = `mushroom-grad-${panel.id}`;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel mushroom-panel"
              data-snapped={isSnapped ? 'true' : undefined}
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
                viewBox="0 0 74 80"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                {isSnapped && partnerColor && (
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={panel.color} />
                      <stop offset="55%" stopColor={panel.color} />
                      <stop offset="100%" stopColor={partnerColor} />
                    </linearGradient>
                  </defs>
                )}
                <path
                  d={MUSHROOM_SVG_PATH}
                  fill={isSnapped && partnerColor ? `url(#${gradientId})` : panel.color}
                />
              </svg>
              <div className="mushroom-header">
                <span className="mushroom-title">{panel.title}</span>
              </div>
              <div className="mushroom-body">{panel.children}</div>
            </div>
          );
        }

        if (isSquareTone) {
          const w = panel.width;
          const h = panel.height;
          // Same snap-aware visual treatment as the mushroom: when snapped,
          // swap the solid fill for a vertical gradient that resolves into
          // the partner's color at the peg, so the seam reads as one body.
          const isSnapped = snappedSet.has(panel.id);
          const partnerId = SNAP_PAIRS[panel.id];
          const partnerColor = partnerId
            ? panelsRef.current.find((p) => p.id === partnerId)?.color
            : undefined;
          const gradientId = `square-tone-grad-${panel.id}`;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel square-tone-panel"
              data-snapped={isSnapped ? 'true' : undefined}
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
                viewBox="0 0 74 80"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                {isSnapped && partnerColor && (
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={panel.color} />
                      <stop offset="55%" stopColor={panel.color} />
                      <stop offset="100%" stopColor={partnerColor} />
                    </linearGradient>
                  </defs>
                )}
                <path
                  d={SQUARE_TONE_SVG_PATH}
                  fill={isSnapped && partnerColor ? `url(#${gradientId})` : panel.color}
                />
              </svg>
              <div className="square-tone-body">{panel.children}</div>
            </div>
          );
        }

        if (isTriangle) {
          const w = panel.width;
          const h = panel.height;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel triangle-panel"
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
                viewBox="0 0 222 200"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path d={TRIANGLE_SVG_PATH} fill={panel.color} />
              </svg>
              <div className="triangle-body">{panel.children}</div>
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

        if (isPencilTool) {
          const w = panel.width;
          const h = panel.height;
          // Unique gradient id per panel instance so multiple pencil-tools
          // (e.g. floating + drawer preview) don't collide in the SVG defs.
          const gradId = `pencil-tool-grad-${panel.id}`;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel pencil-tool-panel"
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
                viewBox="0 0 513 70"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <defs>
                  {/* Pink hotspot at the tip (x=460), fading to transparent
                      over a 186.5 radius — verbatim from Figma SVG. */}
                  <radialGradient
                    id={gradId}
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(460 35) rotate(180) scale(186.5 186.5)"
                  >
                    <stop stopColor="#FF92BE" />
                    <stop offset="1" stopColor="#FF92BE" stopOpacity="0" />
                  </radialGradient>
                </defs>
                {/* Base orange */}
                <path d={PENCIL_TOOL_SVG_PATH} fill={panel.color} />
                {/* Pink gradient overlay */}
                <path d={PENCIL_TOOL_SVG_PATH} fill={`url(#${gradId})`} />
              </svg>
              <div className="pencil-tool-body">{panel.children}</div>
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
          // Find any snapped child whose partner is THIS dumbbell — used to
          // tint the top notch area with the child's color so the visual
          // blend is symmetric on both sides of the seam.
          let partnerChildColor: string | undefined;
          for (const childId of snappedSet) {
            if (SNAP_PAIRS[childId] === panel.id) {
              const childPanel = panelsRef.current.find((p) => p.id === childId);
              if (childPanel) {
                partnerChildColor = childPanel.color;
                break;
              }
            }
          }
          const isSnapped = !!partnerChildColor;
          const dumbbellGradId = `dumbbell-grad-${panel.id}`;
          return (
            <div
              key={panel.id}
              ref={(el) => { panelRefs.current.set(panel.id, el); }}
              className="floating-panel dumbbell-panel"
              data-snapped={isSnapped ? 'true' : undefined}
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
                viewBox="0 0 222 308"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                {isSnapped && partnerChildColor && (
                  <defs>
                    {/* Top-edge tint: brown (partner child color) bleeds in from
                        y=0 down to ~y=32, then resolves to the dumbbell color. */}
                    <linearGradient id={dumbbellGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={partnerChildColor} />
                      <stop offset="6%" stopColor={partnerChildColor} />
                      <stop offset="14%" stopColor={panel.color} />
                      <stop offset="100%" stopColor={panel.color} />
                    </linearGradient>
                  </defs>
                )}
                <path
                  d={DUMBBELL_SVG_PATH}
                  fill={isSnapped && partnerChildColor ? `url(#${dumbbellGradId})` : panel.color}
                />
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
