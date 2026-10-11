import { useEffect, useId, useState } from 'react';
import type { Predicate } from '@/domain/types';
import { formatScore, parseScore } from '@/lib/format';
import { PredicateBadge } from '../Chips/Chips';
import './ScoreInput.css';

export interface ScoreInputProps {
  /** Accessible name, e.g. "Skor Lini 1 untuk [risiko]". */
  label: string;
  value: number | null;
  /** Derives the predicate from the quarter's band version while typing (RB-NIL-002). */
  predicateOf: (score: number) => Predicate | null;
  disabled?: boolean;
  /** Called with a valid score (or null when cleared) on blur / Enter. */
  onCommit: (score: number | null) => void;
}

/** ScoreInput (.pen Q0zcSS): mono 0,0–4,0 step 0,1 with a live predicate badge. */
export function ScoreInput({ label, value, predicateOf, disabled, onCommit }: ScoreInputProps) {
  const [text, setText] = useState(value === null ? '' : formatScore(value));
  const [error, setError] = useState(false);
  const errorId = useId();
  useEffect(() => {
    setText(value === null ? '' : formatScore(value));
    setError(false);
  }, [value]);
  const parsed = parseScore(text);
  const predicate = parsed !== null ? predicateOf(parsed) : null;

  const commit = () => {
    if (text.trim() === '') {
      setError(false);
      if (value !== null) onCommit(null);
      return;
    }
    if (parsed === null) {
      setError(true);
      return;
    }
    setError(false);
    setText(formatScore(parsed));
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <span className={['score-input', error && 'has-error'].filter(Boolean).join(' ')}>
      <input
        className="score-input__control"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={error || undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder="—"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          if (error && parseScore(e.target.value) !== null) setError(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') setText(value === null ? '' : formatScore(value));
        }}
      />
      {predicate ? (
        <PredicateBadge predicate={predicate} />
      ) : (
        <span className="score-input__range t-mono">0,0–4,0</span>
      )}
      {error && (
        <span id={errorId} className="score-input__error" role="alert">
          Skor 0,0–4,0
        </span>
      )}
    </span>
  );
}
