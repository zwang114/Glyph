# Glyph Studio

A web-based **pixel font editor** — draw letterforms on a pixel grid, hear them play as music, and export real OTF fonts. Pixel-based (not bezier-based), with a playful, experimental UI built around physics-driven floating control panels.

## Run

```bash
npm install
npm run dev
# http://localhost:5173
```

## Stack

React 19 + Vite + TypeScript · Canvas 2D · Zustand + zundo (undo/redo) · matter-js (floating panels) · opentype.js 1.3.4 (pinned — do not upgrade) · Web Audio

## Docs

See [SESSION.md](./SESSION.md) for the full project handoff: feature state, critical files, design decisions, and known gotchas.
