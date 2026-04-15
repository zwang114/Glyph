import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { PixelCanvas } from '../../canvas/PixelCanvas';
import { useEditorStore } from '../../stores/editorStore';
import { useFontStore } from '../../stores/fontStore';
import { BASIC_LATIN } from '../../utils/charset';
import type { EditorTool, MirrorMode, PixelShape } from '../../types/editor';

export function GlyphEditorView() {
  const params = useParams<{ id: string; glyphId: string }>();
  const navigate = useNavigate();
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
  const toggleOnionSkinFont = useEditorStore((s) => s.toggleOnionSkinFont);
  const setOnionSkinSize = useEditorStore((s) => s.setOnionSkinSize);
  const resizeGlyph = useFontStore((s) => s.resizeGlyph);
  const glyph = useFontStore((s) =>
    selectedGlyphId ? s.glyphs[selectedGlyphId] : null
  );

  const [gridW, setGridW] = useState(glyph?.gridWidth ?? 24);
  const [gridH, setGridH] = useState(glyph?.gridHeight ?? 32);

  useEffect(() => {
    if (params.glyphId) setSelectedGlyph(params.glyphId);
  }, [params.glyphId, setSelectedGlyph]);

  useEffect(() => {
    if (glyph) { setGridW(glyph.gridWidth); setGridH(glyph.gridHeight); }
  }, [glyph?.gridWidth, glyph?.gridHeight]);

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
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault(); useFontStore.temporal.getState().redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTool]);

  const applyGridSize = () => {
    if (selectedGlyphId && (gridW !== glyph?.gridWidth || gridH !== glyph?.gridHeight)) {
      resizeGlyph(selectedGlyphId, Math.max(4, gridW), Math.max(4, gridH));
    }
  };

  const filledCount = glyph ? glyph.pixels.flat().filter(Boolean).length : 0;

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

  const tools: { key: EditorTool; label: string; shortcut: string }[] = [
    { key: 'pixel', label: 'Pixel', shortcut: 'B' },
    { key: 'line', label: 'Line', shortcut: 'L' },
    { key: 'rect', label: 'Rect', shortcut: 'R' },
    { key: 'eraser', label: 'Erase', shortcut: 'E' },
  ];
  const mirrors: { key: MirrorMode; label: string }[] = [
    { key: 'none', label: 'Off' }, { key: 'horizontal', label: 'H' },
    { key: 'vertical', label: 'V' }, { key: 'both', label: 'HV' },
  ];
  const shapes: { key: PixelShape; label: string }[] = [
    { key: 'square', label: 'Sq' }, { key: 'circle', label: 'Ci' },
    { key: 'diamond', label: 'Dm' }, { key: 'triangle', label: 'Tr' },
    { key: 'metaball', label: 'Mb' },
  ];

  return (
    <div className="editor">
      <div className="editor-sidebar">
        {/* Tools */}
        <div className="panel">
          <h3 className="panel-title">Tools</h3>
          <div className="tool-grid">
            {tools.map((t) => (
              <button key={t.key} className={`btn btn--sm ${activeTool === t.key ? 'btn--active' : ''}`}
                onClick={() => setTool(t.key)} title={`${t.label} (${t.shortcut})`}>
                {t.shortcut} {t.label}
              </button>
            ))}
          </div>
          <div className="tool-buttons" style={{ marginTop: '8px' }}>
            <button className="btn btn--sm" onClick={() => useFontStore.temporal.getState().undo()}>Undo</button>
            <button className="btn btn--sm" onClick={() => useFontStore.temporal.getState().redo()}>Redo</button>
          </div>
        </div>

        {/* Shape */}
        <div className="panel">
          <h3 className="panel-title">Shape</h3>
          <div className="shape-row">
            {shapes.map((s) => (
              <button key={s.key} className={`btn btn--sm ${pixelShape === s.key ? 'btn--active' : ''}`}
                onClick={() => setPixelShape(s.key)}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* Density */}
        <div className="panel">
          <h3 className="panel-title">Density</h3>
          <div className="density-slider">
            <input type="range" min="15" max="100" value={Math.round(pixelDensity * 100)}
              onChange={(e) => setPixelDensity(Number(e.target.value) / 100)} className="slider" />
            <span className="mono density-value">{Math.round(pixelDensity * 100)}%</span>
          </div>
        </div>

        {/* Mirror */}
        <div className="panel">
          <h3 className="panel-title">Mirror</h3>
          <div className="tool-buttons">
            {mirrors.map((m) => (
              <button key={m.key} className={`btn btn--sm ${mirrorMode === m.key ? 'btn--active' : ''}`}
                onClick={() => setMirrorMode(m.key)}>{m.label}</button>
            ))}
          </div>
        </div>

        {/* Canvas Size */}
        <div className="panel">
          <h3 className="panel-title">Canvas Size</h3>
          <div className="size-controls">
            <label className="size-field">
              <span className="panel-label">W</span>
              <input type="number" className="size-input mono" value={gridW} min={4} max={128}
                onChange={(e) => setGridW(Number(e.target.value))}
                onBlur={applyGridSize}
                onKeyDown={(e) => { if (e.key === 'Enter') applyGridSize(); }} />
            </label>
            <span className="size-x">x</span>
            <label className="size-field">
              <span className="panel-label">H</span>
              <input type="number" className="size-input mono" value={gridH} min={4} max={128}
                onChange={(e) => setGridH(Number(e.target.value))}
                onBlur={applyGridSize}
                onKeyDown={(e) => { if (e.key === 'Enter') applyGridSize(); }} />
            </label>
          </div>
        </div>

        {/* Onion Skin */}
        <div className="panel">
          <h3 className="panel-title">Onion Skin</h3>
          <div className="tool-buttons">
            <button className={`btn btn--sm ${onionSkinEnabled ? 'btn--active' : ''}`}
              onClick={() => setOnionSkinEnabled(!onionSkinEnabled)} style={{ flex: 1 }}>
              {onionSkinEnabled ? 'On' : 'Off'}
            </button>
          </div>
          {onionSkinEnabled && (
            <>
              <div className="tool-buttons">
                <button className={`btn btn--sm ${onionSkinFont === 'serif' ? 'btn--active' : ''}`}
                  onClick={toggleOnionSkinFont}>Serif</button>
                <button className={`btn btn--sm ${onionSkinFont === 'sans-serif' ? 'btn--active' : ''}`}
                  onClick={toggleOnionSkinFont}>Sans</button>
              </div>
              <div className="density-slider">
                <span className="panel-label" style={{ width: 28, flexShrink: 0 }}>Size</span>
                <input type="range" min="30" max="200" value={Math.round(onionSkinSize * 100)}
                  onChange={(e) => setOnionSkinSize(Number(e.target.value) / 100)} className="slider" />
                <span className="mono density-value">{Math.round(onionSkinSize * 100)}%</span>
              </div>
            </>
          )}
        </div>

        {/* Glyph info */}
        <div className="panel">
          <h3 className="panel-title">Glyph</h3>
          <div className="panel-row">
            <span className="panel-label">Name</span>
            <span className="panel-value mono">{glyph?.name ?? '—'}</span>
          </div>
          <div className="panel-row">
            <span className="panel-label">Unicode</span>
            <span className="panel-value mono">
              {glyph ? `U+${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}` : '—'}
            </span>
          </div>
          <div className="panel-row">
            <span className="panel-label">Pixels</span>
            <span className="panel-value mono">{filledCount}</span>
          </div>
          <div className="glyph-nav">
            <button className="btn btn--sm" onClick={handlePrev} disabled={currentIdx <= 0}>Prev</button>
            <span className="mono" style={{ fontSize: '18px' }}>{glyph ? String.fromCharCode(glyph.unicode) : ''}</span>
            <button className="btn btn--sm" onClick={handleNext} disabled={currentIdx >= BASIC_LATIN.length - 1}>Next</button>
          </div>
        </div>

        {/* Actions */}
        <div className="panel">
          <button className="btn btn--sm" onClick={() => selectedGlyphId && useFontStore.getState().clearGlyph(selectedGlyphId)}
            style={{ width: '100%' }}>Clear glyph</button>
        </div>
      </div>

      <div className="editor-canvas">
        <PixelCanvas />
      </div>
    </div>
  );
}
