import { Check, Ellipsis, Lock, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, MarkerBadge } from '@/components';
import type { DB } from '@/data/db';
import { inactiveLabel } from '@/domain/rules/register';
import type {
  MitigationTemplate,
  RegisterMitigation,
  RegisterRisk,
  RiskTemplate,
} from '@/domain/types';
import type { RegisterAccess } from '@/data/api/registerView';

const isPublished = (x: { status: string }) => x.status === 'active' || x.status === 'inactive';

export interface RiskCardActions {
  selectTemplate: (templateId: string) => void;
  deselect: (risk: RegisterRisk) => void;
  toggleMitigation: (riskId: string, mtplId: string, on: boolean) => void;
  addMitigation: (riskId: string, text: string) => Promise<boolean>;
  deleteMitigation: (mitigationId: string) => void;
  deactivateRisk: (risk: RegisterRisk) => void;
  deactivateMitigation: (m: RegisterMitigation, risk: RegisterRisk) => void;
}

interface Props {
  db: DB;
  access: RegisterAccess;
  editing: boolean;
  /** Either an unchosen template or a register risk. */
  template?: RiskTemplate;
  risk?: RegisterRisk;
  /** The risk's mitigations as this viewer may see them (filtered in the data layer). */
  mitigations?: RegisterMitigation[];
  threadUrl?: string;
  actions: RiskCardActions;
}

/** RiskCard (.pen tlgSD): select box, source tag, mitigation list, markers. */
export function RiskCard({
  db,
  access,
  editing,
  template,
  risk,
  mitigations = [],
  threadUrl,
  actions,
}: Props) {
  const tpl =
    template ??
    (risk?.riskTemplateId ? db.riskTemplates.find((t) => t.id === risk.riskTemplateId) : undefined);
  const mtpls: MitigationTemplate[] = tpl
    ? db.mitigationTemplates
        .filter((m) => m.riskTemplateId === tpl.id && m.active)
        .sort((a, b) => a.order - b.order)
    : [];
  const mits = risk ? mitigations : [];
  const published = risk ? isPublished(risk) : false;
  const inactive = risk?.status === 'inactive';
  const selected = !!risk;
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const canEditItems = editing && !inactive;

  const description = risk?.descriptionSnapshot ?? tpl!.description;
  const chosenFromTpl = new Map(
    mits
      .filter((m) => m.mitigationTemplateId && m.status !== 'inactive')
      .map((m) => [m.mitigationTemplateId!, m]),
  );
  const activeMits = mits.filter((m) => m.status !== 'inactive').length;
  const countText = !risk
    ? `${mtpls.length} mitigasi tersedia`
    : editing && mtpls.length > 0
      ? `${chosenFromTpl.size} dari ${mtpls.length} mitigasi dipilih${mits.some((m) => m.isCustom) ? ` · ${mits.filter((m) => m.isCustom && m.status !== 'inactive').length} mitigasi sendiri` : ''}`
      : `${activeMits} mitigasi`;

  const sourceTag = risk?.isCustom
    ? `RISIKO SENDIRI${risk.status === 'active' || risk.status === 'inactive' ? ' · DIUSULKAN' : ''}`
    : 'TEMPLATE';
  const addition =
    risk &&
    risk.status !== 'active' &&
    risk.status !== 'inactive' &&
    risk.registerId &&
    db.registers.find((r) => r.id === risk.registerId)?.status === 'published';

  const noMitigation =
    risk && (risk.flags.includes('no_mitigation') || (!published && activeMits === 0 && selected));
  const templateInactive =
    risk?.flags.includes('template_inactive') || (tpl && !tpl.active && !!risk && !published);

  const onSubmitMitigation = async () => {
    if (!risk) return;
    if (await actions.addMitigation(risk.id, text)) {
      setText('');
      setAdding(false);
    }
  };

  return (
    <article
      className={[
        'risk-card',
        selected && 'is-selected',
        inactive && 'is-inactive',
        !selected && 'is-template',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="risk-card__head">
        {editing && !published && !inactive ? (
          <label className="risk-card__select">
            <input
              type="checkbox"
              className="checkbox__input"
              checked={selected}
              onChange={() => (risk ? actions.deselect(risk) : actions.selectTemplate(tpl!.id))}
              aria-label={`${selected ? 'Batalkan pilihan' : 'Pilih'} risiko: ${description}`}
            />
            <span className="checkbox__box" aria-hidden>
              <Check className="checkbox__check" />
            </span>
          </label>
        ) : published ? (
          <span className="risk-card__lock" title="Uraian terkunci setelah diterbitkan">
            <Lock aria-hidden />
            <span className="sr-only">Diterbitkan, uraian terkunci</span>
          </span>
        ) : null}
        <div className="risk-card__body">
          <p className="risk-card__desc">{description}</p>
          <div className="risk-card__meta">
            <span className="risk-card__source">
              {sourceTag}
              {addition ? ' · TAMBAHAN' : ''}
            </span>
            <span className="risk-card__count">{countText}</span>
          </div>
          {(noMitigation || templateInactive || inactive || risk?.status === 'ready') && (
            <div className="risk-card__markers">
              {inactive && <MarkerBadge kind="nonaktif" label={inactiveLabel(db, risk!)} />}
              {noMitigation && !inactive && <MarkerBadge kind="tanpa-mitigasi" />}
              {templateInactive && (
                <MarkerBadge kind="nonaktif" label="Template sudah tidak aktif" />
              )}
              {risk?.status === 'ready' && (
                <span className="risk-card__ready">Siap Diterbitkan</span>
              )}
            </div>
          )}
          {inactive && risk?.deactivationReason && (
            <p className="risk-card__reason">Alasan: {risk.deactivationReason}</p>
          )}
        </div>
        <div className="risk-card__tools">
          {editing && risk && !published && risk.isCustom && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Hapus risiko"
              onClick={() => actions.deselect(risk)}
            >
              <Trash2 aria-hidden />
            </button>
          )}
          {risk && published && (threadUrl || (access.canPublish && !inactive)) && (
            <RiskMenu
              threadUrl={threadUrl}
              onDeactivate={
                access.canPublish && !inactive ? () => actions.deactivateRisk(risk) : undefined
              }
            />
          )}
        </div>
      </div>

      {selected && (mits.length > 0 || canEditItems) && (
        <div className="risk-card__mits">
          <p className="t-eyebrow">
            {canEditItems ? 'Mitigasi · pilih yang dilaksanakan' : 'Mitigasi'}
          </p>
          <ul>
            {canEditItems &&
              mtpls.map((m) => {
                const chosen = chosenFromTpl.get(m.id);
                const locked = chosen && isPublished(chosen);
                return (
                  <li key={m.id} className="mit-row">
                    <label
                      className={['mit-check', locked && 'is-locked'].filter(Boolean).join(' ')}
                    >
                      <input
                        type="checkbox"
                        className="checkbox__input"
                        checked={!!chosen}
                        disabled={!!locked}
                        onChange={(e) => actions.toggleMitigation(risk!.id, m.id, e.target.checked)}
                      />
                      <span className="checkbox__box" aria-hidden>
                        <Check className="checkbox__check" />
                      </span>
                      <span>{m.description}</span>
                    </label>
                    {locked && access.canPublish && (
                      <button
                        type="button"
                        className="mit-row__action"
                        onClick={() => actions.deactivateMitigation(chosen, risk!)}
                      >
                        Nonaktifkan
                      </button>
                    )}
                  </li>
                );
              })}
            {mits
              .filter(
                (m) =>
                  !canEditItems ||
                  !m.mitigationTemplateId ||
                  m.status === 'inactive' ||
                  !mtpls.some((t) => t.id === m.mitigationTemplateId),
              )
              .map((m) => (
                <li
                  key={m.id}
                  className={['mit-row', m.status === 'inactive' && 'is-inactive']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="mit-row__text">
                    {canEditItems ? null : <span className="mit-row__dot" aria-hidden />}
                    {m.descriptionSnapshot}
                    {m.isCustom && <span className="mit-row__tag">MITIGASI SENDIRI</span>}
                    {m.status === 'inactive' && (
                      <span className="mit-row__inactive">
                        Nonaktif{m.deactivationReason ? ` — ${m.deactivationReason}` : ''}
                      </span>
                    )}
                    {m.status === 'ready' && (
                      <span className="risk-card__ready">Siap Diterbitkan</span>
                    )}
                  </span>
                  {canEditItems && !isPublished(m) && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      aria-label="Hapus mitigasi"
                      onClick={() => actions.deleteMitigation(m.id)}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  )}
                  {canEditItems && m.status === 'active' && m.isCustom && access.canPublish && (
                    <button
                      type="button"
                      className="mit-row__action"
                      onClick={() => actions.deactivateMitigation(m, risk!)}
                    >
                      Nonaktifkan
                    </button>
                  )}
                </li>
              ))}
            {!canEditItems && mits.length === 0 && (
              <li className="mit-row mit-row--empty">Belum ada mitigasi.</li>
            )}
          </ul>
          {canEditItems &&
            (adding ? (
              <div className="reg-add">
                <label className="sr-only" htmlFor={`mit-${risk!.id}`}>
                  Uraian mitigasi sendiri
                </label>
                <textarea
                  id={`mit-${risk!.id}`}
                  className="control control--textarea"
                  rows={2}
                  autoFocus
                  value={text}
                  placeholder="Uraikan mitigasi yang akan dilaksanakan"
                  onChange={(e) => setText(e.target.value)}
                />
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
                  <Button onClick={onSubmitMitigation} disabled={!text.trim()}>
                    Tambah Mitigasi
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="link-add" onClick={() => setAdding(true)}>
                <Plus aria-hidden /> Mitigasi sendiri
              </button>
            ))}
        </div>
      )}
    </article>
  );
}

function RiskMenu({ threadUrl, onDeactivate }: { threadUrl?: string; onDeactivate?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Tindakan risiko"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Ellipsis aria-hidden />
      </button>
      {open && (
        <div className="menu" role="menu">
          {threadUrl && (
            <Link role="menuitem" className="menu__item" to={threadUrl}>
              <MessageSquare aria-hidden /> Lihat utas
            </Link>
          )}
          {onDeactivate && (
            <button
              type="button"
              role="menuitem"
              className="menu__item menu__item--danger"
              onClick={() => {
                setOpen(false);
                onDeactivate();
              }}
            >
              Nonaktifkan risiko
            </button>
          )}
        </div>
      )}
    </div>
  );
}
