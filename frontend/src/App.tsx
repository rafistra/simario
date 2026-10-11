import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DataGate, Toaster } from '@/components';
import { DevPanel } from '@/dev/DevPanel';
import { AppShell } from '@/layout/AppShell';
import { RequireHolding, RequirePermission } from '@/layout/RequirePermission';
import { WorkspaceLayout, WorkspaceRedirect } from '@/layout/Workspace';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import LoginPage from '@/pages/auth/LoginPage';
import { ForbiddenPage, NotFoundPage } from '@/pages/faults/FaultPages';
import HomePage from '@/pages/home/HomePage';
import PositionsPage from '@/pages/master/PositionsPage';
import StagesPage from '@/pages/master/StagesPage';
import TemplatesPage from '@/pages/master/TemplatesPage';
import ProposalsPage from '@/pages/master/ProposalsPage';
import DataUmumPage from '@/pages/master/DataUmumPage';
import ScoreBandsPage from '@/pages/master/ScoreBandsPage';
import RegisterPage from '@/pages/register/RegisterPage';
import BoardPage from '@/pages/board/BoardPage';
import ThreadPage from '@/pages/board/ThreadPage';
import AssessmentPage from '@/pages/assessment/AssessmentPage';
import QueuePage from '@/pages/assessment/QueuePage';
import HistoryPage from '@/pages/history/HistoryPage';
import PositionListPage from '@/pages/home/PositionListPage';
import NotificationsPage from '@/pages/notifications/NotificationsPage';
import SheetPage from '@/pages/sheets/SheetPage';
import UsersPage from '@/pages/admin/UsersPage';
import RolesPage from '@/pages/admin/RolesPage';
import AssignmentsPage from '@/pages/admin/AssignmentsPage';
import FiscalYearsPage from '@/pages/admin/FiscalYearsPage';
import ImportPage from '@/pages/admin/ImportPage';
import MyPositionsPage from '@/pages/admin/MyPositionsPage';
import MetricsPage from '@/pages/admin/MetricsPage';
import AuditPage from '@/pages/admin/AuditPage';
import { useAuth } from '@/state/useAuth';

// Dev-only component gallery (Tahap 1); excluded from production bundles.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./dev/ComponentGallery')) : null;

/** /jabatan needs the view permission with Unit or All scope (§1.8). */
function RequireWideScope({ children }: { children: ReactNode }) {
  const scope = useAuth().permissions.get(1);
  return scope === 'unit' || scope === 'semua' ? <>{children}</> : <ForbiddenPage />;
}

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
            <Route
              path="notifikasi"
              element={
                <DataGate>
                  <NotificationsPage />
                </DataGate>
              }
            />
            <Route
              path="jabatan-saya"
              element={
                <RequireHolding>
                  <DataGate>
                    <MyPositionsPage />
                  </DataGate>
                </RequireHolding>
              }
            />
            <Route
              path="jabatan"
              element={
                <RequireWideScope>
                  <PositionListPage variant="direktori" />
                </RequireWideScope>
              }
            />
            <Route
              path="pantauan"
              element={
                <RequireHolding line={2}>
                  <PositionListPage variant="pantauan" />
                </RequireHolding>
              }
            />
            <Route
              path="penilaian"
              element={
                <RequirePermission anyOf={[8]}>
                  <QueuePage />
                </RequirePermission>
              }
            />

            <Route path="jabatan/:jid" element={<WorkspaceLayout />}>
              <Route index element={<WorkspaceRedirect />} />
              <Route path="papan/:ta" element={<BoardPage />} />
              <Route path="papan/:ta/risiko/:rid" element={<ThreadPage />} />
              <Route
                path="register/:ta"
                element={
                  <DataGate>
                    <RegisterPage />
                  </DataGate>
                }
              />
              <Route path="penilaian/:ta/:tw" element={<AssessmentPage />} />
              <Route path="riwayat" element={<HistoryPage />} />
              <Route path="lembar/:ta/:tw" element={<SheetPage />} />
            </Route>

            <Route path="master">
              <Route
                path="jabatan"
                element={
                  <RequirePermission anyOf={[17, 18]}>
                    <DataGate>
                      <PositionsPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="tahap"
                element={
                  <RequirePermission anyOf={[15]}>
                    <DataGate>
                      <StagesPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="template"
                element={
                  <RequirePermission anyOf={[12]}>
                    <DataGate>
                      <TemplatesPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="usulan"
                element={
                  <RequirePermission anyOf={[13]}>
                    <DataGate>
                      <ProposalsPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="data-umum"
                element={
                  <RequirePermission anyOf={[16]}>
                    <DataGate>
                      <DataUmumPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="skala-penilaian"
                element={
                  <RequirePermission anyOf={[14]}>
                    <DataGate>
                      <ScoreBandsPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
            </Route>

            <Route path="pengaturan">
              <Route
                path="pengguna"
                element={
                  <RequirePermission anyOf={[21]}>
                    <DataGate>
                      <UsersPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="peran"
                element={
                  <RequirePermission anyOf={[22]}>
                    <DataGate>
                      <RolesPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="penugasan-pemantauan"
                element={
                  <RequirePermission anyOf={[20]}>
                    <DataGate>
                      <AssignmentsPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="tahun-anggaran"
                element={
                  <RequirePermission anyOf={[19]}>
                    <DataGate>
                      <FiscalYearsPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
              <Route
                path="impor"
                element={
                  <RequirePermission anyOf={[18, 20, 21]}>
                    <DataGate>
                      <ImportPage />
                    </DataGate>
                  </RequirePermission>
                }
              />
            </Route>
            <Route
              path="metrik"
              element={
                <RequirePermission anyOf={[22]}>
                  <MetricsPage />
                </RequirePermission>
              }
            />
            <Route
              path="jejak-audit"
              element={
                <RequirePermission anyOf={[23]}>
                  <AuditPage />
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
