// SVG path constants for the physics panel shapes.
// Extracted from PhysicsPanels.tsx so that file only exports components
// (react-refresh/only-export-components).

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
