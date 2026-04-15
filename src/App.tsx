import { RouterProvider } from 'react-router';
import { router } from './router';
import { useSeedTestGlyphs } from './hooks/useSeedTestGlyphs';

export default function App() {
  useSeedTestGlyphs();
  return <RouterProvider router={router} />;
}
