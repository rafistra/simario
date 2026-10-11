// Score → predicate — PRD FR-MST-007, INV-3. Bands: lower bound exclusive, upper inclusive; the
// first band includes 0.

import type { Predicate, ScoreBand } from './types';

export function predicateFor(score: number, bands: ScoreBand[]): Predicate | null {
  const sorted = [...bands].sort((a, b) => a.order - b.order);
  for (const band of sorted) {
    const aboveLower = band.lowerExclusive === null ? score >= 0 : score > band.lowerExclusive;
    if (aboveLower && score <= band.upperInclusive) return band.predicate;
  }
  return null;
}

export interface BandProblem {
  kind: 'gap' | 'overlap' | 'range';
  from: number;
  to: number;
}

/** Validates that bands cover 0,0–4,0 with no gap or overlap (INV-3), at one-decimal precision. */
export function validateBands(
  bands: Pick<ScoreBand, 'lowerExclusive' | 'upperInclusive' | 'order'>[],
): BandProblem[] {
  const problems: BandProblem[] = [];
  const sorted = [...bands].sort((a, b) => a.order - b.order);
  const lowerOf = (b: (typeof sorted)[0]) => b.lowerExclusive ?? 0;
  if (sorted.length === 0) return [{ kind: 'range', from: 0, to: 4 }];
  if (sorted[0]!.lowerExclusive !== null && sorted[0]!.lowerExclusive >= 0) {
    problems.push({ kind: 'gap', from: 0, to: sorted[0]!.lowerExclusive });
  }
  for (let i = 1; i < sorted.length; i++) {
    const prevUpper = sorted[i - 1]!.upperInclusive;
    const lower = lowerOf(sorted[i]!);
    if (lower > prevUpper) problems.push({ kind: 'gap', from: prevUpper, to: lower });
    if (lower < prevUpper) problems.push({ kind: 'overlap', from: lower, to: prevUpper });
  }
  const last = sorted[sorted.length - 1]!.upperInclusive;
  if (last !== 4) problems.push({ kind: last < 4 ? 'gap' : 'range', from: last, to: 4 });
  return problems;
}
