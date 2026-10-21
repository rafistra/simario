import { Calendar, ChevronDown } from 'lucide-react';
import { useEffect } from 'react';
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { LineChip } from '@/components';
import { useDb } from '@/data/local/store';
import { canReadPosition, officialsOf, positionLine } from '@/domain/rules/access';
import type { Position } from '@/domain/types';
import { ForbiddenPage, NotFoundPage } from '@/pages/faults/FaultPages';
import { chooseActivePosition } from '@/state/me';
import { useAuth } from '@/state/useAuth';
import { workspacePaths } from './nav';
import './Shell.css';

const TABS = [
  { key: 'papan', label: 'Papan' },
  { key: 'register', label: 'Register' },
  { key: 'penilaian', label: 'Penilaian' },
  { key: 'riwayat', label: 'Riwayat' },
  { key: 'lembar', label: 'Lembar' },
] as const;

export interface WorkspaceOutletContext {
  position: Position;
  unitCode: string;
  fiscalYear: number;
  quarter: number;
}

/** Position workspace (PRD §1.8.1) — header, fiscal-year selector, tabs; guards scope (403/404). */
export function WorkspaceLayout() {
  const { jid = '', ta, tw } = useParams();
  const [search] = useSearchParams();
  const auth = useAuth();
  const db = useDb((s) => s.db);
  const setActive = chooseActivePosition;
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const position = db.positions.find((p) => p.id === jid);
  const held = auth.holdings.some((h) => h.positionId === jid);

  // Visiting a held position's workspace switches the acting holding to it (FR-AUT-009).
  useEffect(() => {
    if (held && auth.active?.positionId !== jid) setActive(jid);
  }, [held, jid, auth.active?.positionId, setActive]);

  // Riwayat has no year segment; its fiscal year travels as ?ta= (FR-RWY-004).
  const fiscalYear = Number(ta ?? search.get('ta') ?? auth.currentFiscalYear);

  // Same copy for unknown ids and ids outside scope would leak nothing; PRD uses 404 for unknown.
  // The read models apply the same check; this only turns it into the 403 page.
  if (!position || positionLine(db, position.id) !== 1) return <NotFoundPage />;
  if (!canReadPosition(db, auth.user.id, jid, auth.today, fiscalYear)) return <ForbiddenPage />;

  const unit = db.orgUnits.find((o) => o.id === position.orgUnitId)!;
  const currentQ = auth.currentQuarter;
  const quarter = Number(tw ?? (currentQ?.fiscalYear === fiscalYear ? currentQ.number : 4));
  const years = [
    ...new Set([
      ...db.registers.filter((r) => r.positionId === jid).map((r) => r.fiscalYear),
      auth.currentFiscalYear,
    ]),
  ].sort((a, b) => b - a);
  const archived = (y: number) => db.fiscalYears.find((f) => f.year === y)?.status === 'archived';
  const officials = officialsOf(db, jid, auth.today);
  const operators = db.delegates
    .filter(
      (d) =>
        d.positionId === jid &&
        d.startDate <= auth.today &&
        (!d.endDate || d.endDate >= auth.today),
    )
    .map((d) => db.users.find((u) => u.id === d.userId)!.fullName);
  const paths = workspacePaths(jid, fiscalYear, quarter);
  const activeTab = TABS.find((t) => pathname.startsWith(`/jabatan/${jid}/${t.key}`))?.key;

  const changeYear = (year: number) => {
    const q = currentQ?.fiscalYear === year ? currentQ.number : 4;
    const next = workspacePaths(jid, year, q);
    navigate(activeTab ? next[activeTab] : next.papan);
  };

  return (
    <div className="workspace">
      <header className="workspace__header">
        <div className="workspace__top">
          <div className="workspace__titles">
            <div className="workspace__eyebrow">
              <span className="t-eyebrow">Workspace jabatan</span>
              <LineChip line={1} />
            </div>
            <h1 className="t-display-lg">{position.name}</h1>
            <p className="workspace__subtitle">
              {unit.name} ({unit.code})
              {officials.length > 0
                ? ` · Pejabat: ${officials.map((o) => o.user.fullName + (officials.length > 1 && o.occupancy.isFiller ? ' (Pengisi)' : '')).join(', ')}`
                : ' · Belum ada Pejabat'}
              {operators.length > 0 && ` · Operator: ${operators.join(', ')}`}
            </p>
          </div>
          <label className="fy-select">
            <span className="sr-only">Tahun anggaran</span>
            <Calendar aria-hidden />
            <select value={fiscalYear} onChange={(e) => changeYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  TA {y}
                  {archived(y) ? ' · Diarsipkan' : ''}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden />
          </label>
        </div>
        <div className="tabs" role="tablist" aria-label="Bagian workspace">
          {TABS.map((t) => (
            <Link
              key={t.key}
              to={paths[t.key]}
              role="tab"
              aria-selected={activeTab === t.key}
              className={['tab', activeTab === t.key && 'tab--active'].filter(Boolean).join(' ')}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </header>
      <Outlet
        context={
          { position, unitCode: unit.code, fiscalYear, quarter } satisfies WorkspaceOutletContext
        }
      />
    </div>
  );
}

/** /jabatan/:jid → the board of the current fiscal year. */
export function WorkspaceRedirect() {
  const { jid } = useParams();
  const auth = useAuth();
  return <Navigate to={`/jabatan/${jid}/papan/${auth.currentFiscalYear}`} replace />;
}
