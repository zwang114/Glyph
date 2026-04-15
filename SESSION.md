# Glyph Studio — Session Handoff

> Portable session memory. Read this first when picking up work on a new machine or with a fresh Claude instance.

---

## What this is

A web-based **pixel font editor** — the user is a senior type designer building a tool that lets them draw letterforms on a pixel grid and export real OTF/TTF fonts. The key differentiator from Glyphs/FontForge is that this is pixel-based (not bezier-based) and has a playful, experimental UI with physics-driven floating control panels.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + Vite + TypeScript |
| Canvas | HTML Canvas 2D (not PixiJS — simpler for pixel grids) |
| Font engine | `opentype.js` 1.3.4 (pinned for Windows validation) |
| State | Zustand + zundo (undo/redo) |
| Physics | `matter-js` (for floating draggable panels) |
| UI font | Inter Light (300) + JetBrains Mono for numbers |

See `package.json` for exact versions. `node_modules/` is gitignored — run `npm install` first.

---

## How to run

```bash
cd glyph-studio
npm install
npm run dev
# http://localhost:5173
```

To see the editor: click "OPEN CURRENT" on the dashboard, then navigate to `/project/<id>/edit/0041` (or any glyph hex).

---

## Current feature state

### Editor tab (main working view)

- **Pixel grid canvas** with zoom (scroll wheel, cursor-focused), pan (Alt+drag or middle-click), and full-canvas dot grid
- **Dotted border** around editable canvas area
- **Onion skin** — renders a faint serif or sans-serif character at 7% opacity behind the pixel art, auto-matches the current glyph's unicode, user can toggle serif/sans and adjust size (30%–200%)
- **Canvas size controls** — W x H inputs resize the glyph grid (default 24x32)
- **Mirror modes** — Off, Horizontal, Vertical, Both (drawing on one side mirrors to the other)
- **Pixel shapes** — Square, Circle, Diamond, Triangle, Metaball (renders differently on canvas + exports with matching vector paths)
- **Density slider** (15%–100%) — controls how much of each cell the shape fills; affects both canvas and export
- **Drawing tools** — Pixel, Line (Bresenham), Rectangle, Fill (flood fill). Eraser accessible via `E` key or right-click
- **Undo/redo** — Ctrl+Z / Ctrl+Shift+Z, strokes captured as single undo steps

### Floating physics panels (the fun part)

Three panels float over the canvas with physics (gravity, collision, bounce):

1. **Tools** — orange pentagon/pen shape, 222x260, "PENS" title, 4 buttons (PIXEL, LINE, RECTANGLE, FILL)
2. **Shape + Density** — olive-green ticket/card with side notches, 222x175, shape types top + density slider bottom
3. **Mirror** — purple rounded rectangle, 125x196, vertical stack of OFF/H/V/HV

**Interactions:**
- **Drag** only works via the small circle icon in the panel's top-right (or top-tip for pen shape)
- **Pin** — right-click the circle to freeze the panel in place (circle fills white). Right-click again to unpin and let it fall back under gravity
- **Walls on all sides** + per-frame position clamping ensure panels can't leave the viewport

**Physics implementation notes:**
- `setInterval` at ~60fps, not `requestAnimationFrame` (RAF is throttled to zero by the Claude Preview headless browser — see "Known issues" below)
- Direct DOM updates via refs, not React state, to avoid per-frame re-renders
- Auto-pause after 60 consecutive "at rest" frames (panels stop updating DOM when settled) — the `wake()` helper restarts the loop on drag, pointer-up, or unpin
- Custom SVG paths for pen and ticket shapes (see `buildPenPath` and `TICKET_SVG_PATH` in `PhysicsPanels.tsx`)

### Other tabs

- **Dashboard** — minimal "new project / open current" with current project card
- **Overview** — character grid showing all Basic Latin glyphs with mini thumbnails
- **Preview** — live @font-face injection + waterfall at 12/16/24/32/48/64/96px
- **Export** — downloads OTF/TTF via `opentype.js`, honors current shape + density
- **Spacing** — placeholder (not implemented yet)

---

## Critical files

| Path | Role |
|------|------|
| `src/canvas/PixelCanvas.tsx` | Main pixel drawing canvas (dot grid, onion skin, shapes, tools, zoom/pan) |
| `src/components/shared/PhysicsPanels.tsx` | Draggable/pinnable floating panels with matter-js physics and custom SVG shapes |
| `src/components/editor/GlyphEditorView.tsx` | Editor layout — panel definitions live here |
| `src/stores/fontStore.ts` | Zustand + zundo store — glyph pixel data, CRUD actions |
| `src/stores/editorStore.ts` | UI state — active tool, shape, density, onion skin, mirror |
| `src/engine/shapes.ts` | Per-pixel shape rendering (square, circle, diamond, triangle, metaball) |
| `src/engine/font/compiler.ts` | Pixel grid → opentype.js paths → OTF/TTF |
| `src/index.css` | All styling. Brutalist dark theme. Floating panel styles include `.fp-btn`, `.pen-panel`, `.ticket-panel` |

---

## Design decisions worth preserving

1. **Pixel, not bezier.** The project started as a bezier editor and pivoted. Don't revert.
2. **Black background, white accents, 1px strokes.** Brutalist aesthetic inspired by Teenage Engineering. Pure black/white except the floating panels which have distinctive colors.
3. **Floating colored control panels, not a fixed sidebar.** The user designed these in Figma (see file key below). Each has a custom SVG shape.
4. **Physics panels.** Deliberate design choice — makes the tool feel playful. Drag-by-circle and right-click-to-pin were user requests.
5. **Footer shortcuts.** `Ctrl+Z undo · Ctrl+Shift+Z redo · E erase · Scroll to zoom · Alt+drag to pan` — removed visible Undo/Redo/Eraser buttons to simplify the panels.
6. **No AI evaluation.** The user removed it — "I want this to be more expressive."

---

## Figma file

**File:** `zfhvZLh6zmBAdJcMQwb9tv` (named "Blur")
**URL:** https://www.figma.com/design/zfhvZLh6zmBAdJcMQwb9tv/Blur

Custom panel shapes the user designed:
- Pen outline: node `32:126`, exact SVG path stored in `PhysicsPanels.tsx` as `buildPenPath`
- Ticket/notched card: node `30:116`, exact SVG path stored in `PhysicsPanels.tsx` as `TICKET_SVG_PATH`

The Figma MCP server is used via the design tool. On a new machine, you'll need the Figma MCP configured to access this file.

---

## Known issues / gotchas

1. **Claude Preview browser throttles requestAnimationFrame.** RAF never fires in the headless preview, so physics uses `setInterval(step, 1000/60)` instead. Real browsers work fine with both — keep `setInterval` unless you're sure about your preview environment.
2. **React StrictMode double-mount** causes the physics effect to run twice. The cleanup + `bodiesRef.current.clear()` handles this correctly.
3. **Screenshot timing in preview tool** times out while physics is animating. Auto-pause after settling fixes this.
4. **opentype.js pinned at 1.3.4.** Newer versions have Windows font validation bugs. Don't upgrade.
5. **`Matter.Bodies.fromVertices`** requires `poly-decomp` for concave shapes. We fall back to rectangle bodies for panels — the visual SVG shape is cosmetic; the physics body is a rounded rectangle. Good enough.

---

## Git history — save points

Run `git log --oneline` to see. Notable commits:

- `latest` — Fill tool added, ticket-shape Shape panel, pen-shape Tools panel with 4 buttons
- Physics panels with drag-handle + pin (right-click)
- Dot grid, canvas border, zoom/pan, onion skin, grid resize
- Pixel font editor MVP with shapes + density

**To restore any save point:** `git checkout .` (latest) or `git checkout <hash>` for older.

---

## How to pick up this session on another machine

1. Copy/clone the `glyph-studio/` directory (or push to GitHub and clone)
2. `npm install` to install deps
3. `npm run dev`
4. Open the Figma file if you need to reference designs
5. Read this file and `src/components/shared/PhysicsPanels.tsx` + `src/components/editor/GlyphEditorView.tsx` to understand the current state
6. Tell the new Claude: "Read SESSION.md and the two files it references, then continue where the previous session left off."

If you can't transfer the repo, the key files to recreate:
- `PhysicsPanels.tsx` (contains both custom SVG paths)
- `GlyphEditorView.tsx` (panel definitions with colors + dimensions)
- `editorStore.ts` (all toggle state)

---

## What's next (user's likely direction)

Based on recent edits:
- Possible additional custom panel shapes in Figma
- Spacing/kerning view implementation
- More panel styling tweaks (colors, sizes, proportions)
- Possibly adding a 4th floating panel (e.g., Glyph info / navigation)

Don't proactively build these — wait for the user to direct.
