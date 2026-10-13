import { ChevronDown } from 'lucide-react';
import type { Predicate } from '@/domain/types';
import { PredicateBadge } from '../Chips/Chips';
import '../Form/Form.css';
import './ScoreInput.css';

export interface ScoreOptionItem {
  value: number;
  label: string;
  predicate: Predicate | null;
}

export interface ScoreInputProps {
  /** Accessible name, e.g. "Penilaian Lini 1 · PPK A-1 untuk [risiko]". */
  label: string;
  /** The quarter version's statements, worst to best (no numbers shown). */
  options: ScoreOptionItem[];
  value: number | null;
  disabled?: boolean;
  /** Called with the chosen option value, or null when "— Pilih penilaian —" is chosen. */
  onCommit: (value: number | null) => void;
}

/** ScoreInput (.pen Q0zcSS) — PRD v2.8: a statement dropdown; the predicate shows once chosen. */
export function ScoreInput({ label, options, value, disabled, onCommit }: ScoreInputProps) {
  const selected = value === null ? null : (options.find((o) => o.value === value) ?? null);
  return (
    <span className="score-input">
      <span className="control-wrap score-input__wrap">
        <select
          className="control control--select score-input__control"
          aria-label={label}
          disabled={disabled}
          value={selected ? String(selected.value) : ''}
          onChange={(e) => {
            const next = e.target.value === '' ? null : Number(e.target.value);
            if (next !== value) onCommit(next);
          }}
        >
          <option value="">— Pilih penilaian —</option>
          {options.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="control-wrap__icon" aria-hidden />
      </span>
      {selected?.predicate && <PredicateBadge predicate={selected.predicate} />}
    </span>
  );
}
