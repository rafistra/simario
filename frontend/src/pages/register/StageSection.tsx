import { ChevronDown, CircleAlert, Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button, Checkbox, MarkerBadge, Toggle } from '@/components';
import type { DB } from '@/data/db';
import { stageAnchor, subsectionAnchor } from '@/domain/rules/register';
import { RISK_TYPE_LABEL, type RegisterRisk, type RiskType } from '@/domain/types';
import type { RegisterAccess, StageModel, SubsectionModel } from '@/data/api/registerView';
import { RiskCard, type RiskCardActions } from './RiskCard';

const SHORT: Record<RiskType, string> = {
  kinerja_anggaran: 'KA',
  ketidakpatuhan: 'KP',
  kecurangan: 'KC',
};

export interface StageActions extends RiskCardActions {
  setDeclaration: (stageId: string, riskType: RiskType | null, on: boolean) => void;
  setReason: (stageId: string, riskType: RiskType | null, reason: string) => void;
  addCustomRisk: (stageId: string, riskType: RiskType, text: string) => Promise<boolean>;
}

interface Props {
  db: DB;
  model: StageModel;
  access: RegisterAccess;
  editing: boolean;
  /** Anchors with an open publish gap. */
  gapAnchors: Set<string>;
  threadUrl: (risk: RegisterRisk) => string | undefined;
  actions: StageActions;
}

const counted = (s: SubsectionModel) => s.risks.filter((r) => r.status !== 'inactive').length;

/** StageSection (.pen I2wPze): "TAHAP n DARI m", per-type counts, not-relevant toggle, RiskTypeGroups. */
export function StageSection({
  db,
  model,
  access,
  editing,
  gapAnchors,
  threadUrl,
  actions,
}: Props) {
  const { stage, notRelevant } = model;
  const hasGap =
    gapAnchors.has(stageAnchor(stage.id)) ||
    model.subsections.some((s) => gapAnchors.has(subsectionAnchor(stage.id, s.riskType)));
  // Stages start collapsed; a publish gap inside opens them so the gap list can scroll there.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (hasGap) setOpen(true);
  }, [hasGap]);
  const hasPublished = model.subsections.some((s) =>
    s.risks.some((r) => r.status === 'active' || r.status === 'inactive'),
  );
  const total = model.subsections.reduce((n, s) => n + s.risks.length, 0);

  // Readers skip stages with nothing to read.
  if (!editing && !notRelevant && total === 0 && model.subsections.every((s) => !s.declaration))
    return null;

  const headId = `stage-h-${stage.id}`;
  return (
    <section
      id={stageAnchor(stage.id)}
      className={['stage', !stage.active && 'is-legacy', hasGap && 'has-gap']
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={headId}
    >
      <header className="stage__head">
        <button
          type="button"
          className="stage__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown aria-hidden className={open ? undefined : 'is-collapsed'} />
          <span className="stage__titles">
            <span className="t-eyebrow">
              {stage.active ? `Tahap ${model.index} dari ${model.total}` : 'Tahap tidak aktif'}
            </span>
            <span id={headId} className="stage__name">
              {stage.name}
            </span>
          </span>
        </button>
        <div className="stage__aside">
          <span className="stage__counts t-mono">
            {notRelevant
              ? 'Tidak relevan'
              : model.subsections.map((s) => `${SHORT[s.riskType]} ${counted(s)}`).join(' · ')}
          </span>
          {editing && stage.active && !hasPublished && (
            <Toggle
              label="Tahap ini tidak relevan tahun ini"
              checked={!!notRelevant}
              onChange={(on) => actions.setDeclaration(stage.id, null, on)}
            />
          )}
        </div>
      </header>
      {open && (
        <div className="stage__body">
          {!stage.active && (
            <p className="stage__legacy-note">
              Tahap ini sudah tidak aktif di Master Data; risiko yang terlanjur dipilih tetap
              ditampilkan.
            </p>
          )}
          {notRelevant ? (
            <ReasonBlock
              label="Alasan tahap tidak relevan"
              reason={notRelevant.reason}
              editing={editing}
              invalid={gapAnchors.has(stageAnchor(stage.id))}
              onSave={(r) => actions.setReason(stage.id, null, r)}
            />
          ) : (
            model.subsections.map((sub) => (
              <RiskTypeGroup
                key={sub.riskType}
                db={db}
                sub={sub}
                access={access}
                editing={editing && stage.active}
                gap={gapAnchors.has(subsectionAnchor(stage.id, sub.riskType))}
                threadUrl={threadUrl}
                actions={actions}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function RiskTypeGroup({
  db,
  sub,
  access,
  editing,
  gap,
  threadUrl,
  actions,
}: {
  db: DB;
  sub: SubsectionModel;
  access: RegisterAccess;
  editing: boolean;
  gap: boolean;
  threadUrl: (risk: RegisterRisk) => string | undefined;
  actions: StageActions;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (gap) setOpen(true);
  }, [gap]);
  const n = counted(sub);
  const hasPublished = sub.risks.some((r) => r.status === 'active' || r.status === 'inactive');
  const label = RISK_TYPE_LABEL[sub.riskType];
  if (!editing && sub.risks.length === 0 && !sub.declaration) return null;

  const submit = async () => {
    if (await actions.addCustomRisk(sub.stage.id, sub.riskType, text)) {
      setText('');
      setAdding(false);
    }
  };

  return (
    <div
      id={subsectionAnchor(sub.stage.id, sub.riskType)}
      className={['rtg', gap && 'has-gap'].filter(Boolean).join(' ')}
    >
      <div className="rtg__head">
        <h3 className="rtg__title">
          <button
            type="button"
            className="rtg__toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown aria-hidden className={open ? undefined : 'is-collapsed'} />
            {label}
            <span className="rtg__count t-mono">
              {sub.declaration ? 'tidak ada risiko' : `${n} dipilih`}
            </span>
          </button>
        </h3>
        {editing && !hasPublished && (
          <Checkbox
            label="Tidak ada risiko pada jenis ini"
            checked={!!sub.declaration}
            onChange={(e) => actions.setDeclaration(sub.stage.id, sub.riskType, e.target.checked)}
          />
        )}
      </div>
      {open && gap && !sub.declaration && (
        <p className="rtg__gap" role="note">
          <CircleAlert aria-hidden /> Belum ada risiko atau pernyataan “Tidak ada risiko pada jenis
          ini”.
        </p>
      )}
      {!open ? null : sub.declaration ? (
        <ReasonBlock
          label="Alasan tidak ada risiko"
          reason={sub.declaration.reason}
          editing={editing}
          invalid={gap}
          onSave={(r) => actions.setReason(sub.stage.id, sub.riskType, r)}
        />
      ) : (
        <>
          <div className="rtg__cards">
            {sub.risks.map((r) => (
              <RiskCard
                key={r.id}
                db={db}
                access={access}
                editing={editing}
                risk={r}
                mitigations={sub.mitigations[r.id] ?? []}
                threadUrl={threadUrl(r)}
                actions={actions}
              />
            ))}
            {sub.templates.map((t) => (
              <RiskCard
                key={t.id}
                db={db}
                access={access}
                editing={editing}
                template={t}
                actions={actions}
              />
            ))}
            {!editing && sub.risks.length === 0 && <p className="rtg__empty">Belum ada risiko.</p>}
          </div>
          {editing &&
            (adding ? (
              <div className="reg-add">
                <label className="field__label" htmlFor={`risk-${sub.stage.id}-${sub.riskType}`}>
                  Uraian risiko sendiri
                </label>
                <textarea
                  id={`risk-${sub.stage.id}-${sub.riskType}`}
                  className="control control--textarea"
                  rows={2}
                  autoFocus
                  value={text}
                  placeholder={`Uraikan risiko ${label.toLowerCase()} pada tahap ini`}
                  onChange={(e) => setText(e.target.value)}
                />
                <p className="field__helper">
                  Risiko sendiri dikirim sebagai usulan template saat register diterbitkan.
                </p>
                <div className="reg-add__actions">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAdding(false);
                      setText('');
                    }}
                  >
                    Batal
                  </Button>
                  <Button onClick={submit} disabled={!text.trim()}>
                    Tambah Risiko
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="link-add" onClick={() => setAdding(true)}>
                <Plus aria-hidden /> Risiko sendiri
              </button>
            ))}
        </>
      )}
    </div>
  );
}

function ReasonBlock({
  label,
  reason,
  editing,
  invalid,
  onSave,
}: {
  label: string;
  reason: string;
  editing: boolean;
  invalid: boolean;
  onSave: (reason: string) => void;
}) {
  const [value, setValue] = useState(reason);
  const id = useId();
  useEffect(() => setValue(reason), [reason]);
  if (!editing)
    return (
      <p className="declaration">
        <MarkerBadge
          kind="belum-relevan"
          label={label.startsWith('Alasan tahap') ? 'Tahap tidak relevan' : 'Tidak ada risiko'}
        />
        <em>{reason || '—'}</em>
      </p>
    );
  return (
    <div className={['field', 'reason-block', invalid && 'field--error'].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label}
        <span className="field__required" aria-hidden>
          {' '}
          *
        </span>
      </label>
      <textarea
        id={id}
        className="control control--textarea"
        rows={2}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== reason && onSave(value)}
      />
      {invalid && (
        <span className="field__error">
          <CircleAlert aria-hidden /> {label} wajib diisi.
        </span>
      )}
    </div>
  );
}
