import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { PixelCanvas } from '../../canvas/PixelCanvas';
import { useEditorStore } from '../../stores/editorStore';
import { useFontStore } from '../../stores/fontStore';
import { useDrawerStore } from '../../stores/drawerStore';
import { BASIC_LATIN } from '../../utils/charset';
import { PhysicsPanels } from '../shared/PhysicsPanels';
import type { PhysicsPanelsHandle, PanelDef } from '../shared/PhysicsPanels';
import { ToolDrawer } from '../shared/ToolDrawer';
import { VerticalLever } from '../shared/VerticalLever';
import { RadialBrushSelector } from '../shared/RadialBrushSelector';
import { RadialShapeSelector } from '../shared/RadialShapeSelector';
import { DensitySlider } from '../shared/DensitySlider';
import { RadialMirrorSelector } from '../shared/RadialMirrorSelector';
import type { EditorTool, PixelShape } from '../../types/editor';

export function GlyphEditorView() {
  const params = useParams<{ id: string; glyphId: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1200, h: 800 });
  const setSelectedGlyph = useEditorStore((s) => s.setSelectedGlyph);
  const selectedGlyphId = useEditorStore((s) => s.selectedGlyphId);
  const activeTool = useEditorStore((s) => s.activeTool);
  const mirrorMode = useEditorStore((s) => s.mirrorMode);
  const pixelShape = useEditorStore((s) => s.pixelShape);
  const pixelDensity = useEditorStore((s) => s.pixelDensity);
  const onionSkinEnabled = useEditorStore((s) => s.onionSkinEnabled);
  const onionSkinFont = useEditorStore((s) => s.onionSkinFont);
  const onionSkinSize = useEditorStore((s) => s.onionSkinSize);
  const setTool = useEditorStore((s) => s.setTool);
  const setMirrorMode = useEditorStore((s) => s.setMirrorMode);
  const setPixelShape = useEditorStore((s) => s.setPixelShape);
  const setPixelDensity = useEditorStore((s) => s.setPixelDensity);
  const setOnionSkinEnabled = useEditorStore((s) => s.setOnionSkinEnabled);
  const setOnionSkinFont = useEditorStore((s) => s.setOnionSkinFont);
  const toggleOnionSkinFont = useEditorStore((s) => s.toggleOnionSkinFont);
  const setOnionSkinSize = useEditorStore((s) => s.setOnionSkinSize);
  const glyph = useFontStore((s) =>
    selectedGlyphId ? s.glyphs[selectedGlyphId] : null
  );
  const resizeGlyph = useFontStore((s) => s.resizeGlyph);

  const [wInput, setWInput] = useState(glyph?.gridWidth ?? 24);
  const [hInput, setHInput] = useState(glyph?.gridHeight ?? 32);

  useEffect(() => {
    if (glyph) { setWInput(glyph.gridWidth); setHInput(glyph.gridHeight); }
  }, [glyph?.gridWidth, glyph?.gridHeight]);

  const applyCanvasSize = () => {
    if (selectedGlyphId && (wInput !== glyph?.gridWidth || hInput !== glyph?.gridHeight)) {
      resizeGlyph(selectedGlyphId, Math.max(4, wInput), Math.max(4, hInput));
    }
  };

  useEffect(() => {
    if (params.glyphId) setSelectedGlyph(params.glyphId);
  }, [params.glyphId, setSelectedGlyph]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'b' || e.key === 'B') setTool('pixel');
      if (e.key === 'l' || e.key === 'L') setTool('line');
      if (e.key === 'r' || e.key === 'R') setTool('rect');
      if (e.key === 'f' || e.key === 'F') setTool('fill');
      if (e.key === 'e' || e.key === 'E') setTool('eraser');
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); useFontStore.temporal.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault(); useFontStore.temporal.getState().redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTool]);

  const currentIdx = BASIC_LATIN.findIndex(
    (c) => c.unicode.toString(16).padStart(4, '0') === selectedGlyphId
  );
  const handlePrev = () => {
    if (currentIdx > 0) {
      const id = BASIC_LATIN[currentIdx - 1].unicode.toString(16).padStart(4, '0');
      navigate(`/project/${params.id}/edit/${id}`);
    }
  };
  const handleNext = () => {
    if (currentIdx < BASIC_LATIN.length - 1) {
      const id = BASIC_LATIN[currentIdx + 1].unicode.toString(16).padStart(4, '0');
      navigate(`/project/${params.id}/edit/${id}`);
    }
  };

  const panelDefs = [
    {
      id: 'tools', width: 222, height: 270, color: '#FF6200', title: 'BRUSH', shape: 'banner' as const,
      children: (
        <RadialBrushSelector
          value={activeTool === 'eraser' ? 'pixel' : activeTool}
          onChange={setTool}
        />
      ),
    },
    {
      id: 'shape', width: 222, height: 368, color: '#879900', title: 'SHAPE', shape: 'dumbbell' as const,
      children: (
        <>
          <div className="dumbbell-top">
            <RadialShapeSelector value={pixelShape} onChange={setPixelShape} />
          </div>
          <div className="dumbbell-bottom">
            <div className="fp-density-row">
              <span className="fp-density-label">PATTERN DENSITY</span>
              <span className="fp-density-value">{Math.round(pixelDensity * 100)}%</span>
            </div>
            <DensitySlider
              value={pixelDensity}
              min={0.15}
              max={1}
              onChange={setPixelDensity}
            />
          </div>
        </>
      ),
    },
    {
      id: 'mirror', width: 222, height: 318, color: '#aeaeae', title: 'Mirror', shape: 'pill' as const,
      children: (
        <RadialMirrorSelector value={mirrorMode} onChange={setMirrorMode} />
      ),
    },
    {
      id: 'canvas', width: 341, height: 103, color: '#FF92BE', title: 'CANVAS', shape: 'canvas' as const,
      children: (
        <>
          <div className="canvas-dim-group">
            <span className="canvas-dim-label">W</span>
            <div className="canvas-input-box">
              <input
                type="number"
                className="canvas-input"
                value={wInput}
                min={4}
                max={128}
                onChange={(e) => setWInput(Number(e.target.value))}
                onBlur={applyCanvasSize}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCanvasSize(); }}
              />
            </div>
            <span className="canvas-dim-unit">PX</span>
          </div>
          <div className="canvas-dim-group">
            <span className="canvas-dim-label">H</span>
            <div className="canvas-input-box">
              <input
                type="number"
                className="canvas-input"
                value={hInput}
                min={4}
                max={128}
                onChange={(e) => setHInput(Number(e.target.value))}
                onBlur={applyCanvasSize}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCanvasSize(); }}
              />
            </div>
            <span className="canvas-dim-unit">PX</span>
          </div>
        </>
      ),
    },
    {
      id: 'onion',
      width: 320,
      height: 305,
      color: '#FFF18B',
      title: 'Onion Skin',
      shape: 'onion' as const,
      children: (
        <div className="onion-controls-v2">
          {/* 3-way toggle: OFF / SERIF / SANS */}
          <div className="onion-toggle-row">
            <button
              className={`onion-toggle-btn ${!onionSkinEnabled ? 'onion-toggle-btn--active' : ''}`}
              onClick={() => setOnionSkinEnabled(false)}
            >OFF</button>
            <button
              className={`onion-toggle-btn ${onionSkinEnabled && onionSkinFont === 'serif' ? 'onion-toggle-btn--active' : ''}`}
              onClick={() => { setOnionSkinEnabled(true); setOnionSkinFont('serif'); }}
            >SERIF</button>
            <button
              className={`onion-toggle-btn ${onionSkinEnabled && onionSkinFont === 'sans-serif' ? 'onion-toggle-btn--active' : ''}`}
              onClick={() => { setOnionSkinEnabled(true); setOnionSkinFont('sans-serif'); }}
            >SANS</button>
          </div>
          {/* Size slider */}
          <div className="onion-size-section">
            <div className="onion-size-header">
              <span className="onion-size-label">SIZE</span>
              <span className="onion-size-value">{Math.round(onionSkinSize * 100)}%</span>
            </div>
            <DensitySlider
              value={onionSkinSize}
              min={0.3}
              max={2}
              onChange={setOnionSkinSize}
            />
          </div>
        </div>
      ),
    },
  ];

  // Drawer state
  const physicsRef = useRef<PhysicsPanelsHandle>(null);
  const storedPanelIds = useDrawerStore((s) => s.storedPanelIds);
  const storePanel = useDrawerStore((s) => s.storePanel);
  const restorePanel = useDrawerStore((s) => s.restorePanel);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drawerWidth = Math.round(containerSize.w * (2 / 3));

  // Split panels: active (on canvas) vs stored (in drawer)
  const activePanels = useMemo(
    () => panelDefs.filter((p) => !storedPanelIds.includes(p.id)),
    [panelDefs, storedPanelIds]
  );
  const storedPanels = useMemo(
    () => panelDefs.filter((p) => storedPanelIds.includes(p.id)),
    [panelDefs, storedPanelIds]
  );

  // Track where panels were dropped into the drawer
  const dropPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // When a panel is dropped inside the drawer from the canvas
  const handlePanelDroppedInDrawer = useCallback((panelId: string, x: number, y: number) => {
    // Store drop position so the drawer can place the body there
    dropPositionsRef.current.set(panelId, { x, y });
    storePanel(panelId);
  }, [storePanel]);

  // When a panel is dragged out of the drawer back to the canvas
  const handlePanelDraggedOut = useCallback((panelId: string, x: number, y: number) => {
    const panel = panelDefs.find((p) => p.id === panelId);
    if (!panel) return;
    restorePanel(panelId);
    // rAF ensures React has re-rendered with the panel in activePanels
    requestAnimationFrame(() => {
      physicsRef.current?.addPanelBody(panel, x, y);
    });
  }, [panelDefs, restorePanel]);

  const [drawerEdge, setDrawerEdge] = useState(0);

  const handleDrawerOpenChange = useCallback((isOpen: boolean, rightEdge: number) => {
    setDrawerOpen(isOpen);
    setDrawerEdge(rightEdge);
  }, []);

  return (
    <div className="editor-fullcanvas" ref={containerRef}>
      <PixelCanvas />
      <PhysicsPanels
        ref={physicsRef}
        panels={activePanels}
        containerWidth={containerSize.w}
        containerHeight={containerSize.h}
        drawerOpen={drawerOpen}
        drawerRightEdge={drawerEdge}
        onPanelDroppedInDrawer={handlePanelDroppedInDrawer}
      />
      <ToolDrawer
        panels={storedPanels}
        containerWidth={containerSize.w}
        containerHeight={containerSize.h}
        onPanelDraggedOut={handlePanelDraggedOut}
        onOpenChange={handleDrawerOpenChange}
        dropPositions={dropPositionsRef.current}
      />
      <div className="floating-nav">
        <button className="fp-btn fp-btn--dark" onClick={handlePrev} disabled={currentIdx <= 0}>PREV</button>
        <span className="floating-nav-char">{glyph ? String.fromCharCode(glyph.unicode) : ''}</span>
        <button className="fp-btn fp-btn--dark" onClick={handleNext} disabled={currentIdx >= BASIC_LATIN.length - 1}>NEXT</button>
      </div>
    </div>
  );
}
