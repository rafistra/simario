import { Bell, ChevronRight, Menu, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { homeApi } from '@/data/repository';
import { useQuery } from '@/lib/useQuery';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useNotifications } from '@/state/notifications';
import { useAuth } from '@/state/useAuth';
import { navFor } from './nav';
import { NotificationPanel } from '@/components/NotificationPanel/NotificationPanel';
import { usePageMetaStore } from './pageMeta';
import './Shell.css';

/** Global search (Ctrl K): pages in the current menu and Lini 1 positions in scope. Risks join in Tahap 5. */
function SearchDialog({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  // Lini 1 positions in the viewer's scope, from the server (FR-BRD-011 list).
  const scope = useQuery(() => homeApi.positions(), [auth.user.id]);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  useFocusTrap(ref, true, onClose);
  const items = useMemo(() => {
    const pages = navFor(auth.roleView, auth).flatMap((s) =>
      s.items.map((i) => ({ kind: 'Halaman', label: i.label, to: i.to })),
    );
    const positions = (scope.data ?? []).map((p) => ({
      kind: 'Jabatan',
      label: `${p.name} · ${p.unit}`,
      to: `/jabatan/${p.positionId}/papan/${auth.currentFiscalYear}`,
    }));
    const needle = q.trim().toLowerCase();
    return [...pages, ...positions]
      .filter((i) => !needle || i.label.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [auth, scope.data, q]);
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  return (
    <div className="overlay overlay--top">
      <div className="overlay__scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian"
        className="search-dialog"
      >
        <div className="search-dialog__field">
          <Search aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && items[0] && go(items[0].to)}
            placeholder="Cari risiko atau jabatan…"
            aria-label="Cari risiko atau jabatan"
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="search-dialog__list">
          {items.length === 0 && (
            <li className="search-dialog__empty">Tidak ada hasil untuk “{q}”.</li>
          )}
          {items.map((i) => (
            <li key={i.kind + i.to}>
              <button type="button" className="search-dialog__item" onClick={() => go(i.to)}>
                <span className="t-eyebrow">{i.kind}</span>
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Topbar (.pen JRQvp): sticky cream bar with breadcrumb, search pill, bell, contextual button. */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const auth = useAuth();
  const { crumbs, context } = usePageMetaStore();
  const { unread } = useNotifications(auth.user.id);
  const [searching, setSearching] = useState(false);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const ContextIcon = context?.icon;
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button type="button" className="topbar__menu" aria-label="Buka menu" onClick={onMenu}>
          <Menu aria-hidden />
        </button>
        <nav aria-label="Breadcrumb">
          <ol className="breadcrumb">
            {crumbs.map((c, i) => (
              <li key={i} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                {i > 0 && <ChevronRight className="breadcrumb__sep" aria-hidden />}
                {c}
              </li>
            ))}
          </ol>
        </nav>
      </div>
      <div className="topbar__right">
        <button type="button" className="search-pill" onClick={() => setSearching(true)}>
          <Search aria-hidden />
          <span className="search-pill__text">Cari risiko atau jabatan…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="bell-wrap">
          <button
            type="button"
            className="bell"
            aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
            aria-haspopup="dialog"
            aria-expanded={panel}
            onClick={() => setPanel((v) => !v)}
          >
            <Bell aria-hidden />
            {unread > 0 && <span className="bell__badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {panel && (
            <NotificationPanel
              userId={auth.user.id}
              onClose={() => {
                setPanel(false);
                document.querySelector<HTMLElement>('.bell')?.focus();
              }}
            />
          )}
        </div>
        {context && (
          <Link to={context.to} className="btn btn--secondary topbar__context">
            {ContextIcon && <ContextIcon className="btn__icon" aria-hidden />}
            <span>{context.label}</span>
          </Link>
        )}
      </div>
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
    </header>
  );
}
