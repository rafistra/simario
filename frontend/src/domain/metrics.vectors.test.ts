import vectors from '@vectors/metrics.json';
import type { DB } from '@/data/db';
import { buildMetrics } from '@/data/api/insights';
import { loadVectors } from '@/test/vectors';

// Shared with backend/tests/insights/test_metrics.py (spec §4.9).
const v = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

describe('shared vectors: metrics', () => {
  it.each(v.buildMetrics!)('buildMetrics $name', ({ input, expected }) => {
    const { db, year, at } = input as { db: DB; year: number; at: string };
    expect(buildMetrics(db, year, at)).toEqual(expected);
  });
});
