import { AtSign, Paperclip, Send, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button, Checkbox, InlineAlert, Toggle } from '@/components';
import type { NewFile } from '@/data/api/thread';
import type { Holding } from '@/domain/rules/access';
import { fileProblem, MAX_COMMENT_LENGTH, MAX_FILES, type Participant } from '@/domain/rules/board';
import type { Quarter } from '@/domain/types';
import { QUARTER_ROMAN } from '@/domain/calendar';
import { formatFileSize } from '@/lib/format';

export interface ComposerSubmit {
  body: string;
  quarterId: string;
  isStep: boolean;
  files: NewFile[];
  mentionUserIds: string[];
}

interface Props {
  holding: Holding;
  postingQuarter: Quarter;
  relatedQuarters: Quarter[];
  participants: Participant[];
  blindWarning: boolean;
  storage: { used: number; quota: number };
  placeholder: string;
  /** Mitigation sub-threads start collapsed to a one-line prompt. */
  compact?: boolean;
  onSend: (input: ComposerSubmit) => Promise<boolean>;
}

const tw = (q: Quarter) => `TW ${QUARTER_ROMAN[q.number - 1]}`;

/** Composer (.pen zanK1) with MentionSuggestionList (F8EKU). FR-PPN-003 … 007. */
export function Composer({
  holding,
  postingQuarter,
  relatedQuarters,
  participants,
  blindWarning,
  storage,
  placeholder,
  compact,
  onSend,
}: Props) {
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState('');
  const [isStep, setIsStep] = useState(false);
  const [quarterId, setQuarterId] = useState(postingQuarter.id);
  const [files, setFiles] = useState<(NewFile & { problem: string | null })[]>([]);
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { text: useId(), list: useId(), stepNote: useId(), counter: useId() };

  const earlier = quarterId !== postingQuarter.id;
  const lini1 = holding.line === 1;
  const lini3 = holding.line === 3;
  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return participants
      .filter((p) => p.name.toLowerCase().includes(q) || p.positionName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [participants, query]);
  const nearQuota = storage.used >= storage.quota * 0.9;

  if (!open)
    return (
      <button type="button" className="composer-prompt" onClick={() => setOpen(true)}>
        {placeholder}
      </button>
    );

  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\p{L} .]{0,30})$/u.exec(before);
    setQuery(m ? m[2]! : null);
    setActive(0);
  };

  const pick = (p: Participant) => {
    const el = textRef.current!;
    const caret = el.selectionStart;
    const before = body.slice(0, caret).replace(/@([\p{L} .]{0,30})$/u, `@${p.name} `);
    const next = before + body.slice(caret);
    setBody(next);
    setMentions((m) =>
      m.some((x) => x.id === p.userId) ? m : [...m, { id: p.userId, name: p.name }],
    );
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  const addFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    setFiles((prev) =>
      [
        ...prev,
        ...list.map((f) => ({
          name: f.name,
          size: f.size,
          mime: f.type || 'application/octet-stream',
          confidential: false,
          file: f,
          problem: fileProblem(f.name, f.size),
        })),
      ].slice(0, MAX_FILES + 5),
    );
  };

  const send = async () => {
    setError(null);
    if (!body.trim() && files.length === 0) {
      setError('Tulis komentar atau lampirkan berkas.');
      return;
    }
    if (files.length > MAX_FILES) {
      setError(`Maksimal ${MAX_FILES} berkas per komentar.`);
      return;
    }
    if (files.some((f) => f.problem)) {
      setError('Hapus berkas yang tidak dapat diunggah sebelum mengirim.');
      return;
    }
    setSending(true);
    const ok = await onSend({
      body,
      quarterId,
      isStep: lini1 && !earlier && isStep,
      files: files.map((f) => ({
        name: f.name,
        size: f.size,
        mime: f.mime,
        confidential: f.confidential,
        file: f.file,
      })),
      mentionUserIds: mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id),
    });
    setSending(false);
    if (ok) {
      setBody('');
      setFiles([]);
      setMentions([]);
      setIsStep(false);
      setQuarterId(postingQuarter.id);
      if (compact) setOpen(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        pick(suggestions[active]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="composer">
      {blindWarning && (
        <InlineAlert variant="warning" title="Perbandingan triwulan ini belum dibuka.">
          Hindari menyebutkan skor atau predikat penilaian Anda di utas ini.
        </InlineAlert>
      )}
      {nearQuota && (
        <InlineAlert variant="warning" title="Kuota penyimpanan hampir penuh">
          {formatFileSize(storage.used)} dari 1 GB terpakai untuk jabatan ini pada tahun anggaran
          ini.
        </InlineAlert>
      )}
      <div className="composer__box">
        <label className="sr-only" htmlFor={ids.text}>
          Komentar
        </label>
        <textarea
          id={ids.text}
          ref={textRef}
          className="composer__text"
          rows={compact ? 2 : 3}
          value={body}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder={`${placeholder} Ketik @ untuk menyebut peserta.`}
          autoFocus={compact}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={ids.list}
          aria-autocomplete="list"
          aria-activedescendant={suggestions.length ? `${ids.list}-${active}` : undefined}
          aria-describedby={body.length > MAX_COMMENT_LENGTH - 500 ? ids.counter : undefined}
          onChange={(e) => {
            setBody(e.target.value);
            detectMention(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
        />
        {suggestions.length > 0 && (
          <ul id={ids.list} role="listbox" className="mentions" aria-label="Peserta utas">
            {suggestions.map((p, i) => (
              <li
                key={p.userId}
                id={`${ids.list}-${i}`}
                role="option"
                aria-selected={i === active}
                className={['mentions__item', i === active && 'is-active']
                  .filter(Boolean)
                  .join(' ')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
              >
                <span className="mentions__name">{p.name}</span>
                <span className="mentions__pos">
                  Lini {p.holding.line} · {p.holding.capacity === 'operator' ? 'Operator ' : ''}
                  {p.positionName}
                </span>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <ul className="composer__files">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className={['composer__file', f.problem && 'has-problem'].filter(Boolean).join(' ')}
              >
                <span className="composer__file-name">{f.name}</span>
                <span className="composer__file-meta t-mono">
                  {f.problem ?? formatFileSize(f.size)}
                </span>
                {lini3 && !f.problem && (
                  <Toggle
                    label="Konfidensial"
                    checked={f.confidential}
                    onChange={(on) =>
                      setFiles((list) =>
                        list.map((x, j) => (j === i ? { ...x, confidential: on } : x)),
                      )
                    }
                  />
                )}
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label={`Hapus ${f.name}`}
                  onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
                >
                  <X aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="composer__bar">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.mp4"
            onChange={addFiles}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Lampirkan berkas"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip aria-hidden />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Sebut peserta"
            onClick={() => {
              const el = textRef.current!;
              const pos = el.selectionStart;
              const prefix = pos > 0 && !/\s/.test(body[pos - 1]!) ? ' @' : '@';
              const next = body.slice(0, pos) + prefix + body.slice(pos);
              setBody(next);
              setQuery('');
              requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(pos + prefix.length, pos + prefix.length);
              });
            }}
          >
            <AtSign aria-hidden />
          </button>
          {lini1 && (
            <Checkbox
              label="Tandai sebagai Langkah"
              checked={isStep && !earlier}
              disabled={earlier}
              aria-describedby={earlier ? ids.stepNote : undefined}
              onChange={(e) => setIsStep(e.target.checked)}
            />
          )}
          {relatedQuarters.length > 0 && (
            <label className="composer__quarter">
              <span className="sr-only">Triwulan terkait</span>
              <select
                className="control control--select"
                value={quarterId}
                onChange={(e) => setQuarterId(e.target.value)}
              >
                <option value={postingQuarter.id}>{tw(postingQuarter)} (berjalan)</option>
                {relatedQuarters.map((q) => (
                  <option key={q.id} value={q.id}>
                    Terkait {tw(q)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="composer__spacer" />
          {body.length > MAX_COMMENT_LENGTH - 500 && (
            <span id={ids.counter} className="composer__counter t-mono">
              {body.length.toLocaleString('id-ID')}/{MAX_COMMENT_LENGTH.toLocaleString('id-ID')}
            </span>
          )}
          {compact && (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
          )}
          <Button icon={Send} loading={sending} loadingLabel="Mengirim…" onClick={send}>
            Kirim
          </Button>
        </div>
      </div>
      {earlier && lini1 && (
        <p id={ids.stepNote} className="composer__note">
          Langkah selalu tercatat pada triwulan berjalan ({tw(postingQuarter)}); komentar yang
          dikaitkan ke triwulan sebelumnya tidak dapat ditandai sebagai Langkah.
        </p>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <p className="composer__hint">
        {holding.capacity === 'operator' ? 'Anda berkomentar sebagai Operator. ' : ''}Enter untuk
        baris baru · Ctrl+Enter untuk mengirim
      </p>
    </div>
  );
}
