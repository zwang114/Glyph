import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { PixelCanvas } from '../../canvas/PixelCanvas';
import { useEditorStore } from '../../stores/editorStore';
import { useFontStore } from '../../stores/fontStore';
import { BASIC_LATIN } from '../../utils/charset';
import { PhysicsPanels } from '../shared/PhysicsPanels';
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
  const setTool = useEditorStore((s) => s.setTool);
  const setMirrorMode = useEditorStore((s) => s.setMirrorMode);
  const setPixelShape = useEditorStore((s) => s.setPixelShape);
  const setPixelDensity = useEditorStore((s) => s.setPixelDensity);
  const glyph = useFontStore((s) =>
    selectedGlyphId ? s.glyphs[selectedGlyphId] : null
  );

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

  const tools: { key: EditorTool; label: string }[] = [
    { key: 'pixel', label: 'PIXEL' },
    { key: 'line', label: 'LINE' },
    { key: 'rect', label: 'RECTANGLE' },
    { key: 'fill', label: 'FILL' },
  ];
  const shapes: { key: PixelShape; label: string }[] = [
    { key: 'square', label: 'SQ' }, { key: 'circle', label: 'CI' },
    { key: 'diamond', label: 'DM' }, { key: 'triangle', label: 'TR' },
    { key: 'metaball', label: 'MB' },
  ];

  const panelDefs = [
    {
      id: 'tools', width: 222, height: 260, color: '#FF6200', title: 'PENS', shape: 'pen' as const,
      children: (
        <div className="fp-stack">
          {tools.map((t) => (
            <button key={t.key} className={`fp-btn ${activeTool === t.key ? 'fp-btn--active' : ''}`}
              onClick={() => setTool(t.key)}>{t.label}</button>
          ))}
        </div>
      ),
    },
    {
      id: 'shape', width: 222, height: 175, color: '#879900', title: 'SHAPE', shape: 'ticket' as const,
      children: (
        <>
          <div className="ticket-top">
            <div className="fp-shapes">
              {shapes.map((s) => (
                <button key={s.key} className={`fp-btn ${pixelShape === s.key ? 'fp-btn--active' : ''}`}
                  onClick={() => setPixelShape(s.key)}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="ticket-bottom">
            <div className="fp-density-row">
              <span className="fp-density-label">DENSITY</span>
              <span className="fp-density-value">{Math.round(pixelDensity * 100)}%</span>
            </div>
            <input type="range" min="15" max="100" value={Math.round(pixelDensity * 100)}
              onChange={(e) => setPixelDensity(Number(e.target.value) / 100)} className="fp-slider" />
          </div>
        </>
      ),
    },
    {
      id: 'mirror', width: 221, height: mirrorMode === 'none' ? 191 : 279, color: '#610099', title: 'Mirror', shape: 'pill' as const,
      children: (
        <div className={`mirror-controls ${mirrorMode !== 'none' ? 'mirror-controls--on' : ''}`}>
          <div className={`mirror-toggle ${mirrorMode !== 'none' ? 'mirror-toggle--on' : ''}`}
            onClick={() => setMirrorMode(mirrorMode === 'none' ? 'horizontal' : 'none')}>
            <div className="mirror-toggle-thumb" />
            <span className="mirror-toggle-label on">ON</span>
            <span className="mirror-toggle-label off">OFF</span>
          </div>
          <div className="mirror-modes">
            <div className="mirror-modes-row">
              <button className={`mirror-mode-btn ${mirrorMode === 'horizontal' ? 'mirror-mode-btn--active' : ''}`}
                onClick={() => setMirrorMode('horizontal')}>H</button>
              <button className={`mirror-mode-btn ${mirrorMode === 'vertical' ? 'mirror-mode-btn--active' : ''}`}
                onClick={() => setMirrorMode('vertical')}>V</button>
            </div>
            <button className={`mirror-mode-btn mirror-mode-btn--full ${mirrorMode === 'both' ? 'mirror-mode-btn--active' : ''}`}
              onClick={() => setMirrorMode('both')}>H+V</button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="editor-fullcanvas" ref={containerRef}>
      <PixelCanvas />
      <PhysicsPanels
        panels={panelDefs}
        containerWidth={containerSize.w}
        containerHeight={containerSize.h}
      />
      <div className="floating-nav">
        <button className="fp-btn fp-btn--dark" onClick={handlePrev} disabled={currentIdx <= 0}>PREV</button>
        <span className="floating-nav-char">{glyph ? String.fromCharCode(glyph.unicode) : ''}</span>
        <button className="fp-btn fp-btn--dark" onClick={handleNext} disabled={currentIdx >= BASIC_LATIN.length - 1}>NEXT</button>
      </div>
    </div>
  );
}
