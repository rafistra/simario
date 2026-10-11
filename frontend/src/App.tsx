import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { Toaster } from '@/components';
import { DevPanel } from '@/dev/DevPanel';
import { AppShell } from '@/layout/AppShell';
import { RequireHolding, RequirePermission } from '@/layout/RequirePermission';
import {
  WorkspaceLayout,
  WorkspaceRedirect,
  type WorkspaceOutletContext,
} from '@/layout/Workspace';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import LoginPage from '@/pages/auth/LoginPage';
import { ForbiddenPage, NotFoundPage } from '@/pages/faults/FaultPages';
import HomePage from '@/pages/home/HomePage';
import { Placeholder } from '@/pages/Placeholder';
import { useAuth } from '@/state/useAuth';

// Dev-only component gallery (Tahap 1); excluded from production bundles.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./dev/ComponentGallery')) : null;

/** /jabatan needs the view permission with Unit or All scope (§1.8). */
function RequireWideScope({ children }: { children: ReactNode }) {
  const scope = useAuth().permissions.get(1);
  return scope === 'unit' || scope === 'semua' ? <>{children}</> : <ForbiddenPage />;
}

function WorkspaceTab({
  tab,
}: {
  tab: 'papan' | 'utas' | 'register' | 'penilaian' | 'riwayat' | 'lembar';
}) {
  const { position, unitCode } = useOutletContext<WorkspaceOutletContext>();
  const map = {
    papan: { title: 'Papan Risiko', stage: 5 },
    utas: { title: 'Utas Risiko', stage: 5 },
    register: { title: 'Register', stage: 4 },
    penilaian: { title: 'Penilaian Triwulan', stage: 6 },
    riwayat: { title: 'Riwayat Risiko', stage: 7 },
    lembar: { title: 'Lembar Komunikasi dan Lembar Mutu', stage: 8 },
  }[tab];
  // Breadcrumb per the mockups: "Papan Risiko › PPK A-1 · DDKB".
  return (
    <Placeholder
      bare
      crumbs={[map.title, `${position.name} · ${unitCode}`]}
      title={map.title}
      stage={map.stage}
    />
  );
}

const page = (crumbs: string[], title: string, stage: number, eyebrow?: string) => (
  <Placeholder crumbs={crumbs} title={title} stage={stage} eyebrow={eyebrow} />
);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/ganti-kata-sandi" element={<ChangePasswordPage />} />
          {ComponentGallery && <Route path="/_komponen" element={<ComponentGallery />} />}

          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="notifikasi" element={page(['Notifikasi'], 'Semua Notifikasi', 7)} />
            <Route
              path="jabatan-saya"
              element={<RequireHolding>{page(['Jabatan Saya'], 'Jabatan Saya', 9)}</RequireHolding>}
            />
            <Route
              path="jabatan"
              element={
                <RequireWideScope>{page(['Daftar Jabatan'], 'Daftar Jabatan', 7)}</RequireWideScope>
              }
            />
            <Route
              path="pantauan"
              element={
                <RequireHolding line={2}>
                  {page(['Jabatan Dipantau'], 'Jabatan Dipantau', 7)}
                </RequireHolding>
              }
            />
            <Route
              path="penilaian"
              element={
                <RequirePermission anyOf={[8]}>
                  {page(['Antrean Penilaian'], 'Antrean Penilaian', 6)}
                </RequirePermission>
              }
            />

            <Route path="jabatan/:jid" element={<WorkspaceLayout />}>
              <Route index element={<WorkspaceRedirect />} />
              <Route path="papan/:ta" element={<WorkspaceTab tab="papan" />} />
              <Route path="papan/:ta/risiko/:rid" element={<WorkspaceTab tab="utas" />} />
              <Route path="register/:ta" element={<WorkspaceTab tab="register" />} />
              <Route path="penilaian/:ta/:tw" element={<WorkspaceTab tab="penilaian" />} />
              <Route path="riwayat" element={<WorkspaceTab tab="riwayat" />} />
              <Route path="lembar/:ta/:tw" element={<WorkspaceTab tab="lembar" />} />
            </Route>

            <Route path="master">
              <Route
                path="jabatan"
                element={
                  <RequirePermission anyOf={[17, 18]}>
                    {page(
                      ['Master Data', 'Jabatan'],
                      'Jenis Jabatan dan Jabatan',
                      3,
                      'Master data',
                    )}
                  </RequirePermission>
                }
              />
              <Route
                path="tahap"
                element={
                  <RequirePermission anyOf={[15]}>
                    {page(['Master Data', 'Tahap'], 'Tahap', 3, 'Master data')}
                  </RequirePermission>
                }
              />
              <Route
                path="template"
                element={
                  <RequirePermission anyOf={[12]}>
                    {page(
                      ['Master Data', 'Template'],
                      'Template Risiko dan Mitigasi',
                      3,
                      'Master data',
                    )}
                  </RequirePermission>
                }
              />
              <Route
                path="usulan"
                element={
                  <RequirePermission anyOf={[13]}>
                    {page(['Master Data', 'Usulan'], 'Antrean Usulan Risiko', 3, 'Master data')}
                  </RequirePermission>
                }
              />
              <Route
                path="data-umum"
                element={
                  <RequirePermission anyOf={[16]}>
                    {page(['Master Data', 'Data Umum'], 'Formulir Data Umum', 3, 'Master data')}
                  </RequirePermission>
                }
              />
              <Route
                path="skala-penilaian"
                element={
                  <RequirePermission anyOf={[14]}>
                    {page(['Master Data', 'Skala Penilaian'], 'Skala Penilaian', 3, 'Master data')}
                  </RequirePermission>
                }
              />
            </Route>

            <Route path="pengaturan">
              <Route
                path="pengguna"
                element={
                  <RequirePermission anyOf={[21]}>
                    {page(['Pengaturan', 'Pengguna'], 'Pengguna dan Jabatan', 9, 'Pengaturan')}
                  </RequirePermission>
                }
              />
              <Route
                path="peran"
                element={
                  <RequirePermission anyOf={[22]}>
                    {page(['Pengaturan', 'Peran'], 'Peran dan Izin', 9, 'Pengaturan')}
                  </RequirePermission>
                }
              />
              <Route
                path="penugasan-pemantauan"
                element={
                  <RequirePermission anyOf={[20]}>
                    {page(
                      ['Pengaturan', 'Penugasan Pemantauan'],
                      'Penugasan Pemantauan',
                      9,
                      'Pengaturan',
                    )}
                  </RequirePermission>
                }
              />
              <Route
                path="tahun-anggaran"
                element={
                  <RequirePermission anyOf={[19]}>
                    {page(['Pengaturan', 'Tahun Anggaran'], 'Tahun Anggaran', 9, 'Pengaturan')}
                  </RequirePermission>
                }
              />
              <Route
                path="impor"
                element={
                  <RequirePermission anyOf={[18, 20, 21]}>
                    {page(['Pengaturan', 'Impor Data'], 'Impor Data', 9, 'Pengaturan')}
                  </RequirePermission>
                }
              />
            </Route>
            <Route
              path="metrik"
              element={
                <RequirePermission anyOf={[22]}>
                  {page(['Metrik'], 'Metrik Produk', 9)}
                </RequirePermission>
              }
            />
            <Route
              path="jejak-audit"
              element={
                <RequirePermission anyOf={[23]}>
                  {page(['Jejak Audit'], 'Jejak Audit', 9)}
                </RequirePermission>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
      <DevPanel />
      <Toaster />
    </BrowserRouter>
  );
}
