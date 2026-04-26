import type { EditorTool } from '../../types/editor';

/**
 * Pill button row that lives inside the pencil-tool panel (513×70).
 *
 * Layout (positions verbatim from Figma frame 132:90):
 *   ERASER     61×38 at x=16,  y=16 (inside the rounded body cap, x=0..93)
 *   ── 16px notch seam (x=93..109) — purely decorative ──
 *   PIXEL      61×38 at x=125, y=16 (active state in Figma)
 *   RECTANGLE  92×38 at x=194, y=16
 *   LINE       56×38 at x=294, y=16
 *   FILL       53×38 at x=358, y=16
 *
 * Pill chassis (universal):
 *   - 38px tall, 1000px corner radius (full pill)
 *   - 1px black border in BOTH states (per user-locked spec)
 *   - rest:   transparent fill, black text
 *   - active: black fill, #FF6200 text
 *   - 16px horizontal padding, Noto Sans Regular 10px / 0.5px tracking / uppercase
 */
interface Props {
  activeTool: EditorTool;
  onChange: (tool: EditorTool) => void;
}

interface ButtonSpec {
  tool: EditorTool;
  label: string;
  x: number;
  width: number;
}

// Frozen positions and widths from Figma (132:90). DO NOT recompute — these
// are the exact pixel values from the design and must match 1:1.
const BUTTONS: ButtonSpec[] = [
  { tool: 'eraser', label: 'ERASER',    x: 16,  width: 61 },
  { tool: 'pixel',  label: 'PIXEL',     x: 125, width: 61 },
  { tool: 'rect',   label: 'RECTANGLE', x: 194, width: 92 },
  { tool: 'line',   label: 'LINE',      x: 294, width: 56 },
  { tool: 'fill',   label: 'FILL',      x: 358, width: 53 },
];

export function PencilToolButtons({ activeTool, onChange }: Props) {
  return (
    <div className="pencil-tool-buttons">
      {BUTTONS.map(({ tool, label, x, width }) => {
        const isActive = activeTool === tool;
        return (
          <button
            key={tool}
            type="button"
            className={`pencil-tool-pill ${isActive ? 'is-active' : ''}`}
            style={{ left: x, width }}
            onClick={() => onChange(tool)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-pressed={isActive}
            aria-label={label}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
