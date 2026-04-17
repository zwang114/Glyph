# Glyph Studio — Ultrareview

**Date:** 2026-04-17 (Friday)
**Scope:** Full repository at `/mnt/Claude/glyph-studio`
**Run mode:** Automated (daily-review scheduled task)
**Reviewer:** Claude (autonomous)

---

## Top-line verdict

Healthy, well-organized React 19 + TypeScript codebase. No critical defects, no security red flags, no malware indicators. Architecture is clean: three small Zustand stores, a canvas engine, a physics-panel engine, and a fairly clean component tree. Type discipline is high — no `any`, `@ts-ignore`, or `@ts-expect-error` anywhere. Main drag on the project is (a) a ~200 KB dead dependency (`pixi.js`), (b) two very large files that duplicate Matter.js setup (`PhysicsPanels.tsx`, `ToolDrawer.tsx`), and (c) zero tests.

Overall grade: **B+ (85/100)**. Production-ready with the high-priority fixes below.

---

## What I looked at

Source tree under `src/`, config files (`vite.config.ts`, `tsconfig.*.json`, `eslint.config.js`), `package.json`, session notes (`SESSION.md`), and root-level artifacts (`figma_code_*.js`, `tmp_*.png`, `tmp_*.b64`). Skipped `node_modules/` and `dist/`.

Key stats:

- `src/components/shared/PhysicsPanels.tsx` — 1,093 lines
- `src/components/shared/ToolDrawer.tsx` — 605 lines
- `src/canvas/PixelCanvas.tsx` — 530 lines
- `src/components/editor/GlyphEditorView.tsx` — 300 lines
- `src/engine/shapes.ts` — 256 lines
- `src/stores/fontStore.ts` — 222 lines
- `src/engine/font/compiler.ts` — 135 lines

---

## High-priority findings

### 1. `pixi.js` is installed but never imported

`package.json` lists `"pixi.js": "^8.18.1"`. A full-tree grep finds zero imports anywhere in `src/`. The SESSION.md explicitly states "HTML Canvas 2D (not PixiJS — simpler for pixel grids)". This is ~200 KB of dead weight in `node_modules` / lockfile.

**Action:** `npm uninstall pixi.js`.

### 2. Two `eslint-disable-next-line react-hooks/exhaustive-deps` with fake string-join deps

In `src/components/shared/PhysicsPanels.tsx`:

- Line ~577 — uses `panels.map((p) => p.id).join(',')` as a stand-in dependency
- Line ~603 — uses `panels.map((p) => \`${p.id}:${p.width}x${p.height}\`).join('|')` similarly

These allocate on every render and still don't correctly express the dependency graph. A third disable at line 532 (physics engine init, empty deps) is fine — it's an IIFE that should run once.

**Action:** refactor to a proper dep array or `useMemo`-derived dep tokens. Ideally extract the physics engine into a `usePhysicsEngine` hook so `PhysicsPanels` and `ToolDrawer` stop duplicating the logic.

### 3. No test coverage at all

No `*.test.ts(x)`, no `__tests__`, no test runner in `package.json`.

**Action:** add Vitest (native to Vite) + React Testing Library. Highest-value targets:

- `fontStore.ts` — `setPixel`, `setPixels`, `fillRect`, `resizeGlyph` (pure logic, easy to test)
- `engine/shapes.ts` — `shapeToPathCommands` for each shape type
- `engine/font/compiler.ts` — `glyphToPath`, `compileFont` round-trip (decode output with `opentype.js` and assert glyph count, advance widths)

### 4. Error handling gaps around user-facing failures

Silent-fail spots where a toast/notification would be much better UX:

- `src/engine/font/compiler.ts` — `downloadFont()` and `generatePreviewUrl()` have no `try/catch`. If `font.toArrayBuffer()` throws (malformed path, opentype.js edge case), the download just doesn't happen with no feedback.
- `src/components/preview/PreviewView.tsx:~31` — `generatePreviewUrl()` is in a `try/catch` but the `catch` branch is silent; the user sees a blank preview with no indication why.
- `src/components/shared/PhysicsPanels.tsx:~78` — `Matter.Bodies.fromVertices` falls back to a rounded rect without logging, so a broken custom SVG path would silently lose the intended physics body shape. Acceptable for prod but worth a `console.warn` in dev.

### 5. `setAdvanceWidth` forgets to bump `modifiedAt`

In `src/stores/fontStore.ts`, every other glyph mutation (`setPixel`, `setPixels`, `fillRect`, `resizeGlyph`, etc.) updates `modifiedAt`. `setAdvanceWidth` does not. If `modifiedAt` is ever used for persistence / sync / dirty tracking, advance-width edits will be invisible.

---

## Medium-priority findings

### 6. Physics loop runs at a fixed 60 fps regardless of visibility

Both `PhysicsPanels.tsx:~524` and `ToolDrawer.tsx` drive physics via `setInterval(step, 1000/60)`. SESSION.md justifies this — `requestAnimationFrame` is throttled to zero inside the Claude Preview headless browser. In a real browser this is fine, but the loop runs even when the editor route is not visible, panels are pinned, or the tab is backgrounded.

**Suggestion:** in real-browser mode, prefer `requestAnimationFrame` guarded by a `document.visibilityState === 'visible'` check, with a `setInterval` fallback behind a preview-environment detection flag. Also the existing auto-pause after 60 rest frames is good — make sure both the panels and the drawer honor it consistently.

### 7. Large components duplicating physics setup

`PhysicsPanels.tsx` (1,093 lines) and `ToolDrawer.tsx` (605 lines) both set up a Matter.js engine, walls, a render loop, a pointer-drag pipeline, and a body map. Much of this is copy-paste.

**Suggestion:** extract a `usePhysicsEngine({ container, walls, onStep, enabled })` hook. This alone would probably cut ~400 lines and make both files easier to reason about.

### 8. Accessibility is thin

Functional but minimal:

- Floating panels have no `role` / `aria-label` / `aria-describedby`.
- Radial selectors and icon buttons generally lack `aria-label` or `title`.
- Keyboard shortcuts (`B`, `L`, `R`, `F`, `E`, `Ctrl+Z`, `Ctrl+Shift+Z`, scroll-to-zoom, Alt-drag to pan) are only surfaced in the footer hint — no in-app help panel.
- The drawing canvas is inherently mouse-driven; that's OK, but adding a textual description and focus handling would help screen-reader users navigate the rest of the UI.

### 9. `PixelCanvas` reads stores with `getState()` inside pointer handlers

`src/canvas/PixelCanvas.tsx` calls `useFontStore.getState()` and `useEditorStore.getState()` directly inside `handlePointerDown` / `handlePointerMove`. This is a deliberate perf choice (avoids per-pointermove re-renders), and it is cleaned up properly, but it couples the canvas tightly to store internals. Worth a short comment explaining the intent so a future reader doesn't "fix" it by switching to hook subscriptions.

Also: `useFontStore.temporal.getState().pause()` at `PixelCanvas.tsx:~394` reaches into `zundo`'s undocumented-feeling API. Pin the `zundo` version or wrap this in a helper so the coupling is visible in one place.

---

## Low-priority / housekeeping

### 10. Ephemeral files at repo root

Ten `tmp_*.png` / `tmp_*.b64` screenshot pairs sit at the project root (~700 KB total). They look like preview-tool captures, not referenced by the app or tests.

**Action:** delete, and add `tmp_*` to `.gitignore`.

### 11. `figma_code_*.js` at the project root

Five files (57–114 KB each) — `figma_code_dashboard.js`, `figma_code_editor.js`, `figma_code_export.js`, `figma_code_overview.js`, `figma_code_preview.js`. They begin with `const b64 = '...'` (base64 payloads), appear to be Figma Code Connect / design-export snippets, and are not imported anywhere. Not malicious, but they're clutter at the root.

**Suggestion:** move into a `design/figma-exports/` folder (or delete if the design tool re-exports on demand).

### 12. `idb` is installed and imported but only stores panel visibility

`drawerStore.ts` uses `idb` via a `persist` middleware, but only to remember which panels are "in the drawer." If there's no plan to persist actual font data to IndexedDB, this is overkill — `localStorage` directly would be fine. If there **is** a plan, then this is the logical hook to extend `fontStore` persistence into.

### 13. `DashboardView` creates a project inline

The dashboard hard-codes a default project on every mount; refreshing the page resets work-in-progress. Combined with #12, this is the biggest UX-quality item once testing and dep cleanup are done: decide whether projects live in IndexedDB or are purely in-memory, then stick to it.

### 14. Matter.js at `0.20.0`

Caret range is fine, but note Matter.js is effectively 1.x-stable despite the version number. Not an action item — just don't be alarmed by the "pre-1.0" number.

### 15. OpenType.js pinned at `^1.3.4`

SESSION.md explicitly calls this out as pinned for Windows font-validation reasons. Worth restating in the `package.json` via a comment-adjacent field or a `README` note so the next contributor doesn't blindly `npm update`.

---

## Things I verified are *not* issues

To save time on future reviews, these common smells came up clean today:

- **Console logs:** only `ErrorBoundary.tsx:21` has a `console.error`, which is appropriate.
- **`TODO` / `FIXME` / `HACK` / `XXX` comments:** none.
- **`any`, `@ts-ignore`, `@ts-expect-error`:** none. `tsconfig.app.json` has `noUnusedLocals` and `noUnusedParameters` on.
- **`dangerouslySetInnerHTML`, `eval`, `new Function`:** none.
- **Unbounded timers / leaked listeners:** every `setInterval`, `setTimeout`, `addEventListener`, and `ResizeObserver` I traced has a matching cleanup.
- **Blob URLs:** `URL.revokeObjectURL` is called in both `compiler.ts` (after download) and `PreviewView.tsx` (when replacing the preview URL and on unmount).
- **Bounds checking:** `fontStore.setPixel`, `setPixels`, `fillRect`, and `resizeGlyph` all validate coords; `PixelCanvas.screenToCell` does too.
- **Circular dependencies:** none detected across stores/engine/components.
- **Malware indicators:** none. No obfuscation, no exfil endpoints, no suspicious `fetch` targets, no shell-outs.

---

## Suggested action list (copy/paste into an issue tracker)

1. `npm uninstall pixi.js`. Verify bundle with `vite build` before/after.
2. Extract a `usePhysicsEngine` hook; refactor `PhysicsPanels.tsx` and `ToolDrawer.tsx` to use it. Remove the two fake-dep `eslint-disable` lines as part of this.
3. Add Vitest + React Testing Library; write first tests against `fontStore`, `engine/shapes`, and `engine/font/compiler`.
4. Wrap `downloadFont` / `generatePreviewUrl` call sites with user-visible error feedback (toast or inline error state).
5. Add `modifiedAt` update to `fontStore.setAdvanceWidth`.
6. Move `figma_code_*.js` into `design/figma-exports/`; delete `tmp_*.png` / `tmp_*.b64`; add `tmp_*` to `.gitignore`.
7. Pass an `aria-label` to each floating panel and to icon-only buttons; add a `?`-triggered shortcuts modal.
8. Decide: does font state persist to IndexedDB (extend `idb` usage) or stay in memory only (drop `idb` or simplify to `localStorage`)?

---

## Diff from previous review

No previous `reviews/ultrareview-*.md` file present — this is the first run of the automated daily review. Subsequent runs will diff against this baseline.

---

*Generated autonomously by the `daily-review` scheduled task. No code was modified; this is a read-only review.*
