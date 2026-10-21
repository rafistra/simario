import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DataGate, Toaster } from '@/components';
import { CollectionGate } from '@/components/DataGate/CollectionGate';
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
                  <CollectionGate
                    names={[
                      'occupancies',
                      'delegates',
                      'users',
                      'positions',
                      'positionTypes',
                      'roles',
                      'rolePermissions',
                      'userRoles',
                    ]}
                  >
                    <MyPositionsPage />
                  </CollectionGate>
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
                  <CollectionGate
                    names={[
                      'positionTypes',
                      'stages',
                      'dataUmumForms',
                      'riskTemplates',
                      'mitigationTemplates',
                      'users',
                      'quarters',
                      'fiscalYears',
                    ]}
                  >
                    <RegisterPage />
                  </CollectionGate>
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
                    <CollectionGate
                      names={['orgUnits', 'positionTypes', 'positions', 'roles', 'delegates']}
                    >
                      <PositionsPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="tahap"
                element={
                  <RequirePermission anyOf={[15]}>
                    <CollectionGate names={['positionTypes', 'stages', 'riskTemplates']}>
                      <StagesPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="template"
                element={
                  <RequirePermission anyOf={[12]}>
                    <CollectionGate
                      names={['positionTypes', 'stages', 'riskTemplates', 'mitigationTemplates']}
                    >
                      <TemplatesPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="usulan"
                element={
                  <RequirePermission anyOf={[13]}>
                    <CollectionGate
                      names={['positionTypes', 'stages', 'riskTemplates', 'mitigationTemplates']}
                    >
                      <ProposalsPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="data-umum"
                element={
                  <RequirePermission anyOf={[16]}>
                    <CollectionGate names={['positionTypes', 'dataUmumForms']}>
                      <DataUmumPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="skala-penilaian"
                element={
                  <RequirePermission anyOf={[14]}>
                    <CollectionGate
                      names={['quarters', 'scoreBandVersions', 'scoreBands', 'scoreOptions']}
                    >
                      <ScoreBandsPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
            </Route>

            <Route path="pengaturan">
              <Route
                path="pengguna"
                element={
                  <RequirePermission anyOf={[21]}>
                    <CollectionGate
                      names={[
                        'users',
                        'userRoles',
                        'roles',
                        'rolePermissions',
                        'occupancies',
                        'delegates',
                        'orgUnits',
                        'positionTypes',
                        'positions',
                      ]}
                    >
                      <UsersPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="peran"
                element={
                  <RequirePermission anyOf={[22]}>
                    <CollectionGate
                      names={['roles', 'rolePermissions', 'userRoles', 'positionTypes']}
                    >
                      <RolesPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="penugasan-pemantauan"
                element={
                  <RequirePermission anyOf={[20]}>
                    <CollectionGate
                      names={[
                        'assignments',
                        'fiscalYears',
                        'positionTypes',
                        'positions',
                        'quarters',
                      ]}
                    >
                      <AssignmentsPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="tahun-anggaran"
                element={
                  <RequirePermission anyOf={[19]}>
                    <CollectionGate
                      names={[
                        'fiscalYears',
                        'quarters',
                        'quarterAssessors',
                        'positions',
                        'positionTypes',
                      ]}
                    >
                      <FiscalYearsPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
              <Route
                path="impor"
                element={
                  <RequirePermission anyOf={[18, 20, 21]}>
                    <CollectionGate names={['positionTypes']}>
                      <ImportPage />
                    </CollectionGate>
                  </RequirePermission>
                }
              />
            </Route>
            <Route
              path="metrik"
              element={
                <RequirePermission anyOf={[22]}>
                  <CollectionGate names={['fiscalYears']}>
                    <MetricsPage />
                  </CollectionGate>
                </RequirePermission>
              }
            />
            <Route
              path="jejak-audit"
              element={
                <RequirePermission anyOf={[23]}>
                  <CollectionGate names={['users', 'positions']}>
                    <AuditPage />
                  </CollectionGate>
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
