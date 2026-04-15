import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { PixelCanvas } from '../../canvas/PixelCanvas';
import { useEditorStore } from '../../stores/editorStore';
import { useFontStore } from '../../stores/fontStore';
import { BASIC_LATIN } from '../../utils/charset';
import { PhysicsPanels } from '../shared/PhysicsPanels';
import type { EditorTool, MirrorMode, PixelShape } from '../../types/editor';

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
    { key: 'pixel', label: 'B PIXEL' }, { key: 'line', label: 'L LINE' },
    { key: 'rect', label: 'R RECT' }, { key: 'eraser', label: 'E ERASE' },
  ];
  const shapes: { key: PixelShape; label: string }[] = [
    { key: 'square', label: 'SQ' }, { key: 'circle', label: 'CI' },
    { key: 'diamond', label: 'DM' }, { key: 'triangle', label: 'TR' },
    { key: 'metaball', label: 'MB' },
  ];
  const mirrors: { key: MirrorMode; label: string }[] = [
    { key: 'none', label: 'OFF' }, { key: 'horizontal', label: 'H' },
    { key: 'vertical', label: 'V' }, { key: 'both', label: 'HV' },
  ];

  const panelDefs = [
    {
      id: 'tools', width: 222, height: 160, color: '#F57C00', title: 'TOOLS',
      children: (
        <>
          <div className="fp-row">
            {tools.slice(0, 2).map((t) => (
              <button key={t.key} className={`fp-btn ${activeTool === t.key ? 'fp-btn--active' : ''}`}
                onClick={() => setTool(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="fp-row">
            {tools.slice(2, 4).map((t) => (
              <button key={t.key} className={`fp-btn ${activeTool === t.key ? 'fp-btn--active' : ''}`}
                onClick={() => setTool(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="fp-row">
            <button className="fp-btn" onClick={() => useFontStore.temporal.getState().undo()}>UNDO</button>
            <button className="fp-btn" onClick={() => useFontStore.temporal.getState().redo()}>REDO</button>
          </div>
        </>
      ),
    },
    {
      id: 'shape', width: 222, height: 152, color: '#9E9D24', title: 'SHAPE',
      children: (
        <>
          <div className="fp-shapes">
            {shapes.map((s) => (
              <button key={s.key} className={`fp-btn ${pixelShape === s.key ? 'fp-btn--active' : ''}`}
                onClick={() => setPixelShape(s.key)}>{s.label}</button>
            ))}
          </div>
          <div className="fp-density-row">
            <span className="fp-density-label">DENSITY</span>
            <span className="fp-density-value">{Math.round(pixelDensity * 100)}%</span>
          </div>
          <input type="range" min="15" max="100" value={Math.round(pixelDensity * 100)}
            onChange={(e) => setPixelDensity(Number(e.target.value) / 100)} className="fp-slider" />
        </>
      ),
    },
    {
      id: 'mirror', width: 125, height: 196, color: '#6A1B9A', title: 'MIRROR',
      children: (
        <div className="fp-stack">
          {mirrors.map((m) => (
            <button key={m.key} className={`fp-btn ${mirrorMode === m.key ? 'fp-btn--active' : ''}`}
              onClick={() => setMirrorMode(m.key)}>{m.label}</button>
          ))}
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
