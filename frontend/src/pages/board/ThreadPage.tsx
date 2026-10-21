import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  BellRing,
  ChevronDown,
  EyeOff,
  History,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  InlineAlert,
  LoadingRegion,
  MarkerBadge,
  PredicateBadge,
  Skeleton,
  StatusChip,
  toast,
} from '@/components';
import type { QuarterCard, QuarterGroup, ThreadComment, ThreadView } from '@/test/fake/api/board';
import { boardApi, threadApi, useBoardRevision } from '@/data/repository';
import { QUARTER_ROMAN } from '@/domain/calendar';
import { RISK_TYPE_LABEL } from '@/domain/types';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate, formatDateTime } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { useNow } from '@/state/clock';
import { useAuth } from '@/state/useAuth';
import { CommentItem } from './CommentItem';
import { Composer, type ComposerSubmit } from './Composer';
import './Thread.css';

const tw = (n: number) => `TW ${QUARTER_ROMAN[n - 1]}`;

/** /jabatan/:jid/papan/:ta/risiko/:rid — FR-PPN-002 … 012. */
export default function ThreadPage() {
  const { position, unitCode, fiscalYear } = useOutletContext<WorkspaceOutletContext>();
  const { rid = '' } = useParams();
  usePageMeta(['Papan Risiko', `${position.name} · ${unitCode}`, 'Utas Risiko']);
  const auth = useAuth();
  const revision = useBoardRevision((s) => s.revision);
  const q = useQuery(() => boardApi.thread(rid), [rid, auth.user.id], revision);

  if (q.loading && !q.data) return <ThreadSkeleton />;
  if (q.error && !q.data)
    return (
      <InlineAlert variant="error" title="Utas gagal dimuat" onRetry={q.retry}>
        {q.error.message}
      </InlineAlert>
    );
  const view = q.data!;
  if (view.positionId !== position.id || view.fiscalYear !== fiscalYear)
    return (
      <InlineAlert variant="error" title="Risiko tidak ditemukan pada papan ini">
        <Link className="text-link" to={`/jabatan/${position.id}/papan/${fiscalYear}`}>
          Kembali ke Papan Risiko
        </Link>
      </InlineAlert>
    );
  return <Thread view={view} positionName={position.name} />;
}

function Thread({ view, positionName }: { view: ThreadView; positionName: string }) {
  const auth = useAuth();
  const at = useNow(30_000);
  const { hash } = useLocation();
  const navigate = useNavigate();
  const risk = view.risk;

  // FR-PPN-011 / NFR-015: comments by others that arrive after the page opened wait behind a banner.
  const allIds = useMemo(
    () =>
      [...view.timeline, ...view.mitigations.flatMap((m) => m.quarters)].flatMap((g) => g.comments),
    [view],
  );
  const [known, setKnown] = useState<Set<string>>(() => new Set(allIds.map((c) => c.id)));
  const fresh = allIds.filter((c) => !known.has(c.id) && !c.isOwn);
  const isShown = (c: ThreadComment) => known.has(c.id) || c.isOwn;
  const [highlight, setHighlight] = useState<string | null>(null);
  const [openMits, setOpenMits] = useState<Set<string>>(() => new Set());
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const firstNew = useRef<string | null>(null);

  // Mark the thread seen on open and whenever shown activity changes.
  const shownCount = allIds.filter(isShown).length;
  useEffect(() => {
    threadApi.markSeen(risk.id);
  }, [risk.id, shownCount]);

  // Deep links: #komentar-:id scrolls and highlights; #mitigasi-:mid opens that sub-thread.
  useEffect(() => {
    if (hash.startsWith('#mitigasi-')) {
      const mid = hash.slice('#mitigasi-'.length);
      setOpenMits((s) => new Set(s).add(mid));
      requestAnimationFrame(() =>
        document.getElementById(`mitigasi-${mid}`)?.scrollIntoView({ block: 'start' }),
      );
    }
    if (hash.startsWith('#komentar-')) {
      const cid = hash.slice('#komentar-'.length);
      const mit = view.mitigations.find((m) =>
        m.quarters.some((g) => g.comments.some((c) => c.id === cid)),
      );
      if (mit) setOpenMits((s) => new Set(s).add(mit.id));
      setHighlight(cid);
      setTimeout(
        () => document.getElementById(`komentar-${cid}`)?.scrollIntoView({ block: 'center' }),
        60,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  const people = useQuery(
    () =>
      view.postingQuarter
        ? threadApi.participants(risk.id, view.postingQuarter.id)
        : Promise.resolve([]),
    [risk.id, view.postingQuarter?.id, auth.user.id],
  );
  const participants = people.data ?? [];
  const canUnset = auth.can(25);

  // NFR-015: poll every 30 s for comments by others (they wait behind the banner); while a
  // file of this viewer is being scanned, check sooner (3 s, backing off to 30 s).
  const scanning = allIds.some((c) => c.attachments.some((a) => a.scanning));
  const latestSeen = allIds.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), '');
  const loadedIds = useMemo(() => new Set(allIds.map((c) => c.id)), [allIds]);
  const scanPolls = useRef(0);
  useEffect(() => {
    if (!scanning) scanPolls.current = 0;
    const delay = scanning
      ? Math.min(3_000 * 2 ** Math.floor(scanPolls.current / 3), 30_000)
      : 30_000;
    const timer = setTimeout(() => {
      if (scanning) {
        scanPolls.current += 1;
        useBoardRevision.getState().bump();
        return;
      }
      void threadApi
        .since(risk.id, latestSeen || '2000-01-01T00:00')
        .then((r) => {
          if (r.commentIds.some((id) => !loadedIds.has(id))) useBoardRevision.getState().bump();
        })
        .catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [risk.id, latestSeen, scanning, loadedIds, view]);
  const canPost = !!view.participation && !!view.postingQuarter && !view.archivedOn;

  const send = (mitigationId: string | null) => async (input: ComposerSubmit) => {
    try {
      const id = await threadApi.post({ riskId: risk.id, mitigationId, ...input });
      setHighlight(id);
      return true;
    } catch (e) {
      toast.error('Komentar belum terkirim', (e as Error).message);
      return false;
    }
  };
  const edit = async (id: string, body: string) => {
    try {
      await threadApi.edit(id, body);
      return true;
    } catch (e) {
      toast.error('Suntingan tidak tersimpan', (e as Error).message);
      return false;
    }
  };
  const confirmWithdraw = async () => {
    if (!withdrawId) return;
    setWithdrawing(true);
    try {
      await threadApi.withdraw(withdrawId);
      toast.success('Komentar ditarik');
      setWithdrawId(null);
    } catch (e) {
      toast.error('Komentar belum ditarik', (e as Error).message);
    } finally {
      setWithdrawing(false);
    }
  };
  const confidential = async (attachmentId: string, on: boolean) => {
    try {
      await threadApi.setConfidential(attachmentId, on);
      toast.success(on ? 'Lampiran ditandai konfidensial' : 'Status konfidensial dimatikan');
    } catch (e) {
      toast.error('Status lampiran tidak berubah', (e as Error).message);
    }
  };
  const follow = async (on: boolean) => {
    try {
      await threadApi.follow(risk.id, on);
      toast.success(on ? 'Anda mengikuti utas ini' : 'Anda berhenti mengikuti utas ini');
    } catch (e) {
      toast.error('Gagal mengubah langganan', (e as Error).message);
    }
  };
  const showFresh = () => {
    firstNew.current = fresh[0]?.id ?? null;
    for (const m of view.mitigations)
      if (fresh.some((c) => m.quarters.some((g) => g.comments.includes(c))))
        setOpenMits((s) => new Set(s).add(m.id));
    setKnown(new Set(allIds.map((c) => c.id)));
    if (firstNew.current) {
      setHighlight(firstNew.current);
      setTimeout(
        () =>
          document
            .getElementById(`komentar-${firstNew.current}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        60,
      );
    }
  };

  const commentProps = {
    at,
    canUnsetConfidential: canUnset,
    onEdit: edit,
    onWithdraw: setWithdrawId,
    onConfidential: confidential,
  };
  const timeline = (groups: QuarterGroup[], compact = false) =>
    groups.map((g) => {
      const comments = g.comments.filter(isShown);
      return (
        <section
          key={g.quarter.id}
          className="tl-quarter"
          aria-label={`${tw(g.quarter.number)} TA ${g.quarter.fiscalYear}`}
        >
          <div className="qdivider">
            <span className="qdivider__label t-mono">
              {tw(g.quarter.number)} · TA {g.quarter.fiscalYear}
            </span>
            <span className="qdivider__line" aria-hidden />
            <span className="qdivider__meta">
              {comments.filter((c) => c.body !== null).length} komentar ·{' '}
              {comments.filter((c) => c.isStep).length} Langkah
            </span>
          </div>
          {!compact &&
            g.events.map((e) => (
              <p key={e.at + e.text} className="tl-event">
                <ShieldCheck aria-hidden /> {e.text} · {formatDate(e.at)}
              </p>
            ))}
          {comments.length === 0 && g.events.length === 0 && (
            <p className="tl-empty">Belum ada komentar pada triwulan ini.</p>
          )}
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              highlighted={highlight === c.id}
              {...commentProps}
            />
          ))}
        </section>
      );
    });

  const composer = (mitigationId: string | null, compact = false) =>
    canPost && view.participation && view.postingQuarter ? (
      <Composer
        key={mitigationId ?? 'risk'}
        holding={view.participation}
        postingQuarter={view.postingQuarter}
        relatedQuarters={view.relatedQuarters}
        participants={participants}
        blindWarning={view.blindWarning}
        storage={view.storage}
        placeholder={mitigationId ? 'Tulis komentar pada mitigasi ini…' : 'Tulis komentar…'}
        compact={compact}
        onSend={send(mitigationId)}
      />
    ) : null;

  const boardUrl = `/jabatan/${view.positionId}/papan/${view.fiscalYear}`;
  const statusLabel = view.archivedOn
    ? 'diarsipkan'
    : risk.status === 'inactive'
      ? 'diarsipkan'
      : 'terbit';

  return (
    <div className="thread">
      <Link className="thread__back" to={boardUrl}>
        <ArrowLeft aria-hidden /> Papan Risiko {positionName} · TA {view.fiscalYear}
      </Link>

      {view.archivedOn && (
        <InlineAlert
          variant="info"
          title={`Utas ini diarsipkan pada ${formatDate(view.archivedOn)}`}
        >
          Utas hanya dapat dibaca. Lampiran tetap dapat diunduh sesuai cakupan Anda.
          {view.nextUrl && (
            <>
              {' '}
              <Link className="text-link" to={view.nextUrl}>
                Lanjutan di TA {view.fiscalYear + 1}
              </Link>
            </>
          )}
        </InlineAlert>
      )}

      <header className="thread__header">
        <div className="thread__titles">
          <p className="t-eyebrow">
            Tahap {view.stageIndex} · {view.stage.name} · {RISK_TYPE_LABEL[risk.riskType]}
          </p>
          <h2 className="thread__title">{risk.descriptionSnapshot}</h2>
          <div className="thread__chips">
            <StatusChip
              status={statusLabel}
              label={
                view.archivedOn ? 'Diarsipkan' : risk.status === 'inactive' ? 'Nonaktif' : 'Aktif'
              }
            />
            {view.inactiveLabel && <MarkerBadge kind="nonaktif" label={view.inactiveLabel} />}
            {view.quiet && (
              <MarkerBadge kind="belum-langkah" label="Belum ada langkah triwulan ini" />
            )}
            {view.tidakSesuai && <MarkerBadge kind="tidak-sesuai" />}
            {view.recurring && <MarkerBadge kind="berulang" />}
            {risk.flags.includes('no_mitigation') && <MarkerBadge kind="tanpa-mitigasi" />}
            <span className="thread__meta t-mono">
              {risk.publishedAt ? `Diterbitkan ${formatDate(risk.publishedAt)}` : ''}
              {view.publishedBy ? ` oleh ${view.publishedBy}` : ''} · {view.mitigations.length}{' '}
              mitigasi
              {risk.isCustom ? ' · risiko sendiri' : ''}
            </span>
            {view.previousUrl && (
              <Link className="thread__link" to={view.previousUrl}>
                <History aria-hidden /> Riwayat TA sebelumnya
              </Link>
            )}
          </div>
          {risk.status === 'inactive' && risk.deactivationReason && (
            <p className="thread__reason">Alasan penonaktifan: {risk.deactivationReason}</p>
          )}
        </div>
        {!view.archivedOn &&
          (view.alwaysFollowing ? (
            <span
              className="thread__follow is-locked"
              title="Pemegang jabatan selalu mengikuti utas jabatannya"
            >
              <BellRing aria-hidden /> Selalu mengikuti
            </span>
          ) : view.following ? (
            <Button variant="secondary" icon={BellOff} onClick={() => follow(false)}>
              Berhenti mengikuti
            </Button>
          ) : (
            <Button variant="secondary" icon={Bell} onClick={() => follow(true)}>
              Ikuti
            </Button>
          ))}
      </header>

      {fresh.length > 0 && (
        <button type="button" className="fresh-banner" onClick={showFresh} aria-live="polite">
          {fresh.length} komentar baru — Tampilkan
        </button>
      )}

      <div className="thread__cols">
        <div className="thread__main">
          <details className="thread__panel-mobile">
            <summary>Penilaian per triwulan</summary>
            <QuarterPanel cards={view.panel} />
          </details>

          {timeline(view.timeline)}

          {canPost ? (
            composer(null)
          ) : !view.archivedOn ? (
            <p className="readonly-note">
              <EyeOff aria-hidden /> Anda dapat membaca utas ini.
            </p>
          ) : null}

          <section className="mits" aria-labelledby="mits-title">
            <h3 id="mits-title" className="mits__title">
              Sub-utas mitigasi <span className="t-mono">{view.mitigations.length}</span>
            </h3>
            {view.mitigations.length === 0 && (
              <p className="tl-empty">Risiko ini belum memiliki mitigasi.</p>
            )}
            {view.mitigations.map((m) => {
              const open = openMits.has(m.id);
              const toggle = () => {
                setOpenMits((s) => {
                  const n = new Set(s);
                  if (open) n.delete(m.id);
                  else n.add(m.id);
                  return n;
                });
                if (!open) navigate({ hash: `mitigasi-${m.id}` }, { replace: true });
              };
              return (
                <div
                  key={m.id}
                  id={`mitigasi-${m.id}`}
                  className={['mit', open && 'is-open', m.inactive && 'is-inactive']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button type="button" className="mit__head" aria-expanded={open} onClick={toggle}>
                    <ShieldCheck aria-hidden className="mit__icon" />
                    <span className="mit__titles">
                      <span className="mit__desc">{m.description}</span>
                      <span className="mit__meta t-mono">
                        {m.isCustom ? 'MITIGASI SENDIRI' : 'MITIGASI'} · {m.count} komentar
                        {m.lastActivity ? ` · terakhir ${formatDate(m.lastActivity)}` : ''}
                        {m.inactive ? ' · nonaktif' : ''}
                      </span>
                    </span>
                    {m.steps > 0 && <MarkerBadge kind="langkah" />}
                    <ChevronDown
                      aria-hidden
                      className={['mit__chev', open && 'is-open'].filter(Boolean).join(' ')}
                    />
                  </button>
                  {open && (
                    <div className="mit__body">
                      {timeline(
                        m.quarters.filter((g) => g.comments.length > 0),
                        true,
                      )}
                      {m.quarters.every((g) => g.comments.length === 0) && (
                        <p className="tl-empty">Belum ada komentar pada mitigasi ini.</p>
                      )}
                      {!m.inactive && composer(m.id, true)}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        <aside className="thread__panel" aria-label="Penilaian per triwulan">
          <p className="t-eyebrow">Penilaian per triwulan</p>
          <QuarterPanel cards={view.panel} />
          <p className="thread__panel-note">
            Riwayat lengkap lintas triwulan dan tahun ada di tab Riwayat.
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={!!withdrawId}
        title="Tarik komentar ini?"
        confirmLabel="Tarik Komentar"
        destructive
        confirming={withdrawing}
        onConfirm={confirmWithdraw}
        onCancel={() => setWithdrawId(null)}
      >
        Komentar akan diganti dengan keterangan “Komentar ditarik oleh {auth.user.fullName} pada{' '}
        {formatDateTime(at)}”. Teks asli hanya tersimpan di jejak audit dan lampirannya
        disembunyikan. Langkah yang ditarik dapat memunculkan kembali penanda “Belum ada langkah
        triwulan ini”.
      </ConfirmDialog>
    </div>
  );
}

const CARD_STATUS = {
  waiting: { kind: 'menunggu', label: 'Menunggu' },
  partial: { kind: 'terbuka-sebagian', label: 'Terbuka sebagian' },
  open: { kind: 'terbuka', label: 'Terbuka' },
} as const;

/** QuarterAssessmentCard (.pen mpvti), following VIS-1/VIS-2/VIS-9. */
function QuarterPanel({ cards }: { cards: QuarterCard[] }) {
  if (cards.length === 0)
    return <p className="tl-empty">Risiko ini belum masuk penilaian triwulan.</p>;
  return (
    <div className="qcards">
      {cards.map((c) => (
        <section
          key={c.quarter.id}
          className="qcard"
          aria-label={`${tw(c.quarter.number)} TA ${c.fiscalYear}`}
        >
          <header className="qcard__head">
            <span className="t-mono qcard__title">
              {tw(c.quarter.number)} · TA {c.fiscalYear}
            </span>
            <StatusChip status={CARD_STATUS[c.status].kind} label={CARD_STATUS[c.status].label} />
          </header>
          {c.visible.map((a) => (
            <div key={a.label} className="qcard__row">
              <span className="qcard__label">
                {a.line === 1 ? a.label : `Lini 3 · ${a.label}`}
                {a.own && a.status !== 'final' ? ' (draf Anda)' : ''}
              </span>
              <span className="qcard__value">
                {a.notRelevant ? (
                  <span className="qcard__muted">Belum relevan</span>
                ) : a.status === 'not_assessed' ? (
                  <span className="qcard__muted">Tidak dinilai</span>
                ) : a.optionLabel !== null && a.predicate ? (
                  <span className="qcard__statement">
                    <PredicateBadge predicate={a.predicate} />
                    <span>{a.optionLabel}</span>
                  </span>
                ) : (
                  <span className="qcard__muted">Belum diisi</span>
                )}
                {a.result === 'sesuai' && <MarkerBadge kind="sesuai" />}
                {a.result === 'tidak_sesuai' && <MarkerBadge kind="tidak-sesuai" />}
              </span>
            </div>
          ))}
          {c.hiddenLabels.length > 0 && (
            <div className="qcard__row">
              <span className="qcard__label">{c.hiddenLabels.join(', ')}</span>
              <span className="qcard__hidden">
                <EyeOff aria-hidden /> Tersembunyi sampai perbandingan dibuka
              </span>
            </div>
          )}
          {c.pendingExplanation && (
            <p className="qcard__explain">
              Kirim penjelasan
              {c.pendingExplanation.dueOn
                ? ` · tenggat ${formatDate(c.pendingExplanation.dueOn)}`
                : ''}
            </p>
          )}
          <Link className="qcard__link" to={c.href}>
            {c.linkLabel} <ArrowRight aria-hidden />
          </Link>
        </section>
      ))}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <LoadingRegion label="Memuat utas…">
      <div className="thread">
        <Skeleton width={240} height={16} />
        <Skeleton width="60%" height={28} />
        <div className="thread__cols">
          <div className="thread__main">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="comment">
                <Skeleton width={32} height={32} radius="full" />
                <div className="comment__main">
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="90%" height={14} />
                </div>
              </div>
            ))}
          </div>
          <div className="thread__panel">
            <Skeleton height={160} radius="lg" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
