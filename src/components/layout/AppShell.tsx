import { useRef, useEffect } from 'react';
import { NavLink, Outlet, useParams, useMatch } from 'react-router';
import { useFontStore } from '../../stores/fontStore';
import { useEditorStore } from '../../stores/editorStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { ShortcutHelpOverlay } from '../shared/ShortcutHelpOverlay';
import { useShortcutHelp } from '../../hooks/useShortcutHelp';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';
const shift = isMac ? '⇧' : 'Shift+';
const alt = isMac ? '⌥' : 'Alt+';

export function AppShell() {
  const params = useParams();
  const project = useFontStore((s) => s.project);
  const viewport = useCanvasStore((s) => s.viewport);
  const base = `/project/${params.id}`;
  const isEditor = useMatch('/project/:id/edit');
  const { open: helpOpen, setOpen: setHelpOpen } = useShortcutHelp();

  const activeTool = useEditorStore((s) => s.activeTool);
  const liveRef = useRef<HTMLDivElement>(null);
  const prevToolRef = useRef(activeTool);
  useEffect(() => {
    if (activeTool !== prevToolRef.current) {
      prevToolRef.current = activeTool;
      if (liveRef.current) liveRef.current.textContent = `${activeTool} tool selected`;
    }
  }, [activeTool]);

  return (
    <div className="app-shell">
      <header className="toolbar">
        <NavLink to="/" className="toolbar-brand">
          GLYPH STUDIO
        </NavLink>

        <nav className="toolbar-nav">
          <NavLink to={`${base}/edit`} className="toolbar-link">
            Edit
          </NavLink>
          <NavLink to={`${base}/spacing`} className="toolbar-link">
            Spacing
          </NavLink>
          <NavLink to={`${base}/preview`} className="toolbar-link">
            Preview
          </NavLink>
          <NavLink to={`${base}/export`} className="toolbar-link">
            Export
          </NavLink>
        </nav>

        <div className="toolbar-meta">
          <span className="mono">{project.familyName}</span>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <footer className="statusbar">
        <span className="statusbar-item mono">
          Zoom {Math.round((viewport.zoom || 1) * 100)}%
        </span>
        <span className="statusbar-hint">
          {isEditor
            ? `${mod}Z undo · ${mod}${shift}Z redo · B brush · L line · R rect · F fill · E erase · G grid · M metrics · O onion · Scroll zoom · Space+drag pan · ${alt}+drag tab duplicate`
            : `${mod}Z undo · ${mod}${shift}Z redo`}
        </span>
      </footer>
      <ShortcutHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />
    </div>
  );
}
