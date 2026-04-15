import { useState } from 'react';
import { useFontStore } from '../../stores/fontStore';
import { useEditorStore } from '../../stores/editorStore';
import { downloadFont } from '../../engine/font/compiler';

export function ExportView() {
  const project = useFontStore((s) => s.project);
  const glyphs = useFontStore((s) => s.glyphs);
  const pixelShape = useEditorStore((s) => s.pixelShape);
  const pixelDensity = useEditorStore((s) => s.pixelDensity);
  const [exported, setExported] = useState(false);

  const glyphCount = Object.values(glyphs).filter((g) =>
    g.pixels.some((row) => row.some(Boolean))
  ).length;

  const handleExport = (format: 'otf' | 'ttf') => {
    downloadFont(project, glyphs, format, pixelShape, pixelDensity);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <div className="export-view">
      <div className="export-info">
        <h2 className="section-title">Export</h2>

        <div className="export-details">
          <div className="panel-row">
            <span className="panel-label">Family</span>
            <span className="panel-value mono">{project.familyName}</span>
          </div>
          <div className="panel-row">
            <span className="panel-label">Style</span>
            <span className="panel-value mono">{project.styleName}</span>
          </div>
          <div className="panel-row">
            <span className="panel-label">Shape</span>
            <span className="panel-value mono">{pixelShape}</span>
          </div>
          <div className="panel-row">
            <span className="panel-label">Density</span>
            <span className="panel-value mono">{Math.round(pixelDensity * 100)}%</span>
          </div>
          <div className="panel-row">
            <span className="panel-label">Glyphs</span>
            <span className="panel-value mono">{glyphCount} drawn</span>
          </div>
        </div>

        <div className="export-actions">
          <button className="btn" onClick={() => handleExport('otf')}>
            Download OTF
          </button>
          <button className="btn" onClick={() => handleExport('ttf')}>
            Download TTF
          </button>
        </div>

        {exported && <p className="export-status mono">Font exported.</p>}
        {glyphCount === 0 && (
          <p className="export-warning">No glyphs drawn yet.</p>
        )}
      </div>
    </div>
  );
}
