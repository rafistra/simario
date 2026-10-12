import { Check, X } from 'lucide-react';
import type { OpenedChip } from '@/domain/rules/board';
import { PREDICATE_LABEL, type Predicate } from '@/domain/types';

// "Terkendali dengan Baik" has no short form (user decision).
const SHORT: Record<Predicate, string> = {
  kurang: 'Kurang',
  cukup: 'Cukup',
  terkendali: PREDICATE_LABEL.terkendali,
};
const LONG = PREDICATE_LABEL;

/** Latest opened predicate chips (L1, each Lini 3 with ✓/✕) — FR-PPN-001, VIS-2. */
export function PredicateChips({ chips, hidden }: { chips: OpenedChip[]; hidden?: boolean }) {
  if (hidden || chips.length === 0) return <span className="pchips__none">—</span>;
  return (
    <span className="pchips">
      {chips.map((c) => {
        const tone = c.predicate ?? 'none';
        const label = c.predicate ? SHORT[c.predicate] : c.line === 1 ? 'Tidak dinilai' : '—';
        const result =
          c.result === 'sesuai'
            ? 'Sesuai'
            : c.result === 'tidak_sesuai'
              ? 'Tidak Sesuai'
              : c.result
                ? 'Tidak dapat dibandingkan'
                : '';
        return (
          <span
            key={c.positionId + c.label}
            className={`pchip pchip--${tone}`}
            title={`${c.label}: ${c.predicate ? LONG[c.predicate] : label}${result ? ` · ${result}` : ''}`}
          >
            <span className="pchip__who">{c.label}</span>
            {label}
            {c.result === 'sesuai' && <Check aria-label="Sesuai" />}
            {c.result === 'tidak_sesuai' && <X aria-label="Tidak Sesuai" />}
          </span>
        );
      })}
    </span>
  );
}
