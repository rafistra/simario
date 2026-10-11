import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components';

// Dev-only component gallery (Tahap 1); excluded from production bundles.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./dev/ComponentGallery')) : null;

function Placeholder() {
  return (
    <main className="app-placeholder">
      <h1 className="t-display-lg">SIMARIO</h1>
      <p>Sistem Informasi Mitigasi Risiko Otorita IKN — prototipe dalam pengembangan.</p>
      {import.meta.env.DEV && <Link to="/_komponen">Lihat pustaka komponen</Link>}
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Placeholder />} />
          {ComponentGallery && <Route path="/_komponen" element={<ComponentGallery />} />}
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
