import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from './canvasStore';
import { useEditorStore } from './editorStore';
import { getDefaultProjectSnapshot } from './defaultProject';
import type { CanvasFrame, WorkspaceViewport } from '../types/canvas';
import type { EditorTool } from '../types/editor';

/**
 * Per-project persistence. The workspace state (canvases, viewport, tool
 * settings) is saved to localStorage under a per-project key so refreshing
 * resumes exactly where the user left off. Undo history is intentionally
 * NOT persisted.
 *
 * Versioned payload. If the shape doesn't match (old schema, corrupted
 * JSON, etc.) we silently discard and start fresh.
 */

const STORAGE_VERSION = 1;
const DEBOUNCE_MS = 300;

function storageKey(projectId: string): string {
  return `glyph-studio:project:${projectId}:v${STORAGE_VERSION}`;
}

interface PersistedPayload {
  version: number;
  canvas: {
    canvases: Record<string, CanvasFrame>;
    canvasOrder: string[];
    selectedCanvasId: string | null;
    lastSelectedCanvasId: string | null;
    viewport: WorkspaceViewport;
  };
  editor: {
    activeTool: EditorTool;
    showGrid: boolean;
    showMetrics: boolean;
    brushSize: number;
  };
}

/** Minimal structural validation — bail on anything suspicious. */
function isValidPayload(p: unknown): p is PersistedPayload {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  if (obj.version !== STORAGE_VERSION) return false;
  const canvas = obj.canvas as Record<string, unknown> | undefined;
  const editor = obj.editor as Record<string, unknown> | undefined;
  if (!canvas || !editor) return false;
  if (
    typeof canvas.canvases !== 'object' ||
    !Array.isArray(canvas.canvasOrder) ||
    typeof canvas.viewport !== 'object'
  ) {
    return false;
  }
  if (
    typeof editor.activeTool !== 'string' ||
    typeof editor.showGrid !== 'boolean' ||
    typeof editor.showMetrics !== 'boolean' ||
    typeof editor.brushSize !== 'number'
  ) {
    return false;
  }
  return true;
}

function readFromStorage(projectId: string): PersistedPayload | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToStorage(projectId: string, payload: PersistedPayload): void {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(payload));
  } catch {
    // Quota exceeded / private-mode / etc. — silent no-op.
  }
}

function snapshotPayload(): PersistedPayload {
  const c = useCanvasStore.getState();
  const e = useEditorStore.getState();
  return {
    version: STORAGE_VERSION,
    canvas: {
      canvases: c.canvases,
      canvasOrder: c.canvasOrder,
      selectedCanvasId: c.selectedCanvasId,
      lastSelectedCanvasId: c.lastSelectedCanvasId,
      viewport: c.viewport,
    },
    editor: {
      activeTool: e.activeTool,
      showGrid: e.showGrid,
      showMetrics: e.showMetrics,
      brushSize: e.brushSize,
    },
  };
}

/**
 * Hydrate stores from localStorage on mount, then subscribe to further
 * changes and debounce-write back. Returns `hydrated` so callers can
 * defer UI that depends on the resumed state.
 *
 * When `projectId` changes, the previous project's subscription is torn
 * down and the new project is loaded fresh.
 */
export function useProjectPersistence(projectId: string | undefined): {
  hydrated: boolean;
} {
  const [hydrated, setHydrated] = useState(false);
  // Track which project we've hydrated for — if it changes, we rehydrate.
  const hydratedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setHydrated(false);
      hydratedForRef.current = null;
      return;
    }
    setHydrated(false);

    // ── Hydrate ────────────────────────────────────────────────────
    const saved = readFromStorage(projectId);
    if (saved) {
      // Legacy hydration: older saves predate the per-canvas `muted` field.
      // Default missing values to `false` so playback behaves the same as
      // before the mute tool was added.
      const hydratedCanvases: typeof saved.canvas.canvases = {};
      for (const [id, c] of Object.entries(saved.canvas.canvases)) {
        // Only include `muted` in the spread if the source omits it, so a
        // legacy save (where `muted` is literally absent) gets `false`, and
        // a modern save's `true` is preserved.
        hydratedCanvases[id] = { ...c, muted: c.muted ?? false };
      }
      useCanvasStore.setState({
        canvases: hydratedCanvases,
        canvasOrder: saved.canvas.canvasOrder,
        selectedCanvasId: saved.canvas.selectedCanvasId,
        lastSelectedCanvasId: saved.canvas.lastSelectedCanvasId,
        viewport: saved.canvas.viewport,
      });
      useEditorStore.setState({
        activeTool: saved.editor.activeTool,
        showGrid: saved.editor.showGrid,
        showMetrics: saved.editor.showMetrics,
        brushSize: saved.editor.brushSize,
      });
    } else {
      // No saved data for this project — preload the default snapshot so
      // new users see crafted content instead of an empty workspace.
      const defaults = getDefaultProjectSnapshot();
      useCanvasStore.setState({
        canvases: defaults.canvases,
        canvasOrder: defaults.canvasOrder,
        selectedCanvasId: null,
        lastSelectedCanvasId: defaults.canvasOrder[0] ?? null,
        viewport: defaults.viewport,
      });
    }
    // Undo history is not persisted — clear it so the hydration itself
    // can't be undone back to an empty workspace.
    useCanvasStore.temporal.getState().clear();

    hydratedForRef.current = projectId;
    setHydrated(true);

    // ── Subscribe + debounced write ────────────────────────────────
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Guard against a late fire after project switch.
        if (hydratedForRef.current !== projectId) return;
        writeToStorage(projectId, snapshotPayload());
      }, DEBOUNCE_MS);
    };

    const unsubCanvas = useCanvasStore.subscribe(schedule);
    const unsubEditor = useEditorStore.subscribe(schedule);

    return () => {
      unsubCanvas();
      unsubEditor();
      if (timer) {
        clearTimeout(timer);
        // Flush one final write so any pending changes land before unmount.
        if (hydratedForRef.current === projectId) {
          writeToStorage(projectId, snapshotPayload());
        }
      }
    };
  }, [projectId]);

  return { hydrated };
}
