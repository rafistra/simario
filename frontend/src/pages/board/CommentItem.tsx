import { Ellipsis, Lock, LockOpen, Pencil, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  AttachmentFileChip,
  AttachmentImageChip,
  Avatar,
  Button,
  ConfidentialAttachmentsChip,
  LineChip,
  MarkerBadge,
} from '@/components';
import type { ThreadComment } from '@/data/api/board';
import { formatDateTime, formatFileSize, formatRelative } from '@/lib/format';

interface Props {
  comment: ThreadComment;
  at: string;
  highlighted: boolean;
  /** The viewer may switch confidentiality off (permission 25). */
  canUnsetConfidential: boolean;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onWithdraw: (id: string) => void;
  onConfidential: (attachmentId: string, on: boolean) => void;
}

const EXT_LABEL = (name: string) => name.split('.').pop()?.toUpperCase() ?? '';

/** Renders @Nama mentions as emphasised text. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[A-Z][\p{L}.]+(?: [A-Z][\p{L}.]+){0,3})/u);
  return (
    <p className="comment__body">
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="comment__mention">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </p>
  );
}

/** Comment (.pen O9QvHa): author, line chip, capacity, time, body, attachments, Langkah, menu. */
export function CommentItem({
  comment: c,
  at,
  highlighted,
  canUnsetConfidential,
  onEdit,
  onWithdraw,
  onConfidential,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body ?? '');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !menuRef.current?.contains(e.target as Node)
      )
        setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  const recent = at.slice(0, 10) === c.createdAt.slice(0, 10);
  const when = recent ? formatRelative(c.createdAt, at) : formatDateTime(c.createdAt);
  const who = c.capacity === 'operator' ? `sebagai Operator ${c.positionName}` : c.positionName;

  return (
    <article
      id={`komentar-${c.id}`}
      className={['comment', highlighted && 'is-highlighted', c.body === null && 'is-withdrawn']
        .filter(Boolean)
        .join(' ')}
      aria-label={`Komentar ${c.authorName}`}
    >
      <Avatar name={c.authorName} size={32} />
      <div className="comment__main">
        <header className="comment__head">
          <span className="comment__author">{c.authorName}</span>
          <LineChip line={c.line} />
          <span className="comment__who">{who}</span>
          <span className="comment__time" title={formatDateTime(c.createdAt)}>
            · {when}
            {c.edited && ' (disunting)'}
          </span>
          <span className="comment__tools">
            {c.isStep && <MarkerBadge kind="langkah" />}
            {(c.canEdit || c.canWithdraw) && !editing && (
              <span className="menu-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label="Tindakan komentar"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  onClick={() => setMenu((v) => !v)}
                >
                  <Ellipsis aria-hidden />
                </button>
                {menu && (
                  <span className="menu" role="menu">
                    {c.canEdit && (
                      <button
                        type="button"
                        role="menuitem"
                        className="menu__item"
                        onClick={() => {
                          setMenu(false);
                          setDraft(c.body ?? '');
                          setEditing(true);
                        }}
                      >
                        <Pencil aria-hidden /> Sunting
                      </button>
                    )}
                    {c.canWithdraw && (
                      <button
                        type="button"
                        role="menuitem"
                        className="menu__item menu__item--danger"
                        onClick={() => {
                          setMenu(false);
                          onWithdraw(c.id);
                        }}
                      >
                        <Undo2 aria-hidden /> Tarik
                      </button>
                    )}
                  </span>
                )}
              </span>
            )}
          </span>
        </header>
        {c.body === null ? (
          <p className="comment__withdrawn">{c.withdrawnText}</p>
        ) : editing ? (
          <div className="comment__edit">
            <label className="sr-only" htmlFor={`edit-${c.id}`}>
              Sunting komentar
            </label>
            <textarea
              id={`edit-${c.id}`}
              className="control control--textarea"
              rows={3}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (await onEdit(c.id, draft)) setEditing(false);
                }
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <p className="field__helper">
              Komentar hanya dapat disunting dalam 15 menit setelah dikirim.
            </p>
            <div className="comment__edit-actions">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Batal
              </Button>
              <Button
                disabled={!draft.trim()}
                onClick={async () => {
                  if (await onEdit(c.id, draft)) setEditing(false);
                }}
              >
                Simpan
              </Button>
            </div>
          </div>
        ) : (
          c.body && <Body text={c.body} />
        )}
        {(c.attachments.length > 0 || c.confidentialHidden > 0) && (
          <div className="comment__files">
            {c.attachments.map(({ attachment: a, scanning }) => (
              <span key={a.id} className="comment__file">
                {a.mimeType.startsWith('image/') && !scanning ? (
                  <AttachmentImageChip name={a.filename} />
                ) : (
                  <AttachmentFileChip
                    name={a.filename}
                    meta={`${EXT_LABEL(a.filename)} · ${formatFileSize(a.sizeBytes)}`}
                    scanning={scanning}
                    confidential={a.isConfidential}
                    href={`data:${a.mimeType};charset=utf-8,${encodeURIComponent(`Berkas contoh SIMARIO: ${a.filename}`)}`}
                  />
                )}
                {c.isOwn && c.line === 3 && !a.isConfidential && !scanning && (
                  <button
                    type="button"
                    className="comment__file-action"
                    onClick={() => onConfidential(a.id, true)}
                  >
                    <Lock aria-hidden /> Jadikan konfidensial
                  </button>
                )}
                {a.isConfidential && canUnsetConfidential && (
                  <button
                    type="button"
                    className="comment__file-action"
                    onClick={() => onConfidential(a.id, false)}
                  >
                    <LockOpen aria-hidden /> Matikan konfidensial
                  </button>
                )}
              </span>
            ))}
            {c.confidentialHidden > 0 && (
              <ConfidentialAttachmentsChip count={c.confidentialHidden} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
