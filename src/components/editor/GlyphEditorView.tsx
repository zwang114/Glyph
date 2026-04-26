import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import { PixelCanvas } from '../../canvas/PixelCanvas';
import { useEditorStore } from '../../stores/editorStore';
import { useAudioStore } from '../../stores/audioStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { useDrawerStore } from '../../stores/drawerStore';
import { useProjectPersistence } from '../../stores/projectPersistence';
import { PhysicsPanels } from '../shared/PhysicsPanels';
import type { PhysicsPanelsHandle } from '../shared/PhysicsPanels';
import { ToolDrawer } from '../shared/ToolDrawer';
import { PencilToolButtons } from '../shared/PencilToolButtons';
import { RadialShapeSelector } from '../shared/RadialShapeSelector';
import { DensitySlider } from '../shared/DensitySlider';
import { RadialMirrorSelector } from '../shared/RadialMirrorSelector';
import { CharacterInput } from '../shared/CharacterInput';
import { MuteCanvasControl } from '../shared/MuteCanvasControl';
import { BPMControl } from '../shared/BPMControl';
import type { EditorTool, MirrorMode, PixelShape } from '../../types/editor';

/**
 * Workspace editor view.
 *
 * Tool panels bind to the SELECTED canvas. If nothing is selected, panels
 * display the LAST selected canvas's values (so the UI doesn't blank out),
 * but writes become no-ops until a canvas is re-selected.
 */
export function WorkspaceView() {
  const { id: projectId } = useParams();
  // Load saved workspace on mount, debounce-write on every change.
  // `hydrated` gates the first render so we don't flash an empty state
  // on refresh.
  const { hydrated } = useProjectPersistence(projectId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1200, h: 800 });

  // ── Global editor state (tool choice, view toggles) ─────────────────
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const toggleMetrics = useEditorStore((s) => s.toggleMetrics);
  // Forest tone / sound profile is driven by whether the connector mushroom
  // is snapped onto the pixel-shape panel. When the user plugs the mushroom
  // in → forest tones; pull it out → default tones. We read the toggle action
  // here; the current profile is read inline (via getState) inside the snap
  // callback so this component doesn't re-render on every profile flip.
  const toggleSoundProfile = useAudioStore((s) => s.toggleSoundProfile);
  const setProfileById = useAudioStore((s) => s.setProfileById);

  // ── Canvas state (selection + per-canvas properties) ────────────────
  const selectedCanvasId = useCanvasStore((s) => s.selectedCanvasId);
  const lastSelectedCanvasId = useCanvasStore((s) => s.lastSelectedCanvasId);
  const targetId = selectedCanvasId ?? lastSelectedCanvasId;
  const target = useCanvasStore((s) => (targetId ? s.canvases[targetId] : null));

  const setPixelShape = useCanvasStore((s) => s.setPixelShape);
  const setPixelDensity = useCanvasStore((s) => s.setPixelDensity);
  const setMirrorMode = useCanvasStore((s) => s.setMirrorMode);
  const setOnionSkinEnabled = useCanvasStore((s) => s.setOnionSkinEnabled);
  const setOnionSkinFont = useCanvasStore((s) => s.setOnionSkinFont);
  const setOnionSkinSize = useCanvasStore((s) => s.setOnionSkinSize);
  const setCanvasMuted = useCanvasStore((s) => s.setCanvasMuted);
  const resizeCanvas = useCanvasStore((s) => s.resizeCanvas);
  const assignLetter = useCanvasStore((s) => s.assignLetter);
  const canvases = useCanvasStore((s) => s.canvases);

  // Local display values: fall back to neutral defaults when no canvas exists.
  // When a canvas IS selected, controls always reflect the store (source of truth).
  // When nothing is selected, we allow the user to fidget — local "fidget" state
  // tracks the control positions without committing anywhere. The fidget state
  // jumps to the newly selected canvas's values whenever selection changes.
  const storePixelShape = target?.pixelShape ?? 'square';
  const storePixelDensity = target?.pixelDensity ?? 1.0;
  const storeMirrorMode = target?.mirrorMode ?? 'none';
  const storeOnionEnabled = target?.onionSkinEnabled ?? true;
  const storeOnionFont = target?.onionSkinFont ?? 'sans-serif';
  const storeOnionSize = target?.onionSkinSize ?? 1.0;
  const storeLetter = target?.letter ?? null;
  const storeMuted = target?.muted ?? false;

  // Fidget state — only used when no canvas is selected. Jumps to target
  // values whenever targetId changes (so selecting a canvas "jumps" the controls).
  const [fidgetShape, setFidgetShape] = useState<PixelShape>(storePixelShape);
  const [fidgetDensity, setFidgetDensity] = useState<number>(storePixelDensity);
  const [fidgetMirror, setFidgetMirror] = useState<MirrorMode>(storeMirrorMode);
  const [fidgetLetter, setFidgetLetter] = useState<string | null>(storeLetter);
  const [fidgetMuted, setFidgetMuted] = useState<boolean>(storeMuted);
  useEffect(() => {
    setFidgetShape(storePixelShape);
    setFidgetDensity(storePixelDensity);
    setFidgetMirror(storeMirrorMode);
    setFidgetLetter(storeLetter);
    setFidgetMuted(storeMuted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  // Effective values shown in controls:
  // - If a canvas is selected, always mirror the store (writes go through).
  // - If nothing is selected, use fidget state for interactivity.
  const pixelShape = selectedCanvasId ? storePixelShape : fidgetShape;
  const pixelDensity = selectedCanvasId ? storePixelDensity : fidgetDensity;
  const mirrorMode = selectedCanvasId ? storeMirrorMode : fidgetMirror;
  const canvasMuted = selectedCanvasId ? storeMuted : fidgetMuted;
  // Onion controls apply universally to all existing canvases. If zero canvases
  // exist, the writes are silent — so we keep a local fidget copy for display.
  const [fidgetOnionEnabled, setFidgetOnionEnabled] = useState<boolean>(storeOnionEnabled);
  const [fidgetOnionFont, setFidgetOnionFont] = useState<'serif' | 'sans-serif'>(storeOnionFont);
  const [fidgetOnionSize, setFidgetOnionSize] = useState<number>(storeOnionSize);
  useEffect(() => {
    setFidgetOnionEnabled(storeOnionEnabled);
    setFidgetOnionFont(storeOnionFont);
    setFidgetOnionSize(storeOnionSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);
  const hasAnyCanvas = Object.keys(canvases).length > 0;
  const onionSkinEnabled = hasAnyCanvas ? storeOnionEnabled : fidgetOnionEnabled;
  const onionSkinFont = hasAnyCanvas ? storeOnionFont : fidgetOnionFont;
  const onionSkinSize = hasAnyCanvas ? storeOnionSize : fidgetOnionSize;
  // Displayed letter: prefer what the user most recently typed (fidgetLetter)
  // so that even rejected-as-duplicate letters remain visible. Falls back to
  // the canvas's stored letter when no typing has happened this session.
  const currentLetter = fidgetLetter ?? storeLetter;
  // Disabled when the displayed letter is not actually committed to the
  // currently selected canvas — i.e. the typed character didn't "take".
  // Cases: (a) no canvas is selected, (b) the letter is taken by another canvas.
  const currentLetterIsDisabled = !!(
    currentLetter &&
    (!selectedCanvasId || currentLetter !== storeLetter)
  );
  const handleAssignLetter = useCallback(
    (letter: string | null) => {
      // Always update the fidget/display state so the typed character is visible.
      setFidgetLetter(letter);
      if (!selectedCanvasId) return;
      // Clearing is always allowed.
      if (letter === null) {
        assignLetter(selectedCanvasId, null);
        return;
      }
      // Only commit to the canvas if the letter isn't already taken.
      // (Parent UI shows the typed letter at 40% opacity if rejected.)
      const taken = Object.values(useCanvasStore.getState().canvases).some(
        (c) => c && c.id !== selectedCanvasId && c.letter === letter
      );
      if (taken) return;
      assignLetter(selectedCanvasId, letter);
    },
    [selectedCanvasId, assignLetter]
  );

  // ── Panel writers: no-op (fidget only) when nothing is selected ─────
  const handleShape = useCallback(
    (shape: PixelShape) => {
      if (selectedCanvasId) setPixelShape(selectedCanvasId, shape);
      else setFidgetShape(shape);
    },
    [selectedCanvasId, setPixelShape]
  );
  const handleDensity = useCallback(
    (d: number) => {
      if (selectedCanvasId) setPixelDensity(selectedCanvasId, d);
      else setFidgetDensity(d);
    },
    [selectedCanvasId, setPixelDensity]
  );
  const handleMirror = useCallback(
    (m: MirrorMode) => {
      if (selectedCanvasId) setMirrorMode(selectedCanvasId, m);
      else setFidgetMirror(m);
    },
    [selectedCanvasId, setMirrorMode]
  );
  const handleOnionEnabled = useCallback(
    (enabled: boolean) => {
      // Apply universally to all canvases; fidget-only if none exist.
      const ids = useCanvasStore.getState().canvasOrder;
      if (ids.length === 0) { setFidgetOnionEnabled(enabled); return; }
      for (const id of ids) setOnionSkinEnabled(id, enabled);
    },
    [setOnionSkinEnabled]
  );
  const handleOnionFont = useCallback(
    (font: 'serif' | 'sans-serif') => {
      const ids = useCanvasStore.getState().canvasOrder;
      if (ids.length === 0) { setFidgetOnionFont(font); return; }
      for (const id of ids) setOnionSkinFont(id, font);
    },
    [setOnionSkinFont]
  );
  const handleOnionSize = useCallback(
    (size: number) => {
      const ids = useCanvasStore.getState().canvasOrder;
      if (ids.length === 0) { setFidgetOnionSize(size); return; }
      for (const id of ids) setOnionSkinSize(id, size);
    },
    [setOnionSkinSize]
  );
  const handleTool = useCallback(
    (t: EditorTool) => {
      setTool(t);
    },
    [setTool]
  );
  const handleMuted = useCallback(
    (muted: boolean) => {
      if (selectedCanvasId) setCanvasMuted(selectedCanvasId, muted);
      else setFidgetMuted(muted);
    },
    [selectedCanvasId, setCanvasMuted]
  );

  // ── Canvas W/H inputs ───────────────────────────────────────────────
  const [wInput, setWInput] = useState(target?.gridWidth ?? 24);
  const [hInput, setHInput] = useState(target?.gridHeight ?? 32);
  useEffect(() => {
    if (target) {
      setWInput(target.gridWidth);
      setHInput(target.gridHeight);
    }
  }, [target?.gridWidth, target?.gridHeight]);
  const applyCanvasSize = useCallback(() => {
    if (selectedCanvasId && target && (wInput !== target.gridWidth || hInput !== target.gridHeight)) {
      resizeCanvas(selectedCanvasId, Math.max(4, wInput), Math.max(4, hInput));
    }
  }, [selectedCanvasId, target, wInput, hInput, resizeCanvas]);

  // ── Container size tracking for physics panels ──────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return;

      const key = e.key.toLowerCase();

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useCanvasStore.temporal.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'z' && e.shiftKey) {
        e.preventDefault();
        useCanvasStore.temporal.getState().redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        useCanvasStore.temporal.getState().redo();
        return;
      }

      // Skip single-key shortcuts when modifiers are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Tool shortcuts
      if (key === 'b') { e.preventDefault(); setTool('pixel'); return; }
      if (key === 'l') { e.preventDefault(); setTool('line'); return; }
      if (key === 'r') { e.preventDefault(); setTool('rect'); return; }
      if (key === 'f') { e.preventDefault(); setTool('fill'); return; }
      if (key === 'e') { e.preventDefault(); setTool('eraser'); return; }

      // View toggles
      if (key === 'g') { e.preventDefault(); toggleGrid(); return; }
      if (key === 'm') { e.preventDefault(); toggleMetrics(); return; }
      if (key === 'o') {
        e.preventDefault();
        const ids = useCanvasStore.getState().canvasOrder;
        const next = !onionSkinEnabled;
        for (const id of ids) setOnionSkinEnabled(id, next);
        return;
      }

      // Brush size: [ shrinks, ] grows (Photoshop-style)
      if (key === '[') { e.preventDefault(); useEditorStore.getState().stepBrushSize(-1); return; }
      if (key === ']') { e.preventDefault(); useEditorStore.getState().stepBrushSize(1); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTool, toggleGrid, toggleMetrics, setOnionSkinEnabled, selectedCanvasId, onionSkinEnabled]);

  // ── Panel definitions (same layout as before, wired to new handlers) ─
  const panelDefs = useMemo(
    () => [
      {
        id: 'tools', width: 513, height: 70, color: '#FF6200', title: '', shape: 'pencil-tool' as const,
        children: (
          <PencilToolButtons activeTool={activeTool} onChange={handleTool} />
        ),
      },
      {
        id: 'shape', width: 222, height: 308, color: '#879900', title: '', shape: 'dumbbell' as const,
        children: (
          <>
            <div className="dumbbell-top shape-selector-top">
              {/* Connector notch at top is baked into the dumbbell SVG path itself
                  (x=97..125, y=0..6). Reserved for a future feature attachment. */}
              <RadialShapeSelector value={pixelShape} onChange={handleShape} />
            </div>
            <div className="dumbbell-bottom">
              <DensitySlider
                value={pixelDensity}
                min={0.15}
                max={1}
                onChange={handleDensity}
              />
            </div>
          </>
        ),
      },
      {
        id: 'mirror', width: 222, height: 264, color: '#aeaeae', title: '', shape: 'pill' as const,
        children: (
          <RadialMirrorSelector value={mirrorMode} onChange={handleMirror} />
        ),
      },
      // Canvas control tool temporarily removed — will be replaced with a new approach.
      {
        id: 'onion',
        width: 320,
        height: 225,
        color: '#c7a07c',
        title: '',
        shape: 'onion' as const,
        children: (
          <div className="onion-controls-v2">
            <div className="onion-toggle-row">
              <button
                className={`onion-toggle-btn onion-toggle-btn--off ${!onionSkinEnabled ? 'onion-toggle-btn--selected' : ''}`}
                onClick={() => handleOnionEnabled(false)}
              >OFF</button>
              <button
                className={`onion-toggle-btn onion-toggle-btn--ghost ${onionSkinEnabled && onionSkinFont === 'serif' ? 'onion-toggle-btn--selected' : ''}`}
                onClick={() => { handleOnionEnabled(true); handleOnionFont('serif'); }}
              >SERIF</button>
              <button
                className={`onion-toggle-btn onion-toggle-btn--ghost ${onionSkinEnabled && onionSkinFont === 'sans-serif' ? 'onion-toggle-btn--selected' : ''}`}
                onClick={() => { handleOnionEnabled(true); handleOnionFont('sans-serif'); }}
              >SANS</button>
            </div>
            <DensitySlider
              value={onionSkinSize}
              min={0.3}
              max={2}
              onChange={handleOnionSize}
            />
          </div>
        ),
      },
      {
        id: 'character', width: 162, height: 106, color: '#D2D615', title: '', shape: 'pill' as const,
        children: (
          <div className="character-panel-body">
            <CharacterInput
              value={currentLetter}
              isDisabled={currentLetterIsDisabled}
              onChange={handleAssignLetter}
            />
          </div>
        ),
      },
      {
        id: 'mute', width: 162, height: 106, color: '#73DBC4', title: '', shape: 'pill' as const,
        children: (
          <div className="character-panel-body">
            <MuteCanvasControl
              value={canvasMuted}
              isDisabled={!selectedCanvasId}
              onChange={handleMuted}
            />
          </div>
        ),
      },
      {
        // Connector mushroom — small 74×80 piece. Drags onto the shape panel's
        // top notch and snaps in place. No interactive child element here so
        // pointerdown reaches the panel-level drag handler unobstructed.
        id: 'forest', width: 74, height: 80, color: '#966538', title: '', shape: 'mushroom' as const,
        children: null,
      },
      {
        // Square sound-profile connector — 74×80 with a single bottom peg.
        // Same snap geometry as the mushroom: shoulders at y=74 sit on the
        // shape panel's top edge, peg descends 6px into the notch.
        // Audio wiring will be added in a follow-up; for now this is purely
        // a visual + snap-mechanic tool.
        id: 'square-tone', width: 74, height: 80, color: '#8C70CA', title: '', shape: 'square-tone' as const,
        children: null,
      },
      {
        id: 'bpm', width: 228, height: 106, color: '#FF92BE', title: '', shape: 'canvas' as const,
        children: <BPMControl />,
      },
    ],
    [
      activeTool,
      handleTool,
      pixelShape,
      handleShape,
      pixelDensity,
      handleDensity,
      mirrorMode,
      handleMirror,
      onionSkinEnabled,
      onionSkinFont,
      onionSkinSize,
      handleOnionEnabled,
      handleOnionFont,
      handleOnionSize,
      currentLetter,
      currentLetterIsDisabled,
      handleAssignLetter,
      canvasMuted,
      handleMuted,
      selectedCanvasId,
    ]
  );

  // ── Drawer state (unchanged) ────────────────────────────────────────
  const physicsRef = useRef<PhysicsPanelsHandle>(null);
  const storedPanelIds = useDrawerStore((s) => s.storedPanelIds);
  const storePanel = useDrawerStore((s) => s.storePanel);
  const restorePanel = useDrawerStore((s) => s.restorePanel);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activePanels = useMemo(
    () => panelDefs.filter((p) => !storedPanelIds.includes(p.id)),
    [panelDefs, storedPanelIds]
  );
  const storedPanels = useMemo(
    () => panelDefs.filter((p) => storedPanelIds.includes(p.id)),
    [panelDefs, storedPanelIds]
  );

  const dropPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const handlePanelDroppedInDrawer = useCallback((panelId: string, x: number, y: number) => {
    dropPositionsRef.current.set(panelId, { x, y });
    storePanel(panelId);
  }, [storePanel]);

  const handlePanelDraggedOut = useCallback((panelId: string, x: number, y: number) => {
    const panel = panelDefs.find((p) => p.id === panelId);
    if (!panel) return;
    restorePanel(panelId);
    requestAnimationFrame(() => {
      physicsRef.current?.addPanelBody(panel, x, y);
    });
  }, [panelDefs, restorePanel]);

  const [drawerEdge, setDrawerEdge] = useState(0);
  const handleDrawerOpenChange = useCallback((isOpen: boolean, rightEdge: number) => {
    setDrawerOpen(isOpen);
    setDrawerEdge(rightEdge);
  }, []);

  // Mushroom snap → forest tone wiring. The visual connection IS the audio
  // state: plug the mushroom into the shape panel's notch and the audio
  // engine switches to the forest profile (ambient + softer pitches);
  // detach it and the engine returns to default tones. We toggle only when
  // the desired state differs from the current `soundProfile` so the
  // ambient engine doesn't double-start or double-stop.
  const handleSnapChange = useCallback(
    (childId: string, partnerId: string | null) => {
      const snapped = partnerId === 'shape';

      if (childId === 'forest') {
        // Mushroom → forest profile when snapped, default when detached
        const current = useAudioStore.getState().soundProfile;
        const wantsId = snapped ? 'forest' : 'default';
        if (current !== wantsId) setProfileById(wantsId);
      } else if (childId === 'square-tone') {
        // Purple square → C418 profile when snapped, default when detached
        const current = useAudioStore.getState().soundProfile;
        const wantsId = snapped ? 'c418' : 'default';
        if (current !== wantsId) setProfileById(wantsId);
      }
    },
    [setProfileById]
  );

  return (
    <div className="editor-fullcanvas" ref={containerRef}>
      {hydrated && (
        <>
          <PixelCanvas />
          <PhysicsPanels
            ref={physicsRef}
            panels={activePanels}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
            drawerOpen={drawerOpen}
            drawerRightEdge={drawerEdge}
            onPanelDroppedInDrawer={handlePanelDroppedInDrawer}
            onSnapChange={handleSnapChange}
          />
          <ToolDrawer
            panels={storedPanels}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
            onPanelDraggedOut={handlePanelDraggedOut}
            onOpenChange={handleDrawerOpenChange}
            dropPositions={dropPositionsRef.current}
          />
        </>
      )}
    </div>
  );
}

// Backwards-compatible named export so the existing router import keeps working
// until Stage 5 rewires routing.
export { WorkspaceView as GlyphEditorView };
