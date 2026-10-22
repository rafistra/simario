import { Check, EyeOff, Lock, Paperclip, Pin, RotateCcw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import {
  AttachmentFileChip,
  Checkbox,
  ConfidentialAttachmentsChip,
  MarkerBadge,
  PredicateBadge,
  ScoreInput,
  StatusChip,
  Toggle,
} from '@/components';
import type {
  CellPatch,
  CellView,
  ExplanationView,
  RowSummary,
  RowView,
  ScoreOptionItem,
} from '@/test/fake/api/assessment';
import type { NewFile } from '@/test/fake/api/thread';
import { attachmentUrl } from '@/data/repository';
import { RISK_TYPE_LABEL } from '@/domain/types';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format';

export interface RowActions {
  options: ScoreOptionItem[];
  saveCell: (rqId: string, positionId: string, patch: CellPatch) => void;
  addFiles: (rqId: string, positionId: string, files: NewFile[]) => void;
  removeFile: (attachmentId: string) => void;
  reopen: (assessmentId: string) => void;
  saveExplanation: (resultId: string, patch: { reason?: string; plan?: string }) => void;
}

const SUMMARY: Record<RowSummary, { label: string; cls: string } | null> = {
  waiting: null,
  partial: { label: 'Terbuka sebagian', cls: 'rsum--partial' },
  sesuai: { label: 'Sesuai', cls: 'rsum--sesuai' },
  tidak_sesuai: { label: 'Tidak Sesuai', cls: 'rsum--tidak' },
  incomparable: { label: 'Tidak dapat dibandingkan', cls: 'rsum--na' },
};

/** AssessmentRow (.pen J3BXE4): header, one AssessorCell per column, explanation blocks. */
export function AssessmentRow({
  row,
  actions,
  tw,
}: {
  row: RowView;
  actions: RowActions;
  tw: string;
}) {
  const s = SUMMARY[row.summary];
  return (
    <article
      id={`nilai-${row.risk.id}`}
      className={['arow', row.pinned && 'is-pinned', row.recurring && 'is-recurring']
        .filter(Boolean)
        .join(' ')}
    >
      <header className="arow__head">
        <div className="arow__titles">
          <p className="t-eyebrow">
            {row.pinned && (
              <span className="arow__pin">
                <Pin aria-hidden /> Disematkan ·{' '}
              </span>
            )}
            Tahap {row.stageIndex} · {RISK_TYPE_LABEL[row.riskType]}
          </p>
          <h3 className="arow__title">{row.risk.descriptionSnapshot}</h3>
        </div>
        <div className="arow__marks">
          {row.quiet && <MarkerBadge kind="belum-langkah" label={`Belum ada langkah ${tw}`} />}
          {row.recurring && <MarkerBadge kind="berulang" />}
          {s && (
            <span className={`rsum ${s.cls}`}>
              {row.summary === 'sesuai' && <Check aria-hidden />}
              {row.summary === 'tidak_sesuai' && <X aria-hidden />}
              {s.label}
            </span>
          )}
        </div>
      </header>
      <div className="arow__cells">
        {row.cells.map((c) => (
          <AssessorCell
            key={c.positionId}
            cell={c}
            rqId={row.rq.id}
            riskLabel={row.risk.descriptionSnapshot}
            actions={actions}
          />
        ))}
      </div>
      {row.explanations.length > 0 && (
        <div className="arow__expl">
          {row.explanations.map((e) => (
            <ExplanationBlock
              key={e.result.id}
              view={e}
              others={row.explanations.filter((o) => o.result.id !== e.result.id && o.editable)}
              onSave={actions.saveExplanation}
            />
          ))}
        </div>
      )}
    </article>
  );
}

/** AssessorCell (.pen SnOQ3). */
function AssessorCell({
  cell: c,
  rqId,
  riskLabel,
  actions,
}: {
  cell: CellView;
  rqId: string;
  riskLabel: string;
  actions: RowActions;
}) {
  const a = c.assessment;
  const fileRef = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState(a?.notRelevantReason ?? '');
  const [note, setNote] = useState(a?.note ?? '');
  const reasonId = useId();
  const noteId = useId();
  useEffect(() => setReason(a?.notRelevantReason ?? ''), [a?.notRelevantReason]);
  useEffect(() => setNote(a?.note ?? ''), [a?.note]);

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).map((f) => ({
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream',
      confidential: c.line === 3,
      file: f,
    }));
    e.target.value = '';
    if (files.length) actions.addFiles(rqId, c.positionId, files);
  };

  const head = (
    <p className="acell__label t-eyebrow">
      {c.label}
      {c.own && <span className="acell__own"> · Anda</span>}
    </p>
  );

  if (!c.visible) {
    return (
      <div className="acell is-hidden">
        {head}
        {c.overdue && c.line === 3 && !c.result ? (
          <p className="acell__waiting">
            <StatusChip status="menunggu" /> <MarkerBadge kind="terlambat" />
          </p>
        ) : (
          <p className="acell__hidden">
            <EyeOff aria-hidden /> Tersembunyi sampai perbandingan dibuka
          </p>
        )}
      </div>
    );
  }

  const files = (
    <>
      {(c.attachments.length > 0 || c.confidentialHidden > 0) && (
        <div className="acell__files">
          {c.attachments.map(({ attachment: f }) => (
            <span key={f.id} className="acell__file">
              <AttachmentFileChip
                name={f.filename}
                meta={`${f.filename.split('.').pop()?.toUpperCase()} · ${formatFileSize(f.sizeBytes)}`}
                confidential={f.isConfidential}
                href={attachmentUrl(f.id)}
              />
              {c.editable && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label={`Hapus ${f.filename}`}
                  onClick={() => actions.removeFile(f.id)}
                >
                  <X aria-hidden />
                </button>
              )}
            </span>
          ))}
          {c.confidentialHidden > 0 && <ConfidentialAttachmentsChip count={c.confidentialHidden} />}
        </div>
      )}
    </>
  );

  if (c.editable) {
    return (
      <div className="acell is-own is-editable">
        {head}
        <div className="acell__entry">
          <ScoreInput
            label={`Penilaian ${c.label} untuk ${riskLabel}`}
            options={actions.options}
            value={c.selectedValue}
            disabled={!!a?.notRelevant}
            onCommit={(score) => actions.saveCell(rqId, c.positionId, { score })}
          />
          {a?.status === 'ready' && <StatusChip status="siap" label="Siap" />}
        </div>
        {c.line === 1 && (
          <>
            <Checkbox
              label="Belum relevan triwulan ini"
              checked={!!a?.notRelevant}
              onChange={(e) =>
                actions.saveCell(rqId, c.positionId, { notRelevant: e.target.checked })
              }
            />
            {a?.notRelevant && (
              <div
                className={['field', !reason.trim() && 'field--error'].filter(Boolean).join(' ')}
              >
                <label className="field__label" htmlFor={reasonId}>
                  Alasan belum relevan
                  <span className="field__required" aria-hidden>
                    {' '}
                    *
                  </span>
                </label>
                <textarea
                  id={reasonId}
                  className="control control--textarea"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() =>
                    reason !== (a.notRelevantReason ?? '') &&
                    actions.saveCell(rqId, c.positionId, { notRelevantReason: reason })
                  }
                />
                {!reason.trim() && (
                  <span className="field__error">Alasan wajib diisi sebelum dituntaskan.</span>
                )}
              </div>
            )}
          </>
        )}
        {c.line === 3 && (
          <div className="field">
            <label className="field__label" htmlFor={noteId}>
              Catatan (opsional)
            </label>
            <textarea
              id={noteId}
              className="control control--textarea"
              rows={2}
              value={note}
              placeholder="Dasar penilaian Anda"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() =>
                note !== (a?.note ?? '') && actions.saveCell(rqId, c.positionId, { note })
              }
            />
          </div>
        )}
        {files}
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.mp4"
          onChange={onFiles}
        />
        <button
          type="button"
          className="link-add acell__attach"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip aria-hidden /> Lampirkan bukti{c.line === 3 ? ' (konfidensial bawaan)' : ''}
        </button>
      </div>
    );
  }

  // Read-only: own finalised/frozen cell or another visible assessor.
  return (
    <div className={['acell', c.own && 'is-own'].filter(Boolean).join(' ')}>
      {head}
      {!a ? (
        <p className="acell__muted">{c.own ? 'Belum dinilai' : '—'}</p>
      ) : a.status === 'not_assessed' ? (
        <p className="acell__muted">{c.line === 1 ? 'Tidak dinilai Lini 1' : 'Tidak dinilai'}</p>
      ) : a.notRelevant ? (
        <>
          <p className="acell__value">
            <span className="acell__nr">Belum relevan</span>
          </p>
          {a.notRelevantReason && <p className="acell__note">{a.notRelevantReason}</p>}
        </>
      ) : a.optionLabel !== null ? (
        <>
          <p className="acell__value">
            {(a.status === 'final' || c.frozen) && (
              <Lock className="acell__lock" aria-label="Dituntaskan" />
            )}
            {a.predicate && <PredicateBadge predicate={a.predicate} />}
          </p>
          <p className="acell__statement">{a.optionLabel}</p>
        </>
      ) : (
        <p className="acell__muted">Belum dinilai</p>
      )}
      {c.result && (
        <p className="acell__result">
          {c.result.result === 'sesuai' && <MarkerBadge kind="sesuai" />}
          {c.result.result === 'tidak_sesuai' && <MarkerBadge kind="tidak-sesuai" />}
          {c.result.result === 'incomparable' && (
            <span className="acell__muted">Tidak dapat dibandingkan</span>
          )}
        </p>
      )}
      {a?.note && <p className="acell__note">“{a.note}”</p>}
      {files}
      {a && (a.status === 'final' || a.status === 'ready' || a.lateness || a.flags.length > 0) && (
        <p className="acell__meta">
          {a.status === 'final' && a.finalisedAt && (
            <span>Dituntaskan {formatDateTime(a.finalisedAt)}</span>
          )}
          {a.status === 'ready' && <StatusChip status="siap" label="Siap" />}
          {a.lateness === 'terlambat' && <MarkerBadge kind="terlambat" />}
          {a.lateness === 'sangat_terlambat' && <MarkerBadge kind="sangat-terlambat" />}
          {a.flags.includes('no_evidence') && <MarkerBadge kind="tanpa-bukti" />}
        </p>
      )}
      {c.own && !a && c.overdue && <MarkerBadge kind="terlambat" label="Lewat tenggat" />}
      {c.canReopen && a && (
        <button
          type="button"
          className="link-add acell__reopen"
          onClick={() => actions.reopen(a.id)}
        >
          <RotateCcw aria-hidden /> Buka Kembali
        </button>
      )}
    </div>
  );
}

/** ExplanationBlock (.pen ZW8xB): one per Tidak Sesuai result (RB-NIL-009). */
function ExplanationBlock({
  view: e,
  others,
  onSave,
}: {
  view: ExplanationView;
  others: ExplanationView[];
  onSave: (resultId: string, patch: { reason?: string; plan?: string }) => void;
}) {
  const r = e.result;
  const [reason, setReason] = useState(r.explanationReason ?? '');
  const [plan, setPlan] = useState(r.explanationPlan ?? '');
  const [copy, setCopy] = useState(false);
  const ids = { reason: useId(), plan: useId() };
  useEffect(() => setReason(r.explanationReason ?? ''), [r.explanationReason]);
  useEffect(() => setPlan(r.explanationPlan ?? ''), [r.explanationPlan]);
  const sent = r.explanationStatus === 'sent';
  const required = r.explanationRequired;

  const save = (patch: { reason?: string; plan?: string }) => {
    onSave(r.id, patch);
    if (copy) for (const o of others) onSave(o.result.id, patch);
  };

  return (
    <section
      className={['expl', sent && 'is-sent', !required && 'is-optional'].filter(Boolean).join(' ')}
      aria-label={`Penjelasan untuk ${e.directorate}`}
    >
      <header className="expl__head">
        <span className="expl__title">
          {sent && <Lock aria-hidden />} Penjelasan untuk {e.directorate}
        </span>
        <span className={`expl__kind ${required ? 'is-required' : ''}`}>
          {required ? 'Wajib · Lini 1 lebih tinggi' : 'Opsional · Lini 1 lebih rendah'}
        </span>
        <span className="expl__due t-mono">
          {r.explanationDueOn ? `Tenggat ${formatDate(r.explanationDueOn)}` : ''}
        </span>
      </header>
      {sent ? (
        <>
          <dl className="expl__sent">
            <div>
              <dt>Alasan/Kendala</dt>
              <dd>{r.explanationReason}</dd>
            </div>
            <div>
              <dt>Rencana Tindak Lanjut</dt>
              <dd>{r.explanationPlan}</dd>
            </div>
          </dl>
          <p className="expl__meta">
            Dikirim {r.explanationSentAt ? formatDateTime(r.explanationSentAt) : ''} oleh{' '}
            {e.sentByName ?? '—'} · tidak dapat diubah ·{' '}
            {r.explanationLateness === 'terlambat'
              ? 'Terlambat'
              : r.explanationLateness === 'sangat_terlambat'
                ? 'Sangat Terlambat'
                : 'Terkirim tepat waktu'}
          </p>
        </>
      ) : r.explanationStatus === 'not_sent' ? (
        <p className="expl__meta">Tidak dikirim</p>
      ) : e.editable ? (
        <>
          <div className="expl__fields">
            <div
              className={['field', required && !reason.trim() && 'field--error']
                .filter(Boolean)
                .join(' ')}
            >
              <label className="field__label" htmlFor={ids.reason}>
                Alasan/Kendala
                {required && (
                  <span className="field__required" aria-hidden>
                    {' '}
                    *
                  </span>
                )}
              </label>
              <textarea
                id={ids.reason}
                className="control control--textarea"
                rows={3}
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                onBlur={() => reason !== (r.explanationReason ?? '') && save({ reason })}
              />
            </div>
            <div
              className={['field', required && !plan.trim() && 'field--error']
                .filter(Boolean)
                .join(' ')}
            >
              <label className="field__label" htmlFor={ids.plan}>
                Rencana Tindak Lanjut
                {required && (
                  <span className="field__required" aria-hidden>
                    {' '}
                    *
                  </span>
                )}
              </label>
              <textarea
                id={ids.plan}
                className="control control--textarea"
                rows={3}
                value={plan}
                onChange={(ev) => setPlan(ev.target.value)}
                onBlur={() => plan !== (r.explanationPlan ?? '') && save({ plan })}
              />
            </div>
          </div>
          {others.length > 0 && (
            <Toggle
              label={`Gunakan penjelasan yang sama untuk ${others.map((o) => o.directorate).join(', ')}`}
              checked={copy}
              onChange={(on) => {
                setCopy(on);
                if (on) for (const o of others) onSave(o.result.id, { reason, plan });
              }}
            />
          )}
          <p className="expl__meta">
            {r.explanationStatus === 'ready' ? 'Siap dikirim oleh Pejabat' : 'Draf'}
            {e.pendingLateness === 'terlambat' && ' · Terlambat'}
            {e.pendingLateness === 'sangat_terlambat' && ' · Sangat Terlambat'}
          </p>
        </>
      ) : (
        <p className="expl__meta">
          {e.showText ? 'Draf penjelasan' : 'Penjelasan belum dikirim'}
          {r.explanationDueOn ? ` · tenggat ${formatDate(r.explanationDueOn)}` : ''}
          {e.pendingLateness === 'terlambat' && ' · Terlambat'}
          {e.pendingLateness === 'sangat_terlambat' && ' · Sangat Terlambat'}
        </p>
      )}
    </section>
  );
}
