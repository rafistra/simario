// Score → predicate — PRD FR-MST-007, INV-3. Bands: lower bound exclusive, upper inclusive; the
// first band includes 0.

import type { Predicate, ScoreBand, ScoreOption } from './types';

export type BandLike = Pick<ScoreBand, 'lowerExclusive' | 'upperInclusive' | 'order' | 'predicate'>;

export function predicateFor(score: number, bands: BandLike[]): Predicate | null {
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

const tenths = (n: number) => Math.round(n * 10);

/** Options in dropdown order: worst (lowest value) to best. */
export function sortOptions<T extends { value: number }>(options: T[]): T[] {
  return [...options].sort((a, b) => a.value - b.value);
}

/** The option whose value equals the score (one-decimal precision). */
export function optionFor<T extends { value: number }>(score: number, options: T[]): T | null {
  return options.find((o) => tenths(o.value) === tenths(score)) ?? null;
}

export interface OptionProblem {
  kind: 'empty-label' | 'duplicate-label' | 'duplicate-value' | 'out-of-range' | 'band-uncovered';
  optionId?: string;
  predicate?: Predicate;
}

/** INV (PRD v2.8): labels/values unique, values 0–4 one decimal, every predicate has a statement. */
export function validateOptions(
  options: Pick<ScoreOption, 'id' | 'value' | 'label'>[],
  bands: BandLike[],
): OptionProblem[] {
  const problems: OptionProblem[] = [];
  const norm = (s: string) => s.trim().toLocaleLowerCase('id');
  const labels = new Set<string>();
  const values = new Set<number>();
  for (const o of options) {
    if (!o.label.trim()) problems.push({ kind: 'empty-label', optionId: o.id });
    else if (labels.has(norm(o.label))) problems.push({ kind: 'duplicate-label', optionId: o.id });
    else labels.add(norm(o.label));
    const valid =
      Number.isFinite(o.value) && o.value >= 0 && o.value <= 4 && tenths(o.value) === o.value * 10;
    if (!valid) problems.push({ kind: 'out-of-range', optionId: o.id });
    else if (values.has(tenths(o.value)))
      problems.push({ kind: 'duplicate-value', optionId: o.id });
    else values.add(tenths(o.value));
  }
  for (const b of [...bands].sort((x, y) => x.order - y.order)) {
    const covered = options.some(
      (o) => Number.isFinite(o.value) && predicateFor(o.value, bands) === b.predicate,
    );
    if (!covered) problems.push({ kind: 'band-uncovered', predicate: b.predicate });
  }
  return problems;
}

/** Seed migration: the nearest option value with the same predicate as `score` (ties → lower). */
export function snapToOption(
  score: number,
  options: { value: number }[],
  bands: BandLike[],
): number {
  const predicate = predicateFor(score, bands);
  const same = sortOptions(options).filter((o) => predicateFor(o.value, bands) === predicate);
  if (same.length === 0) throw new Error(`No score option for predicate ${predicate}`);
  return same.reduce((best, o) =>
    Math.abs(o.value - score) < Math.abs(best.value - score) ? o : best,
  ).value;
}
