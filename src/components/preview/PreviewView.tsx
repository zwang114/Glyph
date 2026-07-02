import { useState, useEffect, useRef } from 'react';
import { useFontStore } from '../../stores/fontStore';
import { useCompatGlyphs, useCompatRenderStyle } from '../../stores/canvasCompat';
import { generatePreviewUrl } from '../../engine/font/compiler';

const WATERFALL_SIZES = [12, 16, 24, 32, 48, 64, 96];

export function PreviewView() {
  const project = useFontStore((s) => s.project);
  const glyphs = useCompatGlyphs();
  const { shape: pixelShape, density: pixelDensity } = useCompatRenderStyle();
  const [text, setText] = useState('HELLO WORLD');
  // url + generation id live together in state so render never reads a ref —
  // the id makes each @font-face family name unique, forcing a font reload.
  const [font, setFont] = useState<{ url: string; id: number } | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontIdRef = useRef(0);

  const glyphCount = Object.values(glyphs).filter((g) =>
    g.pixels.some((row) => row.some(Boolean))
  ).length;

  // When there are no glyphs the preview falls back to monospace; the stale
  // `font` state is simply ignored (derived below) rather than cleared here.
  useEffect(() => {
    if (glyphCount === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const url = generatePreviewUrl(project, glyphs, pixelShape, pixelDensity);
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        fontIdRef.current++;
        setFont({ url, id: fontIdRef.current });
      } catch {
        setFont(null);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [project, glyphs, glyphCount, pixelShape, pixelDensity]);

  const activeFont = glyphCount > 0 ? font : null;

  useEffect(() => {
    if (!activeFont) return;
    // Use a unique family name per regeneration to force browser to reload
    const familyName = `GlyphStudioPreview${activeFont.id}`;
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: '${familyName}';
        src: url('${activeFont.url}') format('opentype');
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [activeFont]);

  const fontFamily = activeFont
    ? `'GlyphStudioPreview${activeFont.id}', monospace`
    : 'monospace';

  return (
    <div className="preview-view">
      <div className="preview-header">
        <h2 className="section-title">Preview</h2>
        <input
          className="preview-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type here..."
        />
      </div>

      {glyphCount === 0 ? (
        <p className="placeholder-text" style={{ padding: '48px' }}>
          No glyphs drawn yet.
        </p>
      ) : (
        <div className="preview-waterfall">
          {WATERFALL_SIZES.map((size) => (
            <div key={size} className="preview-sample">
              <span className="preview-size mono">{size}px</span>
              <div
                className="preview-text"
                style={{ fontFamily, fontSize: size, lineHeight: 1.2 }}
              >
                {text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
