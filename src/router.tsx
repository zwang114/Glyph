import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { DashboardView } from './components/dashboard/DashboardView';
import { GlyphEditorView } from './components/editor/GlyphEditorView';

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
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
