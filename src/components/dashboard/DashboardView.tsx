import { useNavigate } from 'react-router';
import { useFontStore } from '../../stores/fontStore';

export function DashboardView() {
  const navigate = useNavigate();
  const initProject = useFontStore((s) => s.initProject);
  const project = useFontStore((s) => s.project);

  const handleNew = () => {
    initProject('Untitled');
    // TODO(Stage 5): route to new multi-canvas workspace.
    navigate(`/project/${project.id}/edit`);
  };

  const handleOpen = () => {
    // TODO(Stage 5): route to new multi-canvas workspace.
    navigate(`/project/${project.id}/edit`);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">GLYPH STUDIO</h1>
        <p className="dashboard-subtitle">Type design tool</p>
      </div>

      <div className="dashboard-actions">
        <button className="btn" onClick={handleNew}>
          New project
        </button>
        <button className="btn" onClick={handleOpen}>
          Open current
        </button>
      </div>

      <div className="dashboard-recent">
        <h2 className="section-title">Current project</h2>
        <div className="project-card" onClick={handleOpen}>
          <div className="project-card-name">{project.familyName}</div>
          <div className="project-card-meta">
            {project.styleName} &middot; {project.unitsPerEm} UPM
          </div>
        </div>
      </div>
    </div>
  );
}
