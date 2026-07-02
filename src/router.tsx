import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { DashboardView } from './components/dashboard/DashboardView';
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
      { index: true, element: <Navigate to="edit" replace /> },
      { path: 'edit', element: <GlyphEditorView /> },
      { path: 'spacing', element: <SpacingView /> },
      { path: 'preview', element: <PreviewView /> },
      { path: 'export', element: <ExportView /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
