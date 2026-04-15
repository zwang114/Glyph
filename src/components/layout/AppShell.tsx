import { NavLink, Outlet, useParams } from 'react-router';
import { useFontStore } from '../../stores/fontStore';
import { useEditorStore } from '../../stores/editorStore';

export function AppShell() {
  const params = useParams();
  const project = useFontStore((s) => s.project);
  const viewport = useEditorStore((s) => s.viewport);
  const base = `/project/${params.id}`;

  return (
    <div className="app-shell">
      <header className="toolbar">
        <NavLink to="/" className="toolbar-brand">
          GLYPH STUDIO
        </NavLink>

        <nav className="toolbar-nav">
          <NavLink to={`${base}/overview`} className="toolbar-link">
            Overview
          </NavLink>
          <NavLink to={`${base}/edit/0048`} className="toolbar-link">
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
          Ctrl+Z undo &middot; Ctrl+Shift+Z redo &middot; E erase &middot; Scroll to zoom &middot; Alt+drag to pan
        </span>
      </footer>
    </div>
  );
}
