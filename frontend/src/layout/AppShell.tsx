import { UserCog, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { InlineAlert } from '@/components';
import { authApi, preferenceApi } from '@/data/repository';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useDevSettings } from '@/state/devSettings';
import { ErrorBoundary } from '@/pages/faults/FaultPages';
import { useMaybeAuth } from '@/state/useAuth';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import './Shell.css';

/** Per-user preference key: desktop sidebar collapsed to an icon rail. */
const SIDEBAR_COLLAPSED = 'sidebarCollapsed';

/** OperatorNotice (.pen nFbY2): persistent while acting as Operator (FR-AUT-009). */
export function OperatorNotice() {
  const auth = useMaybeAuth();
  if (!auth?.active || auth.active.capacity !== 'operator') return null;
  return (
    <div className="operator-notice" role="status">
      <UserCog aria-hidden />
      <p>
        Anda bekerja sebagai operator untuk {auth.active.position.name}. Tindakan akhir dilakukan
        oleh {auth.active.officialName ?? 'Pejabat'}.
      </p>
    </div>
  );
}

/** Ends the session after the configured idle time (FR-AUT-008, NFR-008). */
function useIdleSignOut() {
  const idleMinutes = useDevSettings((s) => s.idleMinutes);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const last = useRef(Date.now());
  const path = useRef(pathname);
  path.current = pathname;
  useEffect(() => {
    const bump = () => (last.current = Date.now());
    const events = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = window.setInterval(() => {
      if (Date.now() - last.current > idleMinutes * 60_000) {
        // Drafts autosave as they are typed, so nothing is lost when the session ends.
        authApi.signOut();
        navigate(`/login?alasan=sesi-berakhir&kembali=${encodeURIComponent(path.current)}`);
      }
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(id);
    };
  }, [idleMinutes, navigate]);
}

function Drawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return (
    <div className="drawer">
      <div className="overlay__scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
      >
        {children}
        <button type="button" className="drawer__close" aria-label="Tutup menu" onClick={onClose}>
          <X aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Authenticated shell: sidebar 240 (drawer < 900 px), sticky topbar, content max 1200. */
export function AppShell({ children }: { children?: ReactNode }) {
  const auth = useMaybeAuth();
  const location = useLocation();
  const offline = useDevSettings((s) => s.offline);
  const [drawer, setDrawer] = useState(false);
  const userId = auth?.user.id;
  const [collapsed, setCollapsed] = useState(
    () => (userId && preferenceApi.get<boolean>(userId, SIDEBAR_COLLAPSED)) || false,
  );
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (userId) preferenceApi.set(userId, SIDEBAR_COLLAPSED, next);
  };
  useIdleSignOut();

  useEffect(() => setDrawer(false), [location.pathname]);

  if (!auth) {
    const kembali = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?kembali=${kembali}`} replace />;
  }
  if (auth.user.mustChangePassword) return <Navigate to="/ganti-kata-sandi" replace />;

  return (
    <div className={['shell', collapsed && 'shell--collapsed'].filter(Boolean).join(' ')}>
      <a className="skip-link" href="#konten">
        Lewati ke konten
      </a>
      <aside className="shell__sidebar">
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>
      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <div className="shell__main">
        <Topbar onMenu={() => setDrawer(true)} />
        <main id="konten" className="shell__content" tabIndex={-1}>
          {offline && (
            <InlineAlert variant="warning" title="Anda sedang luring">
              Perubahan belum dapat dikirim. Draf tetap tersimpan di perangkat ini dan dikirim
              otomatis saat koneksi kembali.
            </InlineAlert>
          )}
          <OperatorNotice />
          <ErrorBoundary>{children ?? <Outlet />}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
