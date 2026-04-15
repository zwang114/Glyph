import { useNavigate, useParams } from 'react-router';
import { useFontStore } from '../../stores/fontStore';
import { BASIC_LATIN } from '../../utils/charset';
import { GlyphCell } from './GlyphCell';

export function FontOverview() {
  const navigate = useNavigate();
  const params = useParams();
  const glyphs = useFontStore((s) => s.glyphs);
  const project = useFontStore((s) => s.project);

  const handleGlyphClick = (unicodeHex: string) => {
    navigate(`/project/${params.id}/edit/${unicodeHex}`);
  };

  return (
    <div className="overview">
      <div className="overview-header">
        <h2 className="section-title">
          {project.familyName} {project.styleName}
        </h2>
        <span className="overview-meta">
          {project.defaultGridWidth}x{project.defaultGridHeight} grid
        </span>
      </div>

      <div className="glyph-grid">
        {BASIC_LATIN.map((def) => {
          const id = def.unicode.toString(16).padStart(4, '0');
          const glyph = glyphs[id];
          if (!glyph) return null;

          return (
            <GlyphCell
              key={id}
              glyph={glyph}
              charDef={def}
              onClick={() => handleGlyphClick(id)}
            />
          );
        })}
      </div>
    </div>
  );
}
