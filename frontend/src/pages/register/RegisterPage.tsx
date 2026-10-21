import { Archive, ClipboardList, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FinalizeOperatorButton,
  InlineAlert,
  LoadingRegion,
  Skeleton,
  StatusChip,
  BottomBar,
  toast,
  type StatusKind,
} from '@/components';
import { useGateDb } from '@/components/DataGate/gateDb';
import { ApiError, registerApi, registerViewKey, useRegisterViews } from '@/data/repository';
import { useSession } from '@/state/session';
import type { CopySummary, RegisterKey } from '@/data/api/register';
import type { RegisterView } from '@/data/api/registerView';
import { QUARTER_ROMAN } from '@/domain/calendar';
import { deactivationQuarter, type RegisterGap } from '@/domain/rules/register';
import {
  RISK_TYPE_LABEL,
  type RegisterMitigation,
  type RegisterRisk,
  type RiskType,
} from '@/domain/types';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate, formatDateTime } from '@/lib/format';
import { useSaving } from '@/lib/useSaving';
import { useAuth } from '@/state/useAuth';
import { DataUmumSection } from './DataUmumSection';
import { StageSection, type StageActions } from './StageSection';
import './Register.css';

type DeactivateTarget = { risk: RegisterRisk; mitigation?: RegisterMitigation };

const hhmm = (iso: string) => iso.slice(11, 16).replace(':', '.');

/** /jabatan/:jid/register/:ta — PRD §5 (FR-REG-001 … 013). */
export default function RegisterPage() {
  const { position, unitCode, fiscalYear } = useOutletContext<WorkspaceOutletContext>();
  usePageMeta(['Register', `${position.name} · ${unitCode}`]);
  const key: RegisterKey = useMemo(
    () => ({ positionId: position.id, fiscalYear }),
    [position.id, fiscalYear],
  );
  const userId = useSession((s) => s.userId);
  const k = useMemo(() => registerViewKey(key), [key, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useRegisterViews((s) => s.views[k]);
  const error = useRegisterViews((s) => s.errors[k]);
  const generation = useRegisterViews((s) => s.generation);
  const load = () => void useRegisterViews.getState().load(key);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per viewer, register and clear()
  useEffect(load, [k, generation]);
  if (error && !view)
    return (
      <InlineAlert variant="error" title="Register gagal dimuat" onRetry={load}>
        {error}
      </InlineAlert>
    );
  if (!view)
    return (
      <LoadingRegion label="Memuat register…">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={56} width="40%" />
          <Skeleton height={320} radius="lg" />
        </div>
      </LoadingRegion>
    );
  return (
    <>
      {error && (
        <InlineAlert variant="error" title="Data terbaru gagal dimuat" onRetry={load}>
          {error}
        </InlineAlert>
      )}
      <RegisterContent registerKey={key} view={view} />
    </>
  );
}

function RegisterContent({
  registerKey: key,
  view,
}: {
  registerKey: RegisterKey;
  view: RegisterView;
}) {
  const { position, fiscalYear } = useOutletContext<WorkspaceOutletContext>();
  const auth = useAuth();
  const gate = useGateDb();
  // Items are filtered per viewer by the server (FR-REG-012): readers get published ones only.
  const db = useMemo(
    () => ({
      ...gate,
      registers: [
        ...gate.registers.filter((r) => r.id !== view.register?.id),
        ...(view.register ? [view.register] : []),
      ],
    }),
    [gate, view.register],
  );
  const { access, stages, risks, pending, unpublishedForReader } = view;
  const register = view.register ?? undefined;
  const editing = access.canDraft;
  const fy = db.fiscalYears.find((f) => f.year === fiscalYear);
  const previous = view.previousRegister ? { fiscalYear: fiscalYear - 1 } : undefined;

  const { saving, failed, run } = useSaving();
  const [showGaps, setShowGaps] = useState(false);
  const [copyDismissed, setCopyDismissed] = useState(false);
  const [copySummary, setCopySummary] = useState<CopySummary | null>(null);
  const [copying, setCopying] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [deactivate, setDeactivate] = useState<DeactivateTarget | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [conflict, setConflict] = useState<{
    stageId: string;
    riskType: RiskType | null;
    count: number;
  } | null>(null);
  const gapAlertRef = useRef<HTMLDivElement>(null);

  const liveGaps: RegisterGap[] = view.gaps;
  const gaps = showGaps ? liveGaps : [];
  const gapAnchors = new Set(gaps.map((g) => g.anchor));
  const gapFields = new Set(gaps.filter((g) => g.field).map((g) => g.field!));
  const archived = access.archived || register?.status === 'archived';
  const published = register?.status === 'published';

  const user = (id: string | null | undefined) =>
    db.users.find((u) => u.id === id)?.fullName ?? '—';

  /* ---------- Actions ---------- */

  const scrollTo = (anchor: string) => {
    const el = document.getElementById(anchor);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLElement>('textarea, input, button')?.focus({ preventScroll: true });
  };

  const setDeclaration = async (
    stageId: string,
    riskType: RiskType | null,
    on: boolean,
    force = false,
  ) => {
    try {
      await registerApi.setDeclaration(key, stageId, riskType, on, force);
      setConflict(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'has_drafts')
        setConflict({ stageId, riskType, count: (e.details as { count: number }).count });
      else toast.error('Pernyataan tidak tersimpan', (e as Error).message);
    }
  };

  const actions: StageActions = {
    selectTemplate: (id) => void run(registerApi.toggleTemplateRisk(key, id, true)),
    deselect: (risk) =>
      void run(
        risk.riskTemplateId && !risk.isCustom
          ? registerApi.toggleTemplateRisk(key, risk.riskTemplateId, false)
          : registerApi.deleteRisk(risk.id),
      ),
    toggleMitigation: (riskId, mtplId, on) =>
      void run(registerApi.toggleTemplateMitigation(riskId, mtplId, on)),
    addMitigation: async (riskId, text) =>
      (await run(registerApi.addCustomMitigation(riskId, text).then(() => true))) ?? false,
    deleteMitigation: (id) => void run(registerApi.deleteMitigation(id)),
    deactivateRisk: (risk) => openDeactivate({ risk }),
    deactivateMitigation: (mitigation, risk) => openDeactivate({ risk, mitigation }),
    setDeclaration: (stageId, riskType, on) => void setDeclaration(stageId, riskType, on),
    setReason: (stageId, riskType, r) =>
      void run(registerApi.setDeclarationReason(key, stageId, riskType, r)),
    addCustomRisk: async (stageId, riskType, text) =>
      (await run(registerApi.addCustomRisk(key, stageId, riskType, text).then(() => true))) ??
      false,
  };

  function openDeactivate(target: DeactivateTarget) {
    setDeactivate(target);
    setReason('');
    setReasonError(null);
  }

  const confirmDeactivate = async () => {
    if (!deactivate) return;
    if (!reason.trim()) {
      setReasonError('Alasan penonaktifan wajib diisi.');
      return;
    }
    setDeactivating(true);
    const ok = await run(
      deactivate.mitigation
        ? registerApi.deactivateMitigation(deactivate.mitigation.id, reason).then(() => true)
        : registerApi.deactivateRisk(deactivate.risk.id, reason).then(() => true),
      'Penonaktifan gagal',
    );
    setDeactivating(false);
    if (!ok) return;
    toast.success(
      deactivate.mitigation ? 'Mitigasi dinonaktifkan' : `Risiko dinonaktifkan mulai ${nextLabel}`,
    );
    setDeactivate(null);
  };

  const copy = async () => {
    setCopying(true);
    const summary = await run(registerApi.copyFromPrevious(key), 'Penyalinan gagal');
    setCopying(false);
    if (summary) setCopySummary(summary);
  };

  const markReady = async () => {
    setMarking(true);
    const ok = await run(
      registerApi.markReady(key).then(() => true),
      'Gagal menandai siap',
    );
    setMarking(false);
    if (ok)
      toast.success(
        published ? 'Tambahan ditandai siap' : 'Register ditandai siap diterbitkan',
        `${access.officialName ?? 'Pejabat'} diberi tahu untuk menerbitkan.`,
      );
  };

  const requestPublish = () => {
    if (liveGaps.length) {
      setShowGaps(true);
      requestAnimationFrame(() => {
        gapAlertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        gapAlertRef.current?.focus({ preventScroll: true });
      });
      return;
    }
    setShowGaps(false);
    setPublishOpen(true);
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const summary = await registerApi.publish(key);
      setPublishOpen(false);
      toast.success(
        published ? 'Tambahan register diterbitkan' : `Register TA ${fiscalYear} diterbitkan`,
        `${summary.risks} risiko dan ${summary.mitigations} mitigasi diterbitkan.`,
      );
    } catch (e) {
      setPublishOpen(false);
      if (e instanceof ApiError && e.code === 'gaps') setShowGaps(true);
      else toast.error('Register belum diterbitkan', (e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  /* ---------- Derived text ---------- */

  const current =
    auth.currentQuarter && auth.currentQuarter.fiscalYear === fiscalYear
      ? auth.currentQuarter
      : null;
  const nextQ = current ? deactivationQuarter(db.quarters, current) : null;
  const nextLabel = nextQ ? `TW ${QUARTER_ROMAN[nextQ.number - 1]}` : `TA ${fiscalYear + 1}`;
  const currentLabel = current ? `TW ${QUARTER_ROMAN[current.number - 1]}` : 'triwulan berjalan';

  const statusKind: StatusKind = archived
    ? 'diarsipkan'
    : published
      ? 'terbit'
      : register?.status === 'ready'
        ? 'siap'
        : 'draf';
  const activeRisks = risks.filter((r) => r.status === 'active').length;
  const inactiveRisks = risks.filter((r) => r.status === 'inactive').length;
  const stageCount = new Set(risks.map((r) => r.stageId)).size;
  let meta: string;
  if (!register) meta = 'Belum disusun';
  else if (archived)
    meta = `${activeRisks + inactiveRisks} risiko · ${inactiveRisks} nonaktif${fy?.archivedAt ? ` · diarsipkan ${formatDate(fy.archivedAt)}` : ''}`;
  else if (published)
    meta = `${activeRisks} risiko aktif · diterbitkan ${formatDate(register.publishedAt!)} oleh ${user(register.publishedByUserId)}`;
  else if (register.status === 'ready' && register.readyAt)
    meta = `ditandai siap oleh ${user(register.readyByUserId)}, ${formatDateTime(register.readyAt)}`;
  else
    meta = `${risks.length} risiko dipilih · ${stageCount} tahap${register.updatedAt ? ` · disimpan ${hhmm(register.updatedAt)} oleh ${user(register.updatedByUserId)}` : ''}`;

  const stagesDone = view.stagesDone;
  const pendingCount = pending.risks.length + pending.mitigations.length;
  const pendingDraft = [...pending.risks, ...pending.mitigations].filter(
    (x) => x.status === 'draft',
  ).length;
  let progress: string;
  let progressTone: 'default' | 'danger' = 'default';
  if (published) {
    progress = `Terbit ${formatDate(register!.publishedAt!)} · ${pendingCount ? `${pendingCount} tambahan (${pendingDraft} draf, ${pendingCount - pendingDraft} siap)` : 'tidak ada tambahan'}`;
  } else if (showGaps && liveGaps.length) {
    progress = `${risks.length} risiko · ${liveGaps.length} hal perlu dilengkapi`;
    progressTone = 'danger';
  } else
    progress = `${risks.length} risiko · ${stagesDone.complete} dari ${stagesDone.total} tahap lengkap`;

  const publishLabel = published ? 'Terbitkan Tambahan' : 'Terbitkan Register';
  const showCopy =
    editing &&
    !!previous &&
    !copyDismissed &&
    !copySummary &&
    risks.length === 0 &&
    !register?.copiedFromRegisterId;
  const flagged = register && publishOpen ? view.flagged : [];
  const threadUrl = (r: RegisterRisk) =>
    r.status === 'active' || r.status === 'inactive'
      ? `/jabatan/${position.id}/papan/${fiscalYear}/risiko/${r.id}`
      : undefined;
  const stageOf = (risk: RegisterRisk) => stages.find((s) => s.stage.id === risk.stageId);

  /* ---------- Render ---------- */

  if (!register && !editing && !unpublishedForReader) {
    return (
      <div className="register">
        <EmptyState
          icon={ClipboardList}
          title={`Register TA ${fiscalYear} belum disusun`}
          message={
            archived
              ? 'Tahun anggaran ini sudah diarsipkan tanpa register untuk jabatan ini.'
              : `Register akan tampil di sini setelah ${position.name} menyusun dan menerbitkannya.`
          }
        />
      </div>
    );
  }
  if (unpublishedForReader) {
    return (
      <div className="register">
        <EmptyState
          icon={ClipboardList}
          title={`Register TA ${fiscalYear} belum diterbitkan`}
          message={`${position.name} masih menyusun register. Risiko tampil di sini setelah diterbitkan.`}
        />
      </div>
    );
  }

  return (
    <div className="register">
      <div className="register__status">
        <StatusChip status={statusKind} />
        <span className="register__meta">{meta}</span>
      </div>

      {archived && (
        <InlineAlert
          variant="info"
          title={`Register TA ${fiscalYear} telah diarsipkan`}
          className="register__banner"
        >
          <p>
            Register ini hanya dapat dibaca. Risiko, mitigasi, dan utasnya disimpan sebagai riwayat.
          </p>
          {auth.currentFiscalYear !== fiscalYear && (
            <Link
              className="btn btn--secondary register__banner-btn"
              to={`/jabatan/${position.id}/register/${auth.currentFiscalYear}`}
            >
              <Archive className="btn__icon" aria-hidden />
              <span>Buka TA {auth.currentFiscalYear}</span>
            </Link>
          )}
        </InlineAlert>
      )}

      {!archived && access.draftDenied === 'filler' && (
        <InlineAlert
          variant="info"
          title={`Anda anggota ${position.name}, bukan Pengisi`}
          className="register__banner"
        >
          Hanya Pengisi ({access.officialName ?? '—'}) dan Operator yang ditunjuknya dapat menyusun,
          menandai siap, dan menerbitkan register. Anda tetap dapat membaca register dan berkomentar
          di utas risiko.
        </InlineAlert>
      )}

      {showCopy && (
        <InlineAlert
          variant="info"
          title={`Mulai dari register TA ${previous!.fiscalYear}?`}
          className="register__banner"
        >
          <p>
            Risiko dan mitigasi aktif TA {previous!.fiscalYear} disalin sebagai draf. Tidak ada yang
            langsung diterbitkan; Anda tetap dapat menambah, menghapus, dan mengubah pilihan sebelum
            menerbitkan.
          </p>
          <div className="register__banner-actions">
            <Button icon={Copy} loading={copying} loadingLabel="Menyalin…" onClick={copy}>
              Salin dari TA {previous!.fiscalYear}
            </Button>
            <Button variant="ghost" onClick={() => setCopyDismissed(true)}>
              Mulai dari kosong
            </Button>
          </div>
        </InlineAlert>
      )}

      {copySummary && (
        <InlineAlert
          variant="success"
          title={`Register TA ${copySummary.fromYear} berhasil disalin sebagai draf`}
          className="register__banner"
        >
          <ul className="register__list">
            <li>
              {copySummary.risks} risiko dan {copySummary.mitigations} mitigasi disalin.
            </li>
            {copySummary.inactiveTemplates > 0 && (
              <li>
                {copySummary.inactiveTemplates} risiko berasal dari template yang sudah tidak aktif
                — ditandai untuk ditinjau.
              </li>
            )}
            {copySummary.skippedStages.map((s) => (
              <li key={s.name}>
                Tahap “{s.name}” sudah tidak aktif; {s.risks} risiko tidak disalin.
              </li>
            ))}
            <li>Besar Anggaran dan Target dikosongkan untuk TA {fiscalYear}.</li>
          </ul>
        </InlineAlert>
      )}

      {gaps.length > 0 && (
        <div ref={gapAlertRef} tabIndex={-1} className="register__gaps">
          <InlineAlert
            variant="error"
            title={`Register belum dapat diterbitkan: ${gaps.length} hal perlu dilengkapi`}
          >
            <ol className="register__gap-list">
              {gaps.map((g) => (
                <li key={g.anchor + g.kind}>
                  <button type="button" className="text-link" onClick={() => scrollTo(g.anchor)}>
                    {g.message}
                  </button>
                </li>
              ))}
            </ol>
          </InlineAlert>
        </div>
      )}

      {published && access.isHolder && pendingCount > 0 && !archived && (
        <div className="additions" role="status">
          <p className="additions__title">{pendingCount} tambahan belum diterbitkan</p>
          <ul>
            {pending.risks.map((r) => (
              <li key={r.id}>
                Risiko: {r.descriptionSnapshot}
                {r.status === 'ready' && <span className="risk-card__ready">Siap</span>}
              </li>
            ))}
            {pending.mitigations.map((m) => (
              <li key={m.id}>
                Mitigasi: {m.descriptionSnapshot}
                {m.status === 'ready' && <span className="risk-card__ready">Siap</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DataUmumSection
        db={db}
        position={position}
        fiscalYear={fiscalYear}
        register={register}
        editing={editing}
        today={auth.today}
        gapFields={gapFields}
        onSave={(patch) => void run(registerApi.updateDataUmum(key, patch))}
      />

      <div className="register__stages">
        {stages.map((s) => (
          <StageSection
            key={s.stage.id}
            db={db}
            model={s}
            access={access}
            editing={editing}
            gapAnchors={gapAnchors}
            threadUrl={threadUrl}
            actions={actions}
          />
        ))}
      </div>

      {editing && (
        <BottomBar
          autosave={
            saving
              ? { state: 'saving' }
              : failed
                ? { state: 'error' }
                : register?.updatedAt
                  ? { state: 'saved', time: hhmm(register.updatedAt) }
                  : null
          }
          progress={progress}
          progressTone={progressTone}
        >
          {access.isOperator && (published ? pendingDraft > 0 : register?.status !== 'ready') && (
            <Button
              variant="secondary"
              loading={marking}
              loadingLabel="Menandai…"
              onClick={markReady}
            >
              Tandai Siap Diterbitkan
            </Button>
          )}
          {access.isOperator && (!published || pendingCount > 0) && (
            <FinalizeOperatorButton
              label={publishLabel}
              officialName={access.officialName ?? 'Pejabat'}
            />
          )}
          {access.canPublish && (!published || pendingCount > 0) && (
            <Button onClick={requestPublish}>{publishLabel}</Button>
          )}
        </BottomBar>
      )}

      <ConfirmDialog
        open={publishOpen}
        title={
          published
            ? `Terbitkan tambahan register TA ${fiscalYear}?`
            : `Terbitkan Register TA ${fiscalYear}?`
        }
        confirmLabel={publishLabel}
        confirming={publishing}
        onConfirm={publish}
        onCancel={() => setPublishOpen(false)}
      >
        <p>
          Register akan diterbitkan. Risiko dan mitigasi yang diterbitkan tidak dapat diubah
          uraiannya.
        </p>
        {flagged.length > 0 && (
          <div className="publish-flags">
            <p className="t-body-strong">{flagged.length} risiko diterbitkan dengan penanda</p>
            <ul>
              {flagged.map((r) => (
                <li key={r.id}>
                  <span>{r.descriptionSnapshot}</span>{' '}
                  <span className="publish-flags__tag">Tanpa mitigasi</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="publish-consequence">
          {pending.risks.length} risiko akan tampil di Papan Risiko dan tim Lini 2 akan diberi tahu.
          {pending.risks.some((r) => r.isCustom) &&
            ` ${pending.risks.filter((r) => r.isCustom).length} risiko sendiri dikirim sebagai usulan template.`}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deactivate}
        title={deactivate?.mitigation ? 'Nonaktifkan mitigasi ini?' : 'Nonaktifkan risiko ini?'}
        confirmLabel={deactivate?.mitigation ? 'Nonaktifkan Mitigasi' : 'Nonaktifkan Risiko'}
        destructive
        confirming={deactivating}
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivate(null)}
      >
        {deactivate && (
          <div className="deactivate">
            <p className="t-eyebrow">
              Tahap {stageOf(deactivate.risk)?.index} · {RISK_TYPE_LABEL[deactivate.risk.riskType]}
            </p>
            <blockquote className="deactivate__quote">
              {deactivate.mitigation?.descriptionSnapshot ?? deactivate.risk.descriptionSnapshot}
            </blockquote>
            <div className={['field', reasonError && 'field--error'].filter(Boolean).join(' ')}>
              <label className="field__label" htmlFor="deactivate-reason">
                Alasan penonaktifan
                <span className="field__required" aria-hidden>
                  {' '}
                  *
                </span>
              </label>
              <textarea
                id="deactivate-reason"
                className="control control--textarea"
                rows={3}
                value={reason}
                aria-invalid={!!reasonError || undefined}
                aria-describedby={reasonError ? 'deactivate-reason-error' : undefined}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError && e.target.value.trim()) setReasonError(null);
                }}
              />
              {reasonError && (
                <span id="deactivate-reason-error" className="field__error">
                  {reasonError}
                </span>
              )}
            </div>
            <p className="deactivate__effect">
              {deactivate.mitigation
                ? 'Mitigasi langsung berstatus nonaktif dan tidak disalin ke TA berikutnya. Riwayatnya tetap tersimpan.'
                : nextQ
                  ? `Risiko langsung berstatus nonaktif, tetapi tetap dinilai pada ${currentLabel} TA ${fiscalYear}. Mulai ${nextLabel} risiko tidak lagi dinilai dan tidak disalin ke TA berikutnya. Utas tetap dapat dibaca dan dikomentari hingga arsip.`
                  : `Risiko langsung berstatus nonaktif, tetapi tetap dinilai hingga ${currentLabel} TA ${fiscalYear}. Mulai TA ${fiscalYear + 1} risiko tidak disalin. Utas tetap dapat dibaca dan dikomentari hingga arsip.`}
            </p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!conflict}
        title={conflict?.riskType ? 'Nyatakan tidak ada risiko?' : 'Nyatakan tahap tidak relevan?'}
        confirmLabel="Hapus dan Nyatakan"
        destructive
        onConfirm={() =>
          conflict && void setDeclaration(conflict.stageId, conflict.riskType, true, true)
        }
        onCancel={() => setConflict(null)}
      >
        {conflict && (
          <p>
            {conflict.count} risiko terpilih beserta mitigasinya akan dihapus dari{' '}
            {conflict.riskType ? `jenis ${RISK_TYPE_LABEL[conflict.riskType]}` : 'tahap ini'}.
            Lanjutkan?
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
