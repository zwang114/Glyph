import { useState, useEffect, useRef } from 'react';
import { useFontStore } from '../../stores/fontStore';
import { useEditorStore } from '../../stores/editorStore';
import { generatePreviewUrl } from '../../engine/font/compiler';

const WATERFALL_SIZES = [12, 16, 24, 32, 48, 64, 96];

export function PreviewView() {
  const project = useFontStore((s) => s.project);
  const glyphs = useFontStore((s) => s.glyphs);
  const pixelShape = useEditorStore((s) => s.pixelShape);
  const pixelDensity = useEditorStore((s) => s.pixelDensity);
  const [text, setText] = useState('HELLO WORLD');
  const [fontUrl, setFontUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontIdRef = useRef(0);

  const glyphCount = Object.values(glyphs).filter((g) =>
    g.pixels.some((row) => row.some(Boolean))
  ).length;

  useEffect(() => {
    if (glyphCount === 0) {
      setFontUrl(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const url = generatePreviewUrl(project, glyphs, pixelShape, pixelDensity);
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        fontIdRef.current++;
        setFontUrl(url);
      } catch {
        setFontUrl(null);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [project, glyphs, glyphCount, pixelShape, pixelDensity]);

  useEffect(() => {
    if (!fontUrl) return;
    // Use a unique family name per regeneration to force browser to reload
    const familyName = `GlyphStudioPreview${fontIdRef.current}`;
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: '${familyName}';
        src: url('${fontUrl}') format('opentype');
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [fontUrl]);

  const fontFamily = fontUrl
    ? `'GlyphStudioPreview${fontIdRef.current}', monospace`
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
