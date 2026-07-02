# Glyph Studio — Ultrareview

**Date:** 2026-04-18 (Saturday)
**Scope:** Full repository at `/mnt/Claude/glyph-studio`
**Run mode:** Automated (daily-review scheduled task)
**Reviewer:** Claude (autonomous)
**Previous review:** `reviews/ultrareview-2026-04-17.md`

---

## Top-line verdict

Large-scope day. The project is in the middle of a "Stage 4 → 5" migration from a single-glyph store (`fontStore`) to a multi-canvas workspace model (`canvasStore`), and today's diff reflects that: a brand-new `canvasStore` (334 lines), a `canvasCompat` shim for the legacy Preview/Export views, a nearly-doubled `PixelCanvas` (530 → 1,140 lines), shortcut registry + help overlay, a `useClickSound` hook, and a large `PhysicsPanels` drag/physics rework (gravity turned off, window-level pointer listeners, button-state guards).

No critical defects, no malware indicators, no new security red flags. Architecture is still clean and the TypeScript discipline remains strong (no `any`, no `@ts-ignore`, no `as any` anywhere outside a couple of `'center' as const` style literals). But the migration has left some debt: the old `fontStore` is only partially wired out, two additional dependencies are now unused on top of `pixi.js` (still present), and three files flagged as large yesterday are effectively unchanged or larger.

All of yesterday's eight suggested actions are still open — none have been applied.

Overall grade: **B (82/100)** — down slightly from yesterday's B+ because the work-in-progress state has widened the technical-debt surface while the previous review's items were not yet addressed. Nothing alarming, but today is a "stop and tidy before adding more" day.

---

## What I looked at

`src/` source tree, `package.json`, `package-lock.json` (for dep surface), `tsconfig.*.json`, `eslint.config.js`, `.gitignore`, `SESSION.md`, `README.md`, uncommitted working-tree changes via `git status` / `git diff`, and the full delta between 2026-04-17 and today (28 files changed, +5,575 / −1,212 lines since the branch diverged from `HEAD~5`).

Working-tree state as of this run:

- 17 tracked files modified, none yet committed.
- 8 new untracked paths: `src/components/shared/ShortcutHelpOverlay.tsx`, `src/hooks/useClickSound.ts`, `src/hooks/useShortcutHelp.ts`, `src/shortcuts/`, `src/stores/canvasCompat.ts`, `src/stores/canvasStore.ts`, `src/types/canvas.ts`, and the `crumpled-paper-texture-*.jpg` asset at root.
- Last commit on `master`: `eea6c92 "Savepoint: drag fixes for trackpad + drawer collision entry"`.

Current hot-file sizes:

- `src/canvas/PixelCanvas.tsx` — 1,140 lines (was 530; +115%)
- `src/components/shared/PhysicsPanels.tsx` — 1,116 lines (was 1,093; +2%)
- `src/components/shared/ToolDrawer.tsx` — 619 lines (was 605; +2%)
- `src/components/editor/GlyphEditorView.tsx` — 377 lines (was 300; +26%)
- `src/stores/canvasStore.ts` — 334 lines (new)
- `src/engine/shapes.ts` — 256 lines (unchanged)
- `src/stores/fontStore.ts` — 222 lines (unchanged; now effectively legacy)

---

## Carry-over from 2026-04-17

Status of yesterday's eight action items.

1. `npm uninstall pixi.js` — **not done.** Still in `package.json` at `^8.18.1`. Zero imports across `src/`. Now joined by two more dead deps (see #A1 below).
2. Extract `usePhysicsEngine` hook / remove the fake-dep `eslint-disable` lines — **not done.** `PhysicsPanels.tsx` still has three `eslint-disable-next-line react-hooks/exhaustive-deps` comments (lines 537, 584, 609), and `ToolDrawer.tsx` still duplicates the Matter.js setup.
3. Add Vitest + first tests — **not done.** No test runner in `package.json`, no `*.test.*` files, no `__tests__` dir. Now even more valuable given how much `canvasStore` logic (flood fill, mirror, brush, grid resize) depends on correctness.
4. User-visible error feedback around `downloadFont` / `generatePreviewUrl` — **not done.** `compiler.ts` still has no `try/catch` on the download path; `PreviewView.tsx:36` still silently swallows exceptions into `setFontUrl(null)`. The only visible signal is "no preview."
5. Add `modifiedAt` update to `setAdvanceWidth` — **not done.** `fontStore.ts:166-179` still omits the `project.modifiedAt` bump. (Note: now that `canvasStore` is where live editing happens, this matters less in the short term, but the bug is still on the books and `setAdvanceWidth` is still reachable via the spacing view scaffolding.)
6. Move `figma_code_*.js` out of root; delete `tmp_*.png` / `tmp_*.b64`; add `tmp_*` to `.gitignore` — **not done.** All 10 `tmp_*` files and 5 `figma_code_*.js` files are still at the project root. The `.gitignore` has no `tmp_*` entry. A new root-level asset (`crumpled-paper-texture-realisric-crease-sheet-free-vector.jpg`, 25 KB) was also added today and is also untracked/unorganised.
7. `aria-label` pass + `?` shortcuts modal — **partially done.** `?` modal is in (`ShortcutHelpOverlay.tsx` + `useShortcutHelp.ts` + `shortcuts/registry.ts`), nicely wired into `AppShell` with an `aria-live` announce region (see positive callouts below). The `aria-label` pass on floating panels and icon buttons is still incomplete: only `RadialBrushSelector` has real `aria-label` / `aria-pressed` / `aria-keyshortcuts`; the other radial selectors, density slider, onion toggles, and floating panel wrappers are still unlabeled.
8. IndexedDB vs in-memory decision — **not done.** `drawerStore` still uses `idb` for panel visibility only. `canvasStore` has no persistence; `fontStore` has no persistence. A page refresh still loses all work.

---

## New high-priority findings (today)

### H1. Undo/redo is now split across two stores and only `canvasStore` is wired to Cmd-Z

`GlyphEditorView.tsx:140-152` handles Cmd-Z and Cmd-Shift-Z by calling `useCanvasStore.temporal.getState().undo()` / `.redo()`. But `fontStore` also uses `temporal(…)` with a separate history stack of its own (`fontStore.ts:199-214`). Any glyph-level mutation that still goes through `fontStore` (advance width, kern pairs, `initProject`) will not be undone by Cmd-Z, and changes aren't synced between the two histories.

Practically today, only `canvasStore` is edited in the main Edit view, so users won't immediately hit this. But the moment Spacing or Kerning views become live and route through `fontStore`, Cmd-Z will silently stop working. Fix before wiring those views.

**Action:** pick one of — (a) collapse `fontStore` into `canvasStore` and drop the compat shim, (b) route undo/redo through a dispatcher that triggers both temporal instances, or (c) document clearly which store owns which actions and add a second pair of shortcuts.

### H2. `pushHistory` in `PixelCanvas` reaches into `zundo`'s internal state shape

`PixelCanvas.tsx:698-705`:

```ts
useCanvasStore.temporal.setState((s) => ({
  pastStates: [...s.pastStates.slice(-(14)), snapshot],
  futureStates: [],
}));
```

This is doing a manual snapshot (pre-action state) because the surrounding code pauses zundo for the duration of a stroke/drag. It works, but it:

- Duplicates `zundo`'s `limit: 15` bookkeeping with a hard-coded `-(14)` slice — if someone bumps the store's `limit`, this stays at 14 and silently stops matching.
- Couples directly to `zundo`'s internal state shape (`pastStates`, `futureStates`). If `zundo` ever renames those fields, this breaks with no type error because `temporal.setState` is a generic passthrough.

**Action:** wrap this in a helper (e.g. `snapshotBeforePausedAction()`) living beside the store, read `limit` from a shared constant, and add a one-line comment pointing at `zundo`'s API so future readers know it's intentional. An integration test would also be good insurance.

### H3. `getCellSize(frame)` has an unused `frame` parameter — and the function doesn't respect per-frame sizes

`PixelCanvas.tsx:106-110`:

```ts
const getCellSize = useCallback((frame: CanvasFrame) => {
  const WORLD_CELL = 16;
  return WORLD_CELL * useCanvasStore.getState().viewport.zoom;
}, []);
```

Two separate problems:

1. **Unused parameter.** `tsconfig.app.json` has `noUnusedParameters: true` — this *should* be a TypeScript error. Either the compile isn't being run (`build` does `tsc -b`, so it would fail — suggests this was added since the last `npm run build`), or the parameter was kept intentionally for API symmetry. If intentional, rename to `_frame` or remove.
2. **All cells are the same size regardless of frame.** The function name implies a per-frame size, but the implementation returns a constant. If different canvases are meant to render at different cell sizes (e.g. because of wildly different grid dimensions), that intent is lost — and if they're not, the parameter is misleading.

**Action:** decide which is true, then either delete the parameter or actually vary the return value based on `frame.gridWidth` / `frame.gridHeight`.

### H4. `screenToWorld` in `PixelCanvas` is defined but never called

`PixelCanvas.tsx:92-98` — `screenToWorld` is declared with `useCallback` but has zero callers anywhere in the file. `noUnusedLocals` should flag this. Same answer as H3: either it's dead code to be removed, or it was just written ahead of the pointermove code that will use it.

**Action:** delete if unused; TypeScript will tell you the moment you remove it if something silently depended on it.

### H5. `useSeedTestGlyphs` is dead code

`src/hooks/useSeedTestGlyphs.ts` (90 lines) defines a `useSeedTestGlyphs()` hook that seeds a pixel-art "H" into `fontStore`. No file imports it. It also depends on `createEmptyGrid` from `types/font`, which still exists, so deleting the hook is safe.

**Action:** delete the file. If the seeded test glyph is still useful for development, port it to a test fixture (once #3 above lands) rather than a production hook.

### H6. Keyboard shortcuts now live in *three* places — and they disagree

- Source of truth candidate: `src/shortcuts/registry.ts` (declarative list used by the `?` help overlay).
- Actual handlers: `GlyphEditorView.tsx:127-180` (tool keys, view toggles, brush size, undo/redo), `PixelCanvas.tsx:629-663` (space, escape, delete/backspace), `useShortcutHelp.ts` (`?` / `Shift+/` / Escape).
- Footer hint text: `AppShell.tsx:65-69` builds its own string.

The registry does not include `[`, `]` for brush-size stepping even though `GlyphEditorView` handles them. The registry's `nav.duplicateTab` says `Alt+drag`, but the canvas handler actually checks `e.altKey` during tab drag (same thing, but the registry's label is display-only). Delete/Backspace is listed only as `Delete` — the handler accepts both.

None of these is a bug per se, but the help modal is already drifting from ground truth.

**Action:** extend the registry to include `[`, `]` and a Backspace synonym; ideally, have the handlers look up the registry entry rather than inlining the key check. A small `useShortcut(id, handler)` hook would keep everything in sync and make it trivial to add remapping later.

### H7. Pixel history is clamped to 14 entries client-side, but zundo's `limit` is 15

Minor — but the hard-coded `slice(-(14))` in `pushHistory` (see H2) means that after the manual snapshot, we prepend to a ≤14-length array, yielding ≤15. If a future action path calls `pushHistory` twice without zundo resuming in between, we can still exceed `limit` momentarily because we're bypassing zundo's own length enforcement. No known path does this today, but worth a guard.

---

## Architecture / migration observations

### A1. Dead dependencies: `pixi.js`, `path-data-parser`, `svg-arc-to-cubic-bezier`

Yesterday flagged `pixi.js` (still dead). Two additional dependencies appear to be dead today:

- `path-data-parser`: listed in `package.json`, zero imports under `src/`.
- `svg-arc-to-cubic-bezier`: listed in `package.json`, zero imports under `src/`.

Also on the watchlist but **not yet dead**: `poly-decomp` is still imported by `PhysicsPanels.tsx` for `Matter.Common.setDecomp(decomp)` and is required for the concave SVG → vertex decomposition path.

**Action:** `npm uninstall pixi.js path-data-parser svg-arc-to-cubic-bezier`. Rerun `vite build` and confirm bundle size drops.

### A2. `canvasStore` and `fontStore` both exist and both use `zundo` — clarify ownership

The compat shim (`stores/canvasCompat.ts`) paints over the fact that two orthogonal undo histories now exist. `canvasStore.partialize` persists `canvases` + `canvasOrder`. `fontStore.partialize` persists `glyphs` + `kernPairs`. Today, only `canvases` is actually being edited, but `glyphs` still exists (24x32 Basic Latin seeded at startup) and is what Preview/Export reads via the compat hook — which in turn reads `canvases`. So Preview and Export indirectly go `canvases → compat → (synthetic) glyphs → compiler`. The in-memory `glyphs` that `fontStore` maintains is effectively unused at runtime.

**Action:** either delete the `glyphs` field from `fontStore` (the shim already builds what the compiler needs) or stop building it at startup (lazy-init only). This removes a large stealth allocation (≈26 × 24 × 32 bools) and eliminates the confusing duplicate state.

### A3. The `WorkspaceView`/`GlyphEditorView` aliasing

`GlyphEditorView.tsx:377` exports `WorkspaceView` under the old `GlyphEditorView` name for router compatibility:

```ts
export { WorkspaceView as GlyphEditorView };
```

The router still imports `GlyphEditorView` and mounts it at `/project/:id/edit`. This is the right bridge while Stage 5 is incomplete, but the file still lives under `components/editor/` and the class name is `WorkspaceView`. Either rename the file to `WorkspaceView.tsx` or keep the `GlyphEditorView` name. Right now the filename, export name, and router path disagree.

### A4. Tool palette state is now a mix of global and per-canvas

`editorStore.activeTool` / `brushSize` are global. Per-canvas: `pixelShape`, `pixelDensity`, `mirrorMode`, `onionSkinEnabled/Font/Size`. But the editor view applies onion-skin changes "universally to all canvases" (`GlyphEditorView.tsx:80-104`) by iterating `canvasOrder` and calling the per-canvas setter for each — so onion-skin is de-facto global but stored per-canvas, with each per-canvas copy kept in sync by the panel handler. If any other code path (duplicate canvas, create canvas inheriting from source) changes the per-canvas copy out-of-band, they will drift. `createCanvas` in `canvasStore.ts:91-109` and `duplicateCanvasFrame` in `types/canvas.ts:94-113` both copy these three fields from a source canvas, which is the intended behavior — but note that a user "turn off onion for this canvas only" is impossible today.

**Action:** decide whether onion-skin is per-canvas or global, and pick one. If global, move it to `editorStore`. If per-canvas, drop the "apply to all canvases" loop and let each canvas diverge. The current half-and-half is fragile.

---

## Medium-priority findings

### M1. Gravity is now off — physics panels are floating, not falling

`PhysicsPanels.tsx:388-391` now reads `gravity: { x: 0, y: 0, scale: 0 }`. This is fine if intentional (the SESSION notes + commit message "drag fixes for trackpad + drawer collision entry" suggest it was a deliberate response to undesired post-drag drift), but three side effects:

- The soft-rest detector (`anyMoving`, 60-frame auto-pause) is now rarely triggered by real-world motion — panels only move when the user drags them. Since `dragRef.current` gates pausing when a drag is in flight, the loop will sleep between drags. That's actually fine, but worth confirming the auto-pause is hit quickly enough that the 60 fps `setInterval` doesn't keep the CPU busy.
- The "bounce off the floor" behaviour that the restitution/friction walls were tuned for is now vestigial — floor friction of `0.8` on a gravity-less world does nothing.
- Matter's built-in `Engine.update` still does constraint solving and narrow-phase collision at 60 Hz per panel, even with no forces. That's OK cost-wise but means "zero gravity" doesn't imply "zero per-tick cost."

**Action:** confirm the intent in a comment beside the engine init (so the next reader doesn't "fix" it back), and either drop the floor-friction wall tuning or keep the values and note why.

### M2. Trackpad drag fix references `lastPointerRef` that is declared later in the file

`PhysicsPanels.tsx:701` reads/writes `lastPointerRef.current` from inside the pointer-move effect. But `const lastPointerRef = useRef(...)` is declared at line 724 — *after* the effect that uses it. JavaScript's temporal dead zone makes this work only because the effect body runs after the function returns (by which time the hook has initialized the ref). It's not a bug, but it's surprising when reading top-to-bottom.

**Action:** move the `useRef` up with the other refs at the top of `PhysicsPanelsInner` (lines 363-372).

### M3. `handleDragStart`'s e.buttons guard ignores stylus / pen pointers

`PhysicsPanels.tsx:650-654`:

```ts
if (e.button !== 0) return;
if (e.buttons !== undefined && e.buttons !== 1) return;
```

This is the right fix for the trackpad "force-touch hover triggers pointerdown" problem, but for a stylus, `e.buttons` can be `1` (pen tip), `2` (barrel), `4` (eraser) — so pen input works, but a right-click equivalent on stylus (`buttons === 2`) is rejected. Given the panel-drag is left-click only, this is probably the intent — worth a comment.

### M4. `PixelCanvas` now owns complex interaction state with no clear ownership doc

The component now manages:

- Drawing state (`drawingRef`, `drawValueRef`, `drawCanvasIdRef`, `lastCellRef`, `lineStartRef`, `rectStartRef`)
- Hover state (`hoverCellRef`, `hoverCanvasIdRef`)
- Viewport pan (`isPanningRef`, `panStartRef`, `spaceHeldRef`)
- Canvas drag / duplicate (`draggingCanvasRef` with 7 sub-fields)
- History helpers (`pushHistory`, `commitHistory`)
- Rendering (rafRef, frameBoundsRef)
- Keyboard (space, escape, delete)
- Wheel (zoom-to-cursor)

At 1,140 lines, this is now the largest file in the project. The logic is clean but there are too many refs in one scope for a reader to hold in their head. An obvious seam: **interaction handlers** (pointer/keyboard/wheel) could move to a `useCanvasInteraction()` hook returning the `handlePointer{Down,Move,Up,Cancel}` set. The rendering path (`draw`, `drawFrame`, `scheduleRedraw`, resize observer) can stay in the component.

### M5. Tab/plus-button rendering is entirely canvas-drawn, not DOM — zero accessibility

Canvas-frame tabs and the four "+" buttons for creating sibling canvases are rendered in the `<canvas>` element via `ctx.fillRect` / `ctx.arc`. They have no DOM presence, so screen readers, keyboard navigation, and automated tests see nothing. The keyboard shortcut registry has nothing for "create sibling canvas" or "focus next tab" either.

**Action:** either (a) render tabs as DOM overlays (absolutely positioned on top of the canvas) for a11y + keyboard navigation, or (b) add a hidden, focusable DOM equivalent per canvas for assistive tech. The `<canvas aria-label="Glyph workspace" tabIndex=0>` is a start but there are no `aria-describedby` or live-region announcements for tab operations.

### M6. `compileFont` still has no error handling and now has an extra call path

Same as yesterday's finding #4. The new wrinkle: `useCompatGlyphs` in `canvasCompat.ts` builds a glyph dict on every render (it is wrapped in `useMemo` keyed on `canvases` + `canvasOrder`, but any pixel edit bumps `canvases`, forcing a full rebuild). `PreviewView` and `ExportView` both call this. Each render then calls `generatePreviewUrl` (Preview) or stands ready to call `downloadFont` (Export). If `opentype.js` throws on a malformed glyph, Preview silently goes blank and Export silently produces nothing.

**Action:** still #4 from yesterday. Additionally, consider memoizing `useCompatGlyphs` more aggressively (only rebuild glyphs whose pixels/letter actually changed) — the current `useMemo` rebuilds every glyph on every canvas change.

### M7. `idb` is now only used for 32 lines of panel-visibility persistence

`drawerStore.ts` is still the only `idb` consumer. With `canvasStore` now the main data owner and explicitly *not* persisted, `idb` is overkill for what amounts to a tiny `{ storedPanelIds: string[] }` blob. Use `localStorage` (synchronous, simpler, no async deserialization) until there is actual font data to persist — or commit to IndexedDB for fonts/projects and finally answer yesterday's #8.

---

## Low-priority / housekeeping (new or recurring)

### L1. Root still has 10 `tmp_*` files + 5 `figma_code_*.js` + a new `crumpled-paper-*.jpg`

Recurring from 2026-04-17 (item #6). Now with a new ~25 KB JPEG added today that also isn't referenced from anywhere under `src/` (searched imports, CSS `url()`, and `public/`). If this is a CSS background intended for the app, it should live under `public/` and be referenced by URL; otherwise it's working-copy clutter.

### L2. `TypeScript ~6.0.2` and `react-router 7.14.1`

The `package.json` pins `typescript: ~6.0.2` and `react-router: ^7.14.1`. Worth confirming these are intentional and current (per `SESSION.md`, OpenType.js was pinned to `^1.3.4` deliberately for Windows reasons — do we want a similar note for any other pin?).

### L3. `DashboardView` still creates a project inline

Unchanged from 2026-04-17 (item #13). Refreshing the page resets work-in-progress. This interacts with #A2 and #M7 — persistence decisions should be made together.

### L4. No newline-separation review for large CSS diff

`src/index.css` grew +1,109/−??? lines today (diff stat). I did not review it line-by-line. Worth a spot-check for duplicated selectors / `!important` overrides / unused classes now that the panel shapes (canvas, onion, dumbbell, pill, pencil, snowman, banner, pen, ticket) all have per-shape class names.

### L5. `crypto.randomUUID()` assumptions

`canvasStore.ts:72-77` falls back to `Date.now()+Math.random()` if `crypto.randomUUID` is missing. `fontStore` (via `types/font.ts:createDefaultProject`) calls `crypto.randomUUID()` directly, no fallback. Not a real issue on modern browsers (both Chromium and Safari have had it for years in secure contexts), but a Node-based test environment (which #3 from yesterday will introduce) will need either a polyfill or an upgrade to Node ≥19.

### L6. `RadialBrushSelector` has `aria-pressed`/`aria-keyshortcuts` — the other selectors don't

Positive: `RadialBrushSelector.tsx:174-176` did the a11y work. Negative: `RadialShapeSelector` and `RadialMirrorSelector` use the same `useClickSound` pattern but do not have the matching aria attributes. The a11y pass should extend to them.

---

## Things I verified are *not* issues

Same clean-bill sections as yesterday, re-verified against today's tree:

- **Console logs:** only `ErrorBoundary.tsx:21` has `console.error`. Appropriate.
- **`TODO` / `FIXME` / `HACK` / `XXX` comments:** two `TODO(Stage 5)` in `DashboardView.tsx` (intentional migration markers) and one `// TODO` elsewhere — nothing concerning.
- **`any`, `@ts-ignore`, `@ts-expect-error`, `as any`:** none. `tsconfig.app.json` still has `noUnusedLocals` and `noUnusedParameters: true` — see H3/H4 which might be violations once the next build runs.
- **`dangerouslySetInnerHTML`, `eval`, `new Function`:** none.
- **Unbounded timers / leaked listeners:** every `setInterval`, `setTimeout`, `addEventListener`, and `ResizeObserver` traced has a matching cleanup. The new window-level `pointermove`/`pointerup`/`pointercancel` pair in `PhysicsPanels.tsx:697-719` correctly cleans up on effect re-run.
- **Blob URLs:** `URL.revokeObjectURL` called in both `compiler.ts:115` and `PreviewView.tsx:38,46` on replace + unmount.
- **Bounds checking:** `canvasStore.setPixels`, `fillRect`, `resizeCanvas`, and `assignLetter` all validate inputs; `clamp` applied on density (`Math.max(0.15, Math.min(1, density))`) and onion size (`Math.max(0.3, Math.min(2, size))`).
- **Circular dependencies:** none detected across `stores/ ← engine/ ← components/`.
- **Malware indicators:** none. No obfuscated strings, no exfil endpoints (only http(s) references under `src/` are zero — all of `fetch`/`XMLHttpRequest`/`atob`/`btoa`/`new Function` are absent), no suspicious bundler/`postinstall` hooks in `package.json`, no shell-outs. `figma_code_*.js` at the root contain base64 payloads but they are not imported by any code path and appear to be design-tool exports (same conclusion as yesterday). I did not execute them.

---

## Positive notes from today's changes

- **`?` shortcut help overlay is well-built.** The registry/handler/overlay split in `src/shortcuts/` + `useShortcutHelp` + `ShortcutHelpOverlay` is clean, and `Esc` closes and the shortcut label formatter (`formatKey`) correctly mac-izes modifiers. The `aria-live="polite"` region in `AppShell.tsx:74` announcing tool changes is a nice accessibility touch that yesterday's review specifically asked for.
- **History handling in `PixelCanvas`** uses pause/push/resume around each stroke, so an entire drag becomes one undo step. The manual snapshot pattern (H2) is reasonable despite the coupling concerns.
- **The compat layer (`canvasCompat.ts`) is honest.** It's clearly documented as a migration shim, not a new permanent API. That's the right framing for Stage 5.
- **Window-level pointer listeners in `PhysicsPanels`** (lines 697-719) correctly address a real trackpad bug class — pointer capture being lost on element re-render. Good fix, good comment.

---

## Suggested action list (ranked for today)

Carry-over items still open (1-8) plus new items (9-15).

1. `npm uninstall pixi.js path-data-parser svg-arc-to-cubic-bezier`. Verify bundle drop.
2. Extract `usePhysicsEngine` hook; share between `PhysicsPanels` and `ToolDrawer`; delete the three `eslint-disable-next-line react-hooks/exhaustive-deps` in `PhysicsPanels.tsx`.
3. Add Vitest + React Testing Library. First tests against `canvasStore` (flood fill, `setPixels`, `resizeCanvas`, `assignLetter` uniqueness), `engine/shapes`, and `engine/font/compiler`.
4. Add user-visible error feedback to `downloadFont` and `generatePreviewUrl` (inline error state or toast).
5. Add `modifiedAt` to `fontStore.setAdvanceWidth`.
6. Move `figma_code_*.js` out of root; delete `tmp_*.png`/`.b64` and the new `crumpled-paper-*.jpg` (or relocate to `public/`); add `tmp_*` and `*.b64` to `.gitignore`.
7. Extend the a11y pass to `RadialShapeSelector`, `RadialMirrorSelector`, `DensitySlider` (visible labels today are `aria-hidden`), and the onion toggle buttons. Also add `aria-label` to each floating panel wrapper.
8. Commit to one persistence story (IndexedDB via `idb` for `canvasStore`, or drop `idb` and use `localStorage` for `drawerStore` only).
9. **(New)** Decide undo-ownership across `canvasStore` + `fontStore` (H1) before wiring Spacing / Kerning views to Cmd-Z. Suggest consolidating into `canvasStore` and deleting the `glyphs` field from `fontStore` (A2).
10. **(New)** Clean up `PixelCanvas`: remove unused `screenToWorld` (H4), remove unused `frame` parameter from `getCellSize` (or actually use it) (H3), extract the interaction handlers into a `useCanvasInteraction()` hook (M4).
11. **(New)** Delete `src/hooks/useSeedTestGlyphs.ts` (dead code) (H5).
12. **(New)** Unify shortcut handling: have `GlyphEditorView`/`PixelCanvas`/`useShortcutHelp` read from `shortcuts/registry.ts` (H6). Add `[`, `]`, `Backspace`, and any canvas-tab shortcuts to the registry.
13. **(New)** Clarify the "universal vs per-canvas" story for onion skin (A4). Either move it to `editorStore` or actually let canvases diverge.
14. **(New)** Wrap the `zundo` internal-state access in `PixelCanvas.pushHistory` in a helper; drive the `slice(-(14))` bound off the same constant as `limit` (H2/H7).
15. **(New)** Decide whether `WorkspaceView` should own the filename or keep the `GlyphEditorView` route name (A3); pick one.

---

## Diff from previous review

The previous ultrareview's baseline stats:

|                     | 2026-04-17 | 2026-04-18 | Δ         |
| ------------------- | ---------- | ---------- | --------- |
| `PixelCanvas.tsx`   | 530 lines  | 1,140      | +610      |
| `PhysicsPanels.tsx` | 1,093      | 1,116      | +23       |
| `ToolDrawer.tsx`    | 605        | 619        | +14       |
| `GlyphEditorView.tsx` | 300      | 377        | +77       |
| `stores/`           | 3 files, 276 lines | 5 files, 673 lines | +397, +2 files |
| `shortcuts/`        | —          | 1 file, 51 lines | new |
| `hooks/`            | 1 file, 90 lines | 3 files, 164 lines | +74, +2 files |
| `tests/`            | 0          | 0          | 0 (still) |
| Dependencies listed | 13 runtime | 13 runtime | 0 (pixi still in, 2 more now dead) |
| `aria-label` count  | ≈1         | 5          | +4        |
| Open items from yesterday | 8    | 8          | 0 (all carry over) |

All eight yesterday items are carried forward. Seven new high-priority items (H1–H7) opened today, dominated by migration debt between `canvasStore` and `fontStore` and the rapid growth of `PixelCanvas`. Grade slipped from B+ to B, entirely because of accumulating debt, not new defects.

---

*Generated autonomously by the `daily-review` scheduled task. No code was modified; this is a read-only review.*
