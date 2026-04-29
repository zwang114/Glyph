# Bloom — Feature Spec

## Concept
User draws a letter, clicks Bloom, the canvas comes alive: pixels propagate using Game of Life rules until the canvas fills with texture. Original letter stays locked and legible. Inspiration: Alida Sun's generative pixel art.

## Locked decisions

### Simulation
- **Ruleset:** B3/S237
  - Born: dead cell with exactly 3 live neighbors
  - Survives: live cell with 2, 3, or 7 live neighbors
  - Dies: all other live cells
- **Neighborhood:** 8-cell Moore (orthogonal + diagonal)
- **Edge behavior:** Hard walls (no toroidal wrap). Out-of-grid cells count as dead.
- **Letter pixels:** Always survive. Count as live neighbors for surrounding cells. Births adjacent to letter pixels are intended.

### Appearance
- **New cell shape:** Inherited randomly from one of its live neighbors at birth (pick uniformly from all live neighbors in the Moore neighborhood)
- **New cell color:** Random from the Alida palette below
- **Letter cells:** Inherit the user's drawn shape and color (not from palette)
- **Render order:** Bloom layer underneath, letter layer on top

### Alida Palette (v1)
- `#FF3B6F` — magenta-red
- `#FFB400` — amber
- `#00C2A8` — teal
- `#3D5AFE` — electric blue
- `#B14EFF` — purple
- `#FF6B35` — orange
- `#7CFF6B` — lime
- `#FFEC3D` — yellow

### Loop behavior
- **Cadence:** ~150ms per generation (tunable)
- **Stop conditions** (whichever fires first):
  1. No new births for 10 consecutive generations (steady state — primary)
  2. Coverage ≥ 50% (cap)
  3. 500 generations (safety)

### UX (future phases)
- Bloom button → Pause → Resume → Reset
- Speed slider
- Audio toggle (optional, off by default in spike)
- One-shot undo (Zundo): pre-bloom snapshot, restore on undo
- Bloom is destructive — replaces canvas state, recoverable only via undo

## Phases
- **Phase 1** — Headless engine + dev spike on letter A (throwaway button)
- **Phase 2** — Promote to proper render layer, support all letters
- **Phase 3** — Real UI (Bloom/Pause/Resume/Reset, speed, undo wiring)
- **Phase 4** — Visual polish (oscillation, breathing, halo, birth/death anim)
- **Phase 5** — Audio integration (edge-cell births → existing audio engine)
- **Phase 6** — Bloom Moods (palette + ruleset presets) [stretch]
- **Phase 7** — Polish & edge cases

## Out of scope (for now)
- Export (PNG, video, save as glyph) — deferred indefinitely
- AI-driven generation
- Multi-layer simulations

## Phase 1 spike results

- **Ruleset**: B3/S237 radiates naturally from letter edges. Coverage cap fires first on dense glyphs (~gen 40–60 on 22×23 grid). No explosion, no stall.
- **Cadence**: 150ms felt right. No tuning needed.
- **Coverage threshold**: 50% cap is correct — letter stays legible at that density.
- **Palette + shapes**: Reads strongly Alida-ish. Vivid scatter over dark letter.
- **Render fix**: Bloom must render **after** `drawFrame` (not before) — canvas background fill erases anything drawn underneath.
- **Renderer**: `drawShape` from `src/engine/shapes.ts` reused directly, zero changes to existing files.
- **Performance**: Full-grid HTML5 Canvas redraw per generation, zero jank at this scale. Pixi.js not used.

## Open questions for later phases
- Exact behavior when user draws during a paused bloom (Phase 7)
