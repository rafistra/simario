import { BookOpen, ClipboardList, Eye, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  BottomBar,
  Button,
  ConfirmDialog,
  EmptyState,
  FinalizeOperatorButton,
  InlineAlert,
  LoadingRegion,
  SlideOver,
  Skeleton,
  StatusChip,
  Toggle,
  toast,
} from '@/components';
import { finalisePreview, type AssessmentView, type FinalisePreview } from '@/data/api/assessment';
import { assessmentApi } from '@/data/repository';
import { getDb } from '@/data/local/store';
import { QUARTER_ROMAN } from '@/domain/calendar';
import { predicateFor } from '@/domain/scoreBands';
import { PREDICATE_LABEL } from '@/domain/types';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate, formatScore } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { useSaving } from '@/lib/useSaving';
import { now } from '@/state/clock';
import { AssessmentRow, type RowActions } from './AssessmentRow';
import './Assessment.css';

const tw = (n: number) => `TW ${QUARTER_ROMAN[n - 1]}`;
const hhmm = (iso: string) => iso.slice(11, 16).replace(':', '.');

/** /jabatan/:jid/penilaian/:ta/:tw — FR-NIL-001 … 012. */
export default function AssessmentPage() {
  const { position, unitCode, fiscalYear, quarter } = useOutletContext<WorkspaceOutletContext>();
  usePageMeta(['Penilaian Triwulan', `${position.name} · ${unitCode}`]);
  const [blind, setBlind] = useState(false);
  const q = useQuery(
    () => assessmentApi.page(position.id, fiscalYear, quarter, blind),
    [position.id, fiscalYear, quarter, blind],
  );

  if (q.loading && !q.data) return <AssessmentSkeleton />;
  if (q.error && !q.data)
    return (
      <InlineAlert variant="error" title="Penilaian gagal dimuat" onRetry={q.retry}>
        {q.error.message}
      </InlineAlert>
    );
  return <Assessment view={q.data!} blind={blind} setBlind={setBlind} />;
}

function Assessment({
  view,
  blind,
  setBlind,
}: {
  view: AssessmentView;
  blind: boolean;
  setBlind: (b: boolean) => void;
}) {
  const { saving, failed, run } = useSaving();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [unscoredOnly, setUnscoredOnly] = useState(false);
  const [guide, setGuide] = useState(false);
  const [preview, setPreview] = useState<FinalisePreview | null>(null);
  const [finalising, setFinalising] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [blindAsk, setBlindAsk] = useState(false);
  const [gaps, setGaps] = useState<string[] | null>(null);
  const qv = view.quarter;
  const label = tw(qv.number);
  const own = view.ownPositionId;

  const save = async (p: Promise<unknown>) => {
    const r = await run(p.then(() => true));
    if (r !== undefined) setSavedAt(now());
    return r;
  };
  const actions: RowActions = {
    predicateOf: (score) => predicateFor(score, view.bands),
    saveCell: (rqId, pos, patch) => void save(assessmentApi.saveCell(rqId, pos, patch)),
    addFiles: (rqId, pos, files) => void save(assessmentApi.addFiles(rqId, pos, files)),
    removeFile: (id) => void save(assessmentApi.removeFile(id)),
    reopen: (id) =>
      void run(
        assessmentApi.reopen(id).then(() => true),
        'Penilaian belum dibuka kembali',
      ).then((r) => r && toast.success('Penilaian dibuka kembali')),
    saveExplanation: (id, patch) => void save(assessmentApi.saveExplanation(id, patch)),
  };

  if (!view.published)
    return (
      <EmptyState
        icon={ClipboardList}
        title={`Register TA ${qv.fiscalYear} belum diterbitkan.`}
        message="Penilaian triwulan tersedia setelah register jabatan ini diterbitkan."
      />
    );

  const rows = unscoredOnly
    ? view.rows.filter((r) => {
        const c = r.cells.find((x) => x.own);
        return (
          c &&
          !c.assessment?.score &&
          !c.assessment?.notRelevant &&
          c.assessment?.status !== 'final'
        );
      })
    : view.rows;
  const editingMode = view.mode !== 'reader' && view.windowOpen && !view.archived;
  const editableExpl = view.rows.flatMap((r) => r.explanations.filter((e) => e.editable));
  const complete = (e: (typeof editableExpl)[number]) =>
    !!e.result.explanationReason?.trim() && !!e.result.explanationPlan?.trim();
  // Sendable = filled in; mandatory ones still empty are listed when the button is pressed (§2.4).
  const explanationIds = editableExpl.filter(complete).map((e) => e.result.id);
  const missingExpl = editableExpl.filter((e) => e.result.explanationRequired && !complete(e));
  const ownOverdue =
    view.mode === 'lini3' && view.rows.some((r) => r.cells.find((c) => c.own)?.overdue);

  const openFinalise = () => {
    if (!own) return;
    const p = finalisePreview(getDb(), view.positionId, qv, own, now());
    if (p.missingReason.length) {
      setGaps(p.missingReason);
      return;
    }
    if (p.toFinalise === 0) {
      toast.error(
        'Belum ada yang dapat dituntaskan',
        'Isi skor atau nyatakan "Belum relevan" beserta alasannya terlebih dahulu.',
      );
      return;
    }
    setGaps(null);
    setPreview(p);
  };
  const confirmFinalise = async () => {
    if (!own) return;
    setFinalising(true);
    const r = await run(
      assessmentApi.finalise(view.positionId, qv.id, own),
      'Penilaian belum dituntaskan',
    );
    setFinalising(false);
    setPreview(null);
    if (r) toast.success(`${r.toFinalise} risiko dituntaskan untuk ${label}`);
  };
  const markReady = async () => {
    if (!own) return;
    const n = await run(
      assessmentApi.markReady(view.positionId, qv.id, own),
      'Gagal menandai siap',
    );
    if (n)
      toast.success(
        `${n} risiko ditandai siap`,
        `${view.officialName ?? 'Pejabat'} diberi tahu untuk menuntaskan.`,
      );
  };
  const sendExplanations = async () => {
    setSending(true);
    try {
      const n = await assessmentApi.sendExplanations(view.positionId, explanationIds);
      toast.success(`${n} penjelasan dikirim`);
      setSendOpen(false);
    } catch (e) {
      toast.error('Penjelasan belum dikirim', (e as Error).message);
      setSendOpen(false);
    } finally {
      setSending(false);
    }
  };
  const markExplReady = async () => {
    const r = await run(
      assessmentApi
        .markExplanationsReady(
          view.positionId,
          editableExpl
            .filter((e) => e.result.explanationRequired || complete(e))
            .map((e) => e.result.id),
        )
        .then(() => true),
      'Penjelasan belum ditandai siap',
    );
    if (r)
      toast.success(
        'Penjelasan ditandai siap',
        `${view.officialName ?? 'Pejabat'} dapat mengirimnya.`,
      );
  };

  const bandsText = view.bands
    .map(
      (b) =>
        `${b.lowerExclusive === null ? '0,0' : formatScore(b.lowerExclusive + 0.1)}–${formatScore(b.upperInclusive)} ${PREDICATE_LABEL[b.predicate].replace(' Terkendali', '')}`,
    )
    .join(' · ');
  const p = view.progress;
  const explCount = view.explanations.pending + view.explanations.ready;

  return (
    <div className="assess">
      <HeaderStrip view={view} />

      {view.mode !== 'reader' && !view.windowOpen && (
        <InlineAlert
          variant="info"
          title={`Penilaian ${label} dibuka mulai ${formatDate(view.opensOn)}`}
        >
          Halaman ini hanya dapat dibaca sampai jendela penilaian dibuka. Jendela tidak memiliki
          tanggal tutup; keterlambatan dicatat, tidak dikunci.
        </InlineAlert>
      )}
      {ownOverdue && (
        <InlineAlert
          variant="warning"
          title={`Tenggat Lini 3 ${label} (${formatDate(qv.lini3Deadline)}) sudah lewat`}
        >
          Penilaian tetap dapat diisi dan dituntaskan. Hasil direktorat Anda untuk tiap risiko
          dibuka saat dituntaskan, dan keterlambatan dicatat per baris.
        </InlineAlert>
      )}
      {view.blind.allowed && !blind && (
        <InlineAlert variant="info" title="Penilaian yang belum dibuka disembunyikan">
          <Button
            variant="secondary"
            icon={Eye}
            className="assess__blind-btn"
            onClick={() => setBlindAsk(true)}
          >
            Lihat penilaian sebelum dibuka
          </Button>
        </InlineAlert>
      )}
      {view.blind.granted && (
        <p className="assess__ribbon" role="status">
          <Eye aria-hidden /> Tampilan buta tercatat di jejak audit · baca saja
        </p>
      )}
      {gaps && (
        <InlineAlert
          variant="error"
          title={`Alasan "Belum relevan" wajib diisi untuk ${gaps.length} risiko`}
        >
          <ul className="assess__gaps">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <div className="assess__toolbar">
        <div>
          <p className="assess__count">
            {view.rows.length} risiko dinilai pada {label}
          </p>
          <p className="assess__bands t-mono">
            Pita skor: {bandsText}
            {view.bandVersionNumber ? ` (versi ${view.bandVersionNumber})` : ''}{' '}
            <button
              type="button"
              className="text-link assess__guide"
              onClick={() => setGuide(true)}
            >
              <BookOpen aria-hidden /> Panduan skoring
            </button>
          </p>
        </div>
        {editingMode && (
          <Toggle label="Belum dinilai saja" checked={unscoredOnly} onChange={setUnscoredOnly} />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            unscoredOnly
              ? 'Semua risiko sudah dinilai'
              : `Tidak ada risiko yang dinilai pada ${label}`
          }
          message={
            unscoredOnly
              ? 'Matikan "Belum dinilai saja" untuk melihat semua baris.'
              : 'Risiko dinilai mulai triwulan register diterbitkan.'
          }
        />
      ) : (
        <div className="assess__list">
          {rows.map((r) => (
            <AssessmentRow key={r.rq.id} row={r} actions={actions} tw={label} />
          ))}
        </div>
      )}

      {editingMode && own && (
        <BottomBar
          autosave={
            saving
              ? { state: 'saving' }
              : failed
                ? { state: 'error' }
                : savedAt
                  ? { state: 'saved', time: hhmm(savedAt) }
                  : null
          }
          progress={
            <>
              {p.finalised} dari {p.total} dituntaskan · {p.unscored} belum dinilai
              {explCount > 0 &&
                ` · ${explCount} penjelasan wajib${view.explanations.nearestDue ? ` · tenggat ${formatDate(view.explanations.nearestDue)}` : ''}`}
            </>
          }
          progressTone={explCount > 0 ? 'danger' : 'default'}
        >
          {view.isOperator && editableExpl.length > 0 && (
            <Button variant="secondary" onClick={markExplReady}>
              Tandai Penjelasan Siap
            </Button>
          )}
          {view.isOperator && (
            <Button variant="secondary" onClick={markReady}>
              Tandai Siap
            </Button>
          )}
          {view.isOperator && (
            <FinalizeOperatorButton
              label="Tuntaskan Penilaian"
              officialName={view.officialName ?? 'Pejabat'}
            />
          )}
          {view.canFinalise && editableExpl.length > 0 && (
            <Button
              variant="secondary"
              icon={Send}
              onClick={() => {
                if (explanationIds.length === 0) {
                  toast.error(
                    'Penjelasan belum lengkap',
                    `Isi Alasan/Kendala dan Rencana Tindak Lanjut untuk ${missingExpl.length} penjelasan wajib.`,
                  );
                  return;
                }
                setSendOpen(true);
              }}
            >
              Kirim Penjelasan ({explanationIds.length})
            </Button>
          )}
          {view.canFinalise && <Button onClick={openFinalise}>Tuntaskan Penilaian</Button>}
        </BottomBar>
      )}

      <ConfirmDialog
        open={!!preview}
        title={`Tuntaskan penilaian ${label}?`}
        confirmLabel="Tuntaskan Penilaian"
        confirming={finalising}
        onConfirm={confirmFinalise}
        onCancel={() => setPreview(null)}
      >
        {preview && (
          <>
            <p>
              {preview.toFinalise} risiko akan dituntaskan. {preview.unscored} risiko belum dinilai
              dan tetap dapat diisi sampai perbandingannya dibuka.
            </p>
            {preview.noEvidence.length > 0 && (
              <div className="assess__flags">
                <p className="t-body-strong">
                  {preview.noEvidence.length} risiko tanpa bukti — tetap dituntaskan dengan penanda
                </p>
                <ul>
                  {preview.noEvidence.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="assess__muted">
              Keterlambatan ditetapkan per risiko saat ini dan tidak dihitung ulang.
            </p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={sendOpen}
        title={`Kirim ${explanationIds.length} penjelasan?`}
        confirmLabel="Kirim Penjelasan"
        confirming={sending}
        onConfirm={sendExplanations}
        onCancel={() => setSendOpen(false)}
      >
        Penjelasan yang dikirim tidak dapat diubah. Lini 2 yang ditugaskan dan direktorat Lini 3
        terkait akan diberi tahu.
        {missingExpl.length > 0 &&
          ` ${missingExpl.length} penjelasan wajib lain belum lengkap dan tetap dapat dikirim kemudian.`}
      </ConfirmDialog>

      <ConfirmDialog
        open={blindAsk}
        title="Lihat penilaian sebelum dibuka?"
        confirmLabel="Lihat dan Catat"
        onConfirm={async () => {
          const ok = await run(
            assessmentApi.logBlindView(view.positionId, qv.id).then(() => true),
            'Tampilan tidak dapat dibuka',
          );
          setBlindAsk(false);
          if (ok) setBlind(true);
        }}
        onCancel={() => setBlindAsk(false)}
      >
        Melihat penilaian sebelum perbandingan dibuka akan tercatat di jejak audit.
      </ConfirmDialog>

      <SlideOver
        open={guide}
        eyebrow={`Pita skor versi ${view.bandVersionNumber ?? '—'}`}
        title="Panduan skoring"
        onClose={() => setGuide(false)}
      >
        <div className="guide">
          {view.bands.map((b) => (
            <section key={b.order} className="guide__band">
              <p className="t-mono guide__range">
                {b.lowerExclusive === null ? '0,0' : formatScore(b.lowerExclusive + 0.1)}–
                {formatScore(b.upperInclusive)} · {PREDICATE_LABEL[b.predicate]}
              </p>
              <p>{b.guidance || 'Belum ada panduan untuk predikat ini.'}</p>
            </section>
          ))}
        </div>
      </SlideOver>
    </div>
  );
}

const STATUS = {
  waiting: { kind: 'menunggu', label: 'Menunggu' },
  partial: { kind: 'terbuka-sebagian', label: 'Terbuka sebagian' },
  open: { kind: 'terbuka', label: 'Terbuka' },
} as const;

/** AssessmentHeaderStrip (.pen X4WpN). */
function HeaderStrip({ view }: { view: AssessmentView }) {
  const q = view.quarter;
  const today = now().slice(0, 10);
  return (
    <section className="hstrip" aria-label={`Penilaian ${tw(q.number)} ${q.fiscalYear}`}>
      <div className="hstrip__cell">
        <p className="t-eyebrow">Triwulan · TA {q.fiscalYear}</p>
        <nav className="hstrip__tabs" aria-label="Pilih triwulan">
          {view.quarters.map((x) => (
            <Link
              key={x.id}
              to={`/jabatan/${view.positionId}/penilaian/${x.fiscalYear}/${x.number}`}
              className={['hstrip__tab', x.id === q.id && 'is-active'].filter(Boolean).join(' ')}
              aria-current={x.id === q.id ? 'page' : undefined}
            >
              {tw(x.number)}
            </Link>
          ))}
        </nav>
      </div>
      <div className="hstrip__cell">
        <p className="t-eyebrow">Tenggat Lini 1</p>
        <p className="hstrip__date">{formatDate(q.lini1Deadline)}</p>
        <p className="hstrip__meta">
          Dibuka {formatDate(q.lini1OpensOn)}
          {today > q.lini1Deadline ? ' · tenggat lewat' : ''}
        </p>
      </div>
      <div className="hstrip__cell">
        <p className="t-eyebrow">Tenggat Lini 3</p>
        <p className="hstrip__date">{formatDate(q.lini3Deadline)}</p>
        <p className="hstrip__meta">
          Dibuka {formatDate(q.lini3OpensOn)}
          {today > q.lini3Deadline ? ' · tenggat lewat' : ''}
        </p>
      </div>
      <div className="hstrip__cell">
        <p className="t-eyebrow">Perbandingan</p>
        <StatusChip status={STATUS[view.status].kind} label={STATUS[view.status].label} />
        <p className="hstrip__meta">
          {view.counts.open} terbuka · {view.counts.partial} sebagian · {view.counts.waiting}{' '}
          menunggu
        </p>
      </div>
    </section>
  );
}

function AssessmentSkeleton() {
  return (
    <LoadingRegion label="Memuat penilaian…">
      <div className="assess">
        <Skeleton height={96} radius="lg" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={150} radius="lg" />
        ))}
      </div>
    </LoadingRegion>
  );
}
