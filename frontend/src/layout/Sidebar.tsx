import {
  Briefcase,
  Check,
  ChevronsUpDown,
  Ellipsis,
  IdCard,
  KeyRound,
  Landmark,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CapacityChip, LineChip } from '@/components';
import { ROLE_VIEW_LABEL } from '@/domain/permissions';
import type { Line } from '@/domain/types';
import { initials } from '@/lib/format';
import { applyTheme, getTheme } from '@/lib/theme';
import { useSession } from '@/state/session';
import { chooseActivePosition, signOutEverywhere, useMe } from '@/state/me';
import { useAuth } from '@/state/useAuth';
import { isActive, navFor } from './nav';
import './Shell.css';

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** PositionSwitcher + PositionSwitcherMenu (.pen h7GXD4, zHvOw) — FR-AUT-009. */
function PositionSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const holdings = useMe((s) => s.me?.holdings ?? []);
  const setActive = chooseActivePosition;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!auth.active) return null;
  // Lini 1 positions read "PPK A-1 · DDKB"; Lini 2/3 names already carry their unit. Names come
  // from /me, which also knows positions created in the backend.
  const label = (positionId: string) => {
    const h = holdings.find((x) => x.positionId === positionId);
    if (!h) return positionId;
    return h.line === 1 ? `${h.position.name} · ${h.unitCode}` : h.position.name;
  };
  const multiple = auth.holdings.length > 1;
  const choose = (positionId: string, line: Line) => {
    setActive(positionId);
    setOpen(false);
    onNavigate?.();
    // Lini 1 → that position's workspace; Lini 2/3 → Home in that capacity.
    navigate(line === 1 ? `/jabatan/${positionId}/papan/${auth.currentFiscalYear}` : '/');
  };
  return (
    <div className="switcher" ref={ref}>
      <button
        type="button"
        className="switcher__card"
        aria-haspopup={multiple ? 'listbox' : undefined}
        aria-expanded={multiple ? open : undefined}
        onClick={() => multiple && setOpen((o) => !o)}
        disabled={!multiple}
      >
        <span className="switcher__icon" aria-hidden>
          <Briefcase />
        </span>
        <span className="switcher__text">
          <span className="switcher__eyebrow">Jabatan aktif</span>
          <span className="switcher__name">{label(auth.active.positionId)}</span>
          <CapacityChip capacity={auth.active.capacity} />
        </span>
        {multiple && <ChevronsUpDown className="switcher__chevron" aria-hidden />}
      </button>
      {open && (
        <div className="popover switcher__menu" role="listbox" aria-label="Pilih jabatan">
          {([1, 2, 3] as Line[]).map((line) => {
            const items = auth.holdings.filter((h) => h.line === line);
            if (items.length === 0) return null;
            return (
              <div key={line} className="switcher__group">
                <p className="switcher__group-head">Lini {line}</p>
                {items.map((h) => {
                  const current = h.positionId === auth.active!.positionId;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      role="option"
                      aria-selected={current}
                      className={['switcher__option', current && 'is-current']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => choose(h.positionId, h.line)}
                    >
                      <span className="switcher__option-text">
                        <span className="switcher__option-name">{label(h.positionId)}</span>
                        <span className="switcher__option-chips">
                          <LineChip line={h.line} />
                          <CapacityChip capacity={h.capacity} />
                        </span>
                      </span>
                      {current && <Check className="switcher__check" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            );
          })}
          <Link to="/jabatan-saya" className="switcher__footer" onClick={() => setOpen(false)}>
            <IdCard aria-hidden /> Jabatan Saya
          </Link>
        </div>
      )}
    </div>
  );
}

/** UserBlock + UserMenu (.pen HASqf). */
function UserBlock({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const setRoleView = useSession((s) => s.setRoleView);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const go = (to: string) => {
    setOpen(false);
    onNavigate?.();
    navigate(to);
  };
  return (
    <div className="user-block" ref={ref}>
      <span className="user-block__avatar" aria-hidden>
        {initials(auth.user.fullName)}
      </span>
      <span className="user-block__text">
        <span className="user-block__name">{auth.user.fullName}</span>
        <span className="user-block__email">{auth.user.email}</span>
      </span>
      <button
        type="button"
        className="user-block__menu-btn"
        aria-label="Menu pengguna"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis aria-hidden />
      </button>
      {open && (
        <div className="popover user-menu" role="menu">
          {auth.roleViews.length > 1 && (
            <>
              <p className="user-menu__head">Tampilan peran</p>
              {auth.roleViews.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="menuitemradio"
                  aria-checked={auth.roleView === v}
                  className={['user-menu__item', auth.roleView === v && 'is-current']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setRoleView(v);
                    setOpen(false);
                  }}
                >
                  <span className="user-menu__radio" aria-hidden />
                  {ROLE_VIEW_LABEL[v]}
                </button>
              ))}
              <hr className="user-menu__divider" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="user-menu__item"
            onClick={() => go('/jabatan-saya')}
          >
            <IdCard aria-hidden /> Jabatan Saya
          </button>
          {auth.user.isLocalAccount && (
            <button
              type="button"
              role="menuitem"
              className="user-menu__item"
              onClick={() => go('/ganti-kata-sandi')}
            >
              <KeyRound aria-hidden /> Ganti Kata Sandi
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="user-menu__item"
            onClick={() => {
              const next = getTheme() === 'dark' ? 'light' : 'dark';
              applyTheme(next);
              setOpen(false);
            }}
          >
            {getTheme() === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            {getTheme() === 'dark' ? 'Mode terang' : 'Mode gelap'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="user-menu__item user-menu__item--danger"
            onClick={() => {
              void signOutEverywhere().then(() => navigate('/login'));
            }}
          >
            <LogOut aria-hidden /> Keluar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Sidebar (.pen zIDy5): Samudra, 240 px; drawer content below 900 px. On desktop it can collapse
 * to an icon rail (not in the mockup); labels stay in the accessibility tree.
 */
export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  /** Desktop only; the drawer passes nothing and shows no toggle. */
  onToggleCollapse?: () => void;
}) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const sections = navFor(auth.roleView, auth);
  return (
    <nav
      className={['sidebar', collapsed && 'is-collapsed'].filter(Boolean).join(' ')}
      aria-label="Navigasi utama"
    >
      {onToggleCollapse && (
        <button
          type="button"
          className="sidebar__collapse"
          aria-label={collapsed ? 'Luaskan menu' : 'Ciutkan menu'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Luaskan menu' : 'Ciutkan menu'}
          onClick={onToggleCollapse}
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        </button>
      )}
      <div className="sidebar__logo">
        <span className="sidebar__logo-mark" aria-hidden>
          <Landmark />
        </span>
        <span className="sidebar__logo-text">
          <span className="sidebar__app">SIMARIO</span>
          <span className="sidebar__eyebrow">SIMARIO · OIKN</span>
        </span>
      </div>
      {auth.active && (
        <div className="sidebar__switcher">
          <PositionSwitcher onNavigate={onNavigate} />
        </div>
      )}
      <div className="sidebar__nav">
        {sections.map((section, i) => (
          <div key={section.title ?? i} className="sidebar__section">
            {section.title && <p className="sidebar__section-title">{section.title}</p>}
            {section.items.map((item) => {
              const active = isActive(item, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={['nav-item', active && 'nav-item--active'].filter(Boolean).join(' ')}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  onClick={onNavigate}
                >
                  <Icon className="nav-item__icon" aria-hidden />
                  <span className="nav-item__label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <UserBlock onNavigate={onNavigate} />
    </nav>
  );
}
