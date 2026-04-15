import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { DashboardView } from './components/dashboard/DashboardView';
import { FontOverview } from './components/overview/FontOverview';
import { GlyphEditorView } from './components/editor/GlyphEditorView';
import { SpacingView } from './components/spacing/SpacingView';
import { PreviewView } from './components/preview/PreviewView';
import { ExportView } from './components/export/ExportView';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardView />,
  },
  {
    path: '/project/:id',
    element: <AppShell />,
    children: [
      { path: 'overview', element: <FontOverview /> },
      { path: 'edit/:glyphId', element: <GlyphEditorView /> },
      { path: 'spacing', element: <SpacingView /> },
      { path: 'preview', element: <PreviewView /> },
      { path: 'export', element: <ExportView /> },
    ],
  },
]);
