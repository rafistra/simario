import { Check, ChevronDown, ExternalLink, History as HistoryIcon, Printer, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  EmptyState,
  FilterPills,
  InlineAlert,
  LoadingRegion,
  MarkerBadge,
  PredicateBadge,
  Select,
  Skeleton,
  SlideOver,
} from '@/components';
import type { ChipView, HistoryCell, HistoryRow, HistoryView } from '@/data/api/history';
import { historyApi } from '@/data/repository';
import { QUARTER_ROMAN } from '@/domain/calendar';
import type { LembarMutu } from '@/domain/rules/sheets';
import { PREDICATE_INITIAL as SHORT, RISK_TYPE_LABEL, RISK_TYPES } from '@/domain/types';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate, formatDateTime, formatScore } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import './History.css';

const tw = (n: number) => `TW ${QUARTER_ROMAN[n - 1]}`;

/** /jabatan/:jid/riwayat — FR-RWY-001 … 006. */
export default function HistoryPage() {
  const { position, unitCode, fiscalYear } = useOutletContext<WorkspaceOutletContext>();
  usePageMeta(['Riwayat Risiko', `${position.name} · ${unitCode}`]);
  const q = useQuery(() => historyApi.history(position.id, fiscalYear), [position.id, fiscalYear]);
  if (q.loading && !q.data)
    return (
      <LoadingRegion label="Memuat riwayat…">
        <div className="history">
          <Skeleton height={200} radius="lg" />
          <Skeleton height={360} radius="lg" />
        </div>
      </LoadingRegion>
    );
  if (q.error && !q.data)
    return (
      <InlineAlert variant="error" title="Riwayat gagal dimuat" onRetry={q.retry}>
        {q.error.message}
      </InlineAlert>
    );
  return <History view={q.data!} positionId={position.id} />;
}

function History({ view, positionId }: { view: HistoryView; positionId: string }) {
  const [stage, setStage] = useState('');
  const [type, setType] = useState('');
  const [pills, setPills] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{ row: HistoryRow; cell: HistoryCell; year: number } | null>(
    null,
  );
  if (!view.published)
    return (
      <EmptyState
        icon={HistoryIcon}
        title={`Register TA ${view.fiscalYear} belum diterbitkan.`}
        message="Riwayat penilaian tampil setelah register diterbitkan dan triwulan pertama dinilai."
      />
    );

  const rows = view.rows.filter(
    (r) =>
      (!stage || r.stage.id === stage) &&
      (!type || r.riskType === type) &&
      (!pills.includes('tidak-sesuai') || r.tidakSesuai) &&
      (!pills.includes('berulang') || r.recurring),
  );
  const lastQ = [...view.mutu].reverse().find((m) => m.anyOpened);

  return (
    <div className="history">
      <MutuBlock mutu={view.mutu} />
      {lastQ && (
        <Link
          className="history__print"
          to={`/jabatan/${positionId}/lembar/${view.fiscalYear}/${lastQ.quarter.number}`}
        >
          <Printer aria-hidden /> Cetak Lembar Mutu {tw(lastQ.quarter.number)}
        </Link>
      )}

      <section className="matrix" aria-labelledby="matrix-title">
        <header className="matrix__top">
          <div>
            <p className="t-eyebrow">Riwayat · TA {view.fiscalYear}</p>
            <h2 id="matrix-title" className="matrix__title">
              Penilaian per risiko
            </h2>
          </div>
          <div className="matrix__legend" aria-label="Keterangan">
            <PredicateBadge predicate="terkendali" />
            <PredicateBadge predicate="cukup" />
            <PredicateBadge predicate="kurang" />
            <span className="matrix__legend-text">
              ✓ Sesuai · ✕ Tidak Sesuai · Menunggu = belum dibuka · — = tidak dinilai
            </span>
          </div>
        </header>
        <div className="matrix__filters">
          <Select
            label="Tahap"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            options={[
              { value: '', label: 'Semua tahap' },
              ...view.stages.map((s) => ({ value: s.id, label: s.label })),
            ]}
          />
          <Select
            label="Jenis risiko"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { value: '', label: 'Semua jenis' },
              ...RISK_TYPES.map((t) => ({ value: t, label: RISK_TYPE_LABEL[t] })),
            ]}
          />
          <FilterPills
            label="Saring"
            items={[
              {
                value: 'tidak-sesuai',
                label: 'Hanya Tidak Sesuai',
                count: view.rows.filter((r) => r.tidakSesuai).length,
              },
              {
                value: 'berulang',
                label: 'Hanya Berulang',
                count: view.rows.filter((r) => r.recurring).length,
              },
            ]}
            selected={pills}
            onToggle={(v) =>
              setPills((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
            }
          />
        </div>
        <div
          className="matrix__table"
          role="table"
          aria-label={`Riwayat penilaian TA ${view.fiscalYear}`}
        >
          <div className="matrix__head" role="row">
            <span role="columnheader">Risiko</span>
            {view.quarters.map((q) => (
              <span key={q.id} role="columnheader">
                {tw(q.number)}
              </span>
            ))}
          </div>
          {rows.length === 0 && (
            <p className="matrix__empty">Tidak ada risiko yang cocok dengan filter.</p>
          )}
          {rows.map((r, i) => {
            const groupStart =
              i === 0 ||
              rows[i - 1]!.stage.id !== r.stage.id ||
              rows[i - 1]!.riskType !== r.riskType;
            const open = expanded.has(r.risk.id);
            return (
              <div key={r.risk.id} role="rowgroup">
                {groupStart && (
                  <p className="matrix__group" role="row">
                    <span role="rowheader">
                      {r.stage.active ? `Tahap ${r.stageIndex} · ${r.stage.name}` : r.stage.name} ›{' '}
                      {RISK_TYPE_LABEL[r.riskType]}
                    </span>
                  </p>
                )}
                <div
                  role="row"
                  className={[
                    'mrow',
                    r.recurring && 'is-recurring',
                    r.inactiveLabel && 'is-inactive',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span role="rowheader" className="mrow__risk">
                    <span className="mrow__desc">{r.risk.descriptionSnapshot}</span>
                    {r.inactiveLabel && <MarkerBadge kind="nonaktif" label={r.inactiveLabel} />}
                    {r.otherYears.length > 0 && (
                      <button
                        type="button"
                        className="mrow__years"
                        aria-expanded={open}
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            if (open) n.delete(r.risk.id);
                            else n.add(r.risk.id);
                            return n;
                          })
                        }
                      >
                        <HistoryIcon aria-hidden /> Ada riwayat di TA{' '}
                        {r.otherYears.map((o) => o.fiscalYear).join(', ')} ·{' '}
                        {open ? 'Sembunyikan' : 'Tampilkan lintas tahun'}
                        <ChevronDown aria-hidden className={open ? 'is-open' : undefined} />
                      </button>
                    )}
                  </span>
                  {r.cells.map((c) => (
                    <MatrixCell
                      key={c.quarter.id}
                      cell={c}
                      onOpen={() => setDetail({ row: r, cell: c, year: view.fiscalYear })}
                    />
                  ))}
                </div>
                {open &&
                  r.otherYears.map((o) => (
                    <div key={o.fiscalYear} role="row" className="mrow mrow--lineage">
                      <span role="rowheader" className="mrow__risk">
                        <span className="mrow__year t-mono">TA {o.fiscalYear}</span>
                        <span className="mrow__desc">{o.risk.descriptionSnapshot}</span>
                      </span>
                      {o.cells.map((c) => (
                        <MatrixCell
                          key={c.quarter.id}
                          cell={c}
                          onOpen={() =>
                            setDetail({ row: { ...r, risk: o.risk }, cell: c, year: o.fiscalYear })
                          }
                        />
                      ))}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </section>

      <SlideOver
        open={!!detail}
        eyebrow={detail ? `${tw(detail.cell.quarter.number)} · TA ${detail.year}` : ''}
        title={detail?.row.risk.descriptionSnapshot ?? ''}
        onClose={() => setDetail(null)}
      >
        {detail && <CellDetail cell={detail.cell} year={detail.year} />}
      </SlideOver>
    </div>
  );
}

/** MatrixCell (.pen tpjOu). */
function MatrixCell({ cell: c, onOpen }: { cell: HistoryCell; onOpen: () => void }) {
  if (c.state === 'none')
    return (
      <span
        role="cell"
        className="mcell is-none"
        data-label={tw(c.quarter.number)}
        aria-label="Tidak dinilai pada triwulan ini"
      >
        —
      </span>
    );
  if (c.state === 'waiting')
    return (
      <span role="cell" className="mcell is-waiting" data-label={tw(c.quarter.number)}>
        Menunggu
      </span>
    );
  return (
    <span role="cell" className="mcell" data-label={tw(c.quarter.number)}>
      <button
        type="button"
        className="mcell__btn"
        onClick={onOpen}
        aria-label={`Detail ${tw(c.quarter.number)}`}
      >
        {c.chips.map((ch) => (
          <MiniChip key={ch.positionId} chip={ch} />
        ))}
      </button>
    </span>
  );
}

function MiniChip({ chip }: { chip: ChipView }) {
  const a = chip.assessment;
  const pred = chip.kind === 'score' ? a?.predicate : null;
  return (
    <span className={`mchip ${pred ? `mchip--${pred}` : 'mchip--none'}`}>
      <span className="mchip__who">{chip.label}</span>
      {chip.kind === 'menunggu' && 'Menunggu'}
      {chip.kind === 'belum_relevan' && 'Belum relevan'}
      {chip.kind === 'tidak_dinilai' && 'Tidak dinilai'}
      {chip.kind === 'score' && a?.score !== null && a?.score !== undefined && (
        <>
          <span className="t-mono">{formatScore(a.score)}</span>
          {pred && <span className="mchip__pred">{SHORT[pred]}</span>}
        </>
      )}
      {chip.result?.result === 'sesuai' && <Check aria-label="Sesuai" />}
      {chip.result?.result === 'tidak_sesuai' && <X aria-label="Tidak Sesuai" />}
    </span>
  );
}

function CellDetail({ cell, year }: { cell: HistoryCell; year: number }) {
  return (
    <div className="cdetail">
      {cell.recurring && <MarkerBadge kind="berulang" />}
      {cell.chips.map((ch) => {
        const a = ch.assessment;
        const r = ch.result;
        return (
          <section key={ch.positionId} className="cdetail__block">
            <p className="t-eyebrow">
              Lini {ch.line} · {ch.name}
            </p>
            {ch.kind === 'menunggu' ? (
              <p className="cdetail__muted">Hasil direktorat ini belum dibuka.</p>
            ) : ch.kind === 'tidak_dinilai' ? (
              <p className="cdetail__muted">
                {ch.line === 1 ? 'Tidak dinilai Lini 1' : `Tidak dinilai ${ch.name}`}
              </p>
            ) : ch.kind === 'belum_relevan' ? (
              <>
                <p className="cdetail__strong">Belum relevan</p>
                {a?.notRelevantReason && <p className="cdetail__note">{a.notRelevantReason}</p>}
              </>
            ) : (
              <p className="cdetail__score">
                <span className="t-mono">{formatScore(a?.score)}</span>
                {a?.predicate && <PredicateBadge predicate={a.predicate} />}
                {r?.result === 'sesuai' && <MarkerBadge kind="sesuai" />}
                {r?.result === 'tidak_sesuai' && <MarkerBadge kind="tidak-sesuai" />}
              </p>
            )}
            {a?.note && <p className="cdetail__note">“{a.note}”</p>}
            {a?.finalisedAt && (
              <p className="cdetail__meta">
                Dituntaskan {formatDateTime(a.finalisedAt)}
                {a.lateness === 'terlambat' && <MarkerBadge kind="terlambat" />}
                {a.lateness === 'sangat_terlambat' && <MarkerBadge kind="sangat-terlambat" />}
                {a.flags.includes('no_evidence') && <MarkerBadge kind="tanpa-bukti" />}
              </p>
            )}
            {r?.result === 'tidak_sesuai' && (
              <div className="cdetail__expl">
                <p className="t-eyebrow">Penjelasan Lini 1</p>
                {r.explanationStatus === 'sent' ? (
                  <>
                    <p>
                      <strong>Alasan/Kendala:</strong> {r.explanationReason}
                    </p>
                    <p>
                      <strong>Rencana Tindak Lanjut:</strong> {r.explanationPlan}
                    </p>
                    <p className="cdetail__meta">
                      Dikirim {r.explanationSentAt ? formatDateTime(r.explanationSentAt) : ''}
                    </p>
                  </>
                ) : r.explanationStatus === 'not_sent' ? (
                  <p className="cdetail__muted">Tidak dikirim</p>
                ) : (
                  <p className="cdetail__muted">
                    {r.explanationRequired
                      ? 'Penjelasan belum dikirim'
                      : 'Penjelasan opsional belum dikirim'}
                    {r.explanationDueOn ? ` · tenggat ${formatDate(r.explanationDueOn)}` : ''}
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
      <Link
        className="cdetail__thread"
        to={`/jabatan/${cell.positionId}/papan/${year}/risiko/${cell.riskId}`}
      >
        Lihat utas {tw(cell.quarter.number)} <ExternalLink aria-hidden />
      </Link>
    </div>
  );
}

/** Lembar Mutu block (FR-RWY-001, VIS-7). */
function MutuBlock({ mutu }: { mutu: LembarMutu[] }) {
  return (
    <section className="mutu" aria-labelledby="mutu-title">
      <header className="mutu__head">
        <div>
          <p className="t-eyebrow">Lembar Mutu · TA {mutu[0]?.quarter.fiscalYear}</p>
          <h2 id="mutu-title" className="matrix__title">
            Rata-rata skor per jenis risiko
          </h2>
        </div>
        <p className="mutu__note">
          Hanya hasil yang sudah dibuka · Belum relevan & Tidak dinilai dikecualikan
        </p>
      </header>
      <div className="mutu__table" role="table" aria-label="Lembar Mutu">
        <div className="mutu__row mutu__row--head" role="row">
          <span role="columnheader">Jenis risiko</span>
          {mutu.map((m) => (
            <span key={m.quarter.id} role="columnheader">
              {tw(m.quarter.number)}
            </span>
          ))}
        </div>
        {RISK_TYPES.map((rt) => (
          <div key={rt} className="mutu__row" role="row">
            <span role="rowheader" className="mutu__type">
              {RISK_TYPE_LABEL[rt]}
            </span>
            {mutu.map((m) => {
              const row = m.rows.find((x) => x.riskType === rt)!;
              const anyOpen = row.cells.some((c) => c.opened);
              return (
                <span
                  key={m.quarter.id}
                  role="cell"
                  data-label={tw(m.quarter.number)}
                  className={['mutu__cell', !anyOpen && 'is-waiting'].filter(Boolean).join(' ')}
                >
                  {!anyOpen
                    ? 'Menunggu'
                    : row.cells.map((c, i) => (
                        <span key={m.assessors[i]!.positionId} className="mutu__line">
                          <span className="mutu__who t-mono">{m.assessors[i]!.label}</span>
                          {c.average !== null ? (
                            <>
                              <span className="t-mono">{formatScore(c.average)}</span>
                              {c.predicate && (
                                <span className={`mchip__pred mchip--${c.predicate}`}>
                                  {SHORT[c.predicate]}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="mutu__muted">
                              {c.opened ? 'Tidak ada nilai' : 'Menunggu'}
                            </span>
                          )}
                        </span>
                      ))}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mutu__counts">
        {mutu.map((m) =>
          m.anyOpened ? (
            <span key={m.quarter.id}>
              {tw(m.quarter.number)}: {m.sesuai} Sesuai · {m.tidakSesuai} Tidak Sesuai ·{' '}
              {m.berulang} Berulang
              {m.notAssessedL1.length > 0
                ? ` · ${m.notAssessedL1.length} Tidak dinilai Lini 1`
                : ''}
            </span>
          ) : null,
        )}
      </p>
    </section>
  );
}
