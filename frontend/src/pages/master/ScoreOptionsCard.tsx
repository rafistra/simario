import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, PredicateBadge } from '@/components';
import { predicateFor, type OptionProblem } from '@/domain/scoreBands';
import type { ScoreBand, ScoreBandVersion, ScoreOption } from '@/domain/types';
import { formatScore, parseScore } from '@/lib/format';

const ROW_ERROR: Record<Exclude<OptionProblem['kind'], 'band-uncovered'>, string> = {
  'empty-label': 'Kalimat wajib diisi.',
  'duplicate-label': 'Kalimat sudah dipakai pilihan lain.',
  'duplicate-value': 'Nilai sudah dipakai pilihan lain.',
  'out-of-range': 'Nilai 0,0–4,0 dengan satu desimal.',
};

export interface ScoreOptionsCardProps {
  status: ScoreBandVersion['status'];
  options: ScoreOption[];
  bands: ScoreBand[];
  problems: OptionProblem[];
  /** Draft edits (local state); persisted by the page on blur. */
  onChange: (next: ScoreOption[]) => void;
  onPersist: () => void;
  /** Active version: commit one statement's text. */
  onLabelCommit: (optionId: string, label: string) => void;
}

/** "Pilihan penilaian" (PRD v2.8, FR-MST-007): statements and their hidden values per version. */
export function ScoreOptionsCard({
  status,
  options,
  bands,
  problems,
  onChange,
  onPersist,
  onLabelCommit,
}: ScoreOptionsCardProps) {
  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const draft = status === 'draft';
  const labelEditable = draft || status === 'active';
  const rowErrors = (id: string) =>
    problems
      .filter((p) => p.optionId === id)
      .map((p) => ROW_ERROR[p.kind as keyof typeof ROW_ERROR]);
  const update = (id: string, patch: Partial<ScoreOption>) =>
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <Card title="Pilihan penilaian (tampil sebagai dropdown di halaman penilaian)">
      <p className="opt-help">
        Pengguna hanya melihat kalimat. Nilai dipakai untuk menentukan predikat dan tidak
        ditampilkan.
      </p>
      <div className="opt-table" role="table" aria-label="Pilihan penilaian">
        <div role="row" className="opt-table__head">
          <span role="columnheader">Kalimat</span>
          <span role="columnheader">Nilai</span>
          <span role="columnheader">Predikat</span>
          <span role="columnheader">
            <span className="sr-only">Tindakan</span>
          </span>
        </div>
        {options.map((o, i) => {
          const errors = rowErrors(o.id);
          const predicate = Number.isFinite(o.value) ? predicateFor(o.value, bands) : null;
          return (
            <div
              role="row"
              key={o.id}
              className={['opt-table__row', errors.length > 0 && 'is-invalid']
                .filter(Boolean)
                .join(' ')}
            >
              <span role="cell">
                <input
                  className="control"
                  aria-label={`Kalimat pilihan ${i + 1}`}
                  aria-invalid={errors.length > 0 || undefined}
                  disabled={!labelEditable}
                  value={o.label}
                  onChange={(e) => update(o.id, { label: e.target.value })}
                  onBlur={(e) => (draft ? onPersist() : onLabelCommit(o.id, e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
                {errors.map((m) => (
                  <span key={m} className="field__error">
                    {m}
                  </span>
                ))}
              </span>
              <span role="cell">
                <input
                  className="control t-mono opt-table__value"
                  aria-label={`Nilai pilihan ${i + 1}`}
                  disabled={!draft}
                  value={rawValues[o.id] ?? formatScore(o.value)}
                  onChange={(e) => {
                    setRawValues((s) => ({ ...s, [o.id]: e.target.value }));
                    update(o.id, { value: parseScore(e.target.value) ?? Number.NaN });
                  }}
                  onBlur={() => {
                    setRawValues((s) => {
                      const rest = { ...s };
                      delete rest[o.id];
                      return rest;
                    });
                    onPersist();
                  }}
                />
              </span>
              <span role="cell">
                {predicate ? (
                  <PredicateBadge predicate={predicate} />
                ) : (
                  <span className="field__error">Di luar pita</span>
                )}
              </span>
              <span role="cell">
                {draft && (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    aria-label={`Hapus pilihan ${i + 1}`}
                    onClick={() => {
                      onChange(options.filter((x) => x.id !== o.id));
                      onPersist();
                    }}
                  >
                    <Trash2 aria-hidden />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="opt-actions">
        <Button
          variant="secondary"
          icon={Plus}
          disabled={!draft}
          onClick={() =>
            onChange([
              ...options,
              {
                id: `so-${crypto.randomUUID()}`,
                versionId: options[0]?.versionId ?? '',
                value: Number.NaN,
                label: '',
                order: options.length + 1,
              },
            ])
          }
        >
          Tambah Pilihan
        </Button>
        {status === 'active' && (
          <span className="opt-help">Ubah nilai atau jumlah pilihan lewat Buat Versi Baru.</span>
        )}
      </div>
    </Card>
  );
}
