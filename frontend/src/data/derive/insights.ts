// Pure derivations of the insights pages, moved out of the prototype module (B9) so pages do
// not bundle the local store. The fake backend re-exports them.

import type { MetricCard } from '@/test/fake/api/insights';

export function metricsCsv(cards: MetricCard[], year: number): string {
  const lines = ['tujuan,judul,periode,nilai,pembilang,penyebut'];
  for (const c of cards)
    for (const p of c.points.length
      ? c.points
      : [{ label: `TA ${year}`, value: null, numerator: 0, denominator: 0 }])
      lines.push(
        [
          c.objective,
          `"${c.title}"`,
          `"${p.label}"`,
          p.value === null ? '' : c.unit === 'percent' ? (p.value * 100).toFixed(1) : p.value,
          p.numerator,
          p.denominator,
        ].join(','),
      );
  return lines.join('\n');
}
