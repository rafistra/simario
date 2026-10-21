import { ClipboardList, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  EmptyState,
  FilterPills,
  InlineAlert,
  LoadingRegion,
  MarkerBadge,
  Select,
  Skeleton,
  Toggle,
  type MarkerKind,
} from '@/components';
import type { BoardMarker, BoardRow, BoardView } from '@/data/api/board';
import { boardApi, preferenceApi, useBoardRevision } from '@/data/repository';
import { QUARTER_ROMAN } from '@/domain/calendar';
import { RISK_TYPE_LABEL, RISK_TYPES, type RiskType } from '@/domain/types';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { usePageMeta } from '@/layout/pageMeta';
import { formatRelative } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { useNow } from '@/state/clock';
import { useAuth } from '@/state/useAuth';
import { PredicateChips } from './PredicateChips';
import './Board.css';

interface Filters {
  stage: string;
  riskType: string;
  markers: BoardMarker[];
  unseen: boolean;
}

const EMPTY: Filters = { stage: '', riskType: '', markers: [], unseen: false };

const MARKER_LABEL: Record<BoardMarker, string> = {
  'belum-langkah': 'Belum ada langkah',
  'tidak-sesuai': 'Tidak Sesuai',
  berulang: 'Berulang',
  'tanpa-mitigasi': 'Tanpa mitigasi',
  nonaktif: 'Nonaktif',
};

/** /jabatan/:jid/papan/:ta — FR-PPN-001, FR-PPN-009. */
export default function BoardPage() {
  const { position, unitCode, fiscalYear } = useOutletContext<WorkspaceOutletContext>();
  usePageMeta(['Papan Risiko', `${position.name} · ${unitCode}`]);
  const auth = useAuth();
  const prefKey = `papan:${position.id}`;
  const [filters, setFiltersState] = useState<Filters>(() => ({
    ...EMPTY,
    ...(preferenceApi.get<Filters>(auth.user.id, prefKey) ?? {}),
  }));
  const setFilters = (f: Filters) => {
    setFiltersState(f);
    preferenceApi.set(auth.user.id, prefKey, f);
  };
  const revision = useBoardRevision((s) => s.revision);
  const q = useQuery(
    () => boardApi.board(position.id, fiscalYear),
    [position.id, fiscalYear, auth.user.id, revision],
  );
  const isLini1Holder = auth.holdings.some((h) => h.positionId === position.id);

  if (q.loading && !q.data) return <BoardSkeleton />;
  if (q.error && !q.data)
    return (
      <InlineAlert variant="error" title="Papan risiko gagal dimuat" onRetry={q.retry}>
        {q.error.message}
      </InlineAlert>
    );
  const view = q.data!;
  if (!view.published)
    return (
      <EmptyState
        icon={ClipboardList}
        title={`Register TA ${fiscalYear} belum diterbitkan.`}
        message={
          isLini1Holder
            ? 'Risiko tampil di papan setelah register diterbitkan.'
            : `Papan akan terisi setelah ${position.name} menerbitkan registernya.`
        }
        action={
          isLini1Holder ? (
            <Link
              className="btn btn--primary"
              to={`/jabatan/${position.id}/register/${fiscalYear}`}
            >
              <span>Buka Register</span>
            </Link>
          ) : undefined
        }
      />
    );

  return (
    <BoardList
      view={view}
      filters={filters}
      setFilters={setFilters}
      positionId={position.id}
      fiscalYear={fiscalYear}
    />
  );
}

function BoardList({
  view,
  filters,
  setFilters,
  positionId,
  fiscalYear,
}: {
  view: BoardView;
  filters: Filters;
  setFilters: (f: Filters) => void;
  positionId: string;
  fiscalYear: number;
}) {
  const at = useNow(60_000);
  const navigate = useNavigate();
  const all = view.groups.flatMap((g) => g.types.flatMap((t) => t.rows));
  const match = (row: BoardRow, stageId: string, rt: RiskType) =>
    (!filters.stage || filters.stage === stageId) &&
    (!filters.riskType || filters.riskType === rt) &&
    filters.markers.every((m) => row.markers.includes(m)) &&
    (!filters.unseen || row.unseen);
  const filtering = !!(
    filters.stage ||
    filters.riskType ||
    filters.markers.length ||
    filters.unseen
  );
  const shown = view.groups
    .filter((g) => !filters.stage || g.stage.id === filters.stage)
    .map((g) => ({
      ...g,
      types: g.types
        .filter((t) => !filters.riskType || t.riskType === filters.riskType)
        .map((t) => ({ ...t, rows: t.rows.filter((r) => match(r, g.stage.id, t.riskType)) }))
        .filter((t) => t.rows.length || (!filtering && t.declaration)),
    }))
    .filter((g) => g.types.length || (!filtering && g.notRelevant));
  const shownCount = shown.reduce((n, g) => n + g.types.reduce((m, t) => m + t.rows.length, 0), 0);
  const quarter = view.currentQuarter;
  const markerItems = (Object.keys(MARKER_LABEL) as BoardMarker[]).map((m) => ({
    value: m,
    label:
      m === 'belum-langkah' && quarter
        ? `Belum ada langkah TW ${QUARTER_ROMAN[quarter.number - 1]}`
        : MARKER_LABEL[m],
    count: all.filter((r) => r.markers.includes(m)).length,
  }));

  return (
    <div className="board">
      <div className="board__filters">
        <Select
          label="Tahap"
          value={filters.stage}
          onChange={(e) => setFilters({ ...filters, stage: e.target.value })}
          options={[
            { value: '', label: 'Semua tahap' },
            ...view.groups.map((g) => ({
              value: g.stage.id,
              label: g.stage.active ? `Tahap ${g.index} · ${g.stage.name}` : g.stage.name,
            })),
          ]}
        />
        <Select
          label="Jenis risiko"
          value={filters.riskType}
          onChange={(e) => setFilters({ ...filters, riskType: e.target.value })}
          options={[
            { value: '', label: 'Semua jenis' },
            ...RISK_TYPES.map((t) => ({ value: t, label: RISK_TYPE_LABEL[t] })),
          ]}
        />
        <Toggle
          label="Ada aktivitas baru"
          checked={filters.unseen}
          onChange={(unseen) => setFilters({ ...filters, unseen })}
        />
      </div>
      <div className="board__pills">
        <FilterPills
          label="Penanda"
          items={markerItems}
          selected={filters.markers}
          onToggle={(m) =>
            setFilters({
              ...filters,
              markers: filters.markers.includes(m as BoardMarker)
                ? filters.markers.filter((x) => x !== m)
                : [...filters.markers, m as BoardMarker],
            })
          }
        />
        <span className="board__count t-mono">
          {filtering ? `${shownCount} dari ${all.length} risiko` : `${all.length} risiko`}
          {filtering && (
            <button
              type="button"
              className="text-link board__reset"
              onClick={() => setFilters(EMPTY)}
            >
              Hapus filter
            </button>
          )}
        </span>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Tidak ada risiko yang cocok"
          message="Ubah atau hapus filter untuk melihat risiko lain."
          action={
            <button type="button" className="btn btn--secondary" onClick={() => setFilters(EMPTY)}>
              <span>Hapus filter</span>
            </button>
          }
        />
      ) : (
        <div className="board__table" role="table" aria-label="Papan risiko">
          <div className="board__head" role="row">
            <span role="columnheader">Risiko</span>
            <span role="columnheader">Komentar</span>
            <span role="columnheader">Predikat terakhir dibuka</span>
            <span role="columnheader">Penanda</span>
            <span role="columnheader">Aktivitas</span>
          </div>
          {shown.map((g) => (
            <div key={g.stage.id} role="rowgroup" className="board__stage">
              <div className="board__stage-head" role="row">
                <span role="rowheader">
                  <span className="t-eyebrow">
                    {g.stage.active ? `Tahap ${g.index}` : 'Tahap tidak aktif'}
                  </span>
                  <span className="board__stage-name">{g.stage.name}</span>
                </span>
              </div>
              {g.notRelevant && !filtering ? (
                <p className="board__decl" role="row">
                  <span role="cell">
                    Tahap ini tidak relevan tahun ini — {g.notRelevant.reason}
                  </span>
                </p>
              ) : (
                g.types.map((t) => (
                  <div key={t.riskType} role="rowgroup">
                    <div className="board__type" role="row">
                      <span role="rowheader">
                        {RISK_TYPE_LABEL[t.riskType]}{' '}
                        <span className="t-mono board__type-count">{t.rows.length}</span>
                      </span>
                    </div>
                    {t.declaration && t.rows.length === 0 ? (
                      <p className="board__decl" role="row">
                        <span role="cell">
                          Tidak ada risiko pada jenis ini — {t.declaration.reason}
                        </span>
                      </p>
                    ) : (
                      t.rows.map((row) => (
                        <RiskRow
                          key={row.risk.id}
                          row={row}
                          at={at}
                          href={`/jabatan/${positionId}/papan/${fiscalYear}/risiko/${row.risk.id}`}
                          onOpen={(href) => navigate(href)}
                        />
                      ))
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MARKER_KIND: Record<BoardMarker, MarkerKind> = {
  'belum-langkah': 'belum-langkah',
  'tidak-sesuai': 'tidak-sesuai',
  berulang: 'berulang',
  'tanpa-mitigasi': 'tanpa-mitigasi',
  nonaktif: 'nonaktif',
};

/** BoardRiskRow (.pen k3vfup). The whole row links to the thread. */
function RiskRow({
  row,
  at,
  href,
  onOpen,
}: {
  row: BoardRow;
  at: string;
  href: string;
  onOpen: (href: string) => void;
}) {
  const recurring = row.markers.includes('berulang');
  return (
    <div
      role="row"
      className={[
        'brow',
        recurring && 'is-recurring',
        row.risk.status === 'inactive' && 'is-inactive',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) onOpen(href);
      }}
    >
      <span role="cell" className="brow__risk">
        <span
          className={['brow__dot', row.unseen && 'is-on'].filter(Boolean).join(' ')}
          aria-hidden
        />
        <span className="brow__titles">
          <Link to={href} className="brow__title">
            {row.risk.descriptionSnapshot}
            {row.unseen && <span className="sr-only"> (ada aktivitas baru)</span>}
          </Link>
          <span className="brow__meta">
            {row.mitigations} mitigasi{row.risk.isCustom ? ' · risiko sendiri' : ''}
          </span>
        </span>
      </span>
      <span
        role="cell"
        className="brow__counts"
        aria-label={`Komentar Lini 1 ${row.counts[1]}, Lini 2 ${row.counts[2]}, Lini 3 ${row.counts[3]}`}
      >
        {([1, 2, 3] as const).map((l) => (
          <span key={l} className={`lcount lcount--l${l}`}>
            <span>L{l}</span>
            {row.counts[l]}
          </span>
        ))}
      </span>
      <span role="cell" className="brow__preds">
        <span className="brow__mlabel">Predikat terakhir dibuka</span>
        <PredicateChips chips={row.opened?.chips ?? []} hidden={row.opened?.hidden} />
        {row.opened && !row.opened.hidden && (
          <span className="brow__qlabel t-mono">
            TW {QUARTER_ROMAN[row.opened.quarter.number - 1]} {row.opened.quarter.fiscalYear}
          </span>
        )}
      </span>
      <span role="cell" className="brow__markers">
        {row.markers.length === 0 ? (
          <span className="brow__none">—</span>
        ) : (
          row.markers.map((m) => (
            <MarkerBadge
              key={m}
              kind={MARKER_KIND[m]}
              label={
                m === 'nonaktif'
                  ? (row.inactiveLabel ?? undefined)
                  : m === 'belum-langkah'
                    ? 'Belum ada langkah triwulan ini'
                    : undefined
              }
            />
          ))
        )}
      </span>
      <span role="cell" className="brow__activity t-mono">
        {row.lastActivity ? formatRelative(row.lastActivity, at) : 'Belum ada'}
      </span>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <LoadingRegion label="Memuat papan risiko…">
      <div className="board">
        <div className="board__filters">
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} width={180} />
        </div>
        <div className="board__table">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="brow brow--skeleton">
              <Skeleton height={16} width="70%" />
              <Skeleton height={16} width={110} />
              <Skeleton height={16} width={220} />
              <Skeleton height={16} width={140} />
              <Skeleton height={16} width={80} />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
