import vectors from '@vectors/sheets.json';
import type { DB } from '@/data/db';
import { loadVectors } from '@/test/vectors';
import { latestOpenedQuarter, lembarMutu } from './rules/sheets';
import { viewerFor } from './rules/visibility';

// Shared with backend/tests/domain/test_sheets_vectors.py (spec §4.9).
const v = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

type In = { db: DB; userId: string; at: string };

describe('shared vectors: sheets', () => {
  it.each(v.lembarMutu!)('lembarMutu $name', ({ input, expected }) => {
    const { db, userId, at } = input as In;
    const viewer = viewerFor(db, userId, at.slice(0, 10));
    const got = Object.fromEntries(
      Object.keys(expected as object).map((key) => {
        const [p, qid] = key.split('|') as [string, string];
        const m = lembarMutu(
          db,
          viewer,
          p,
          db.quarters.find((q) => q.id === qid)!,
          at,
        );
        return [
          key,
          {
            quarterId: m.quarter.id,
            assessors: m.assessors,
            rows: m.rows,
            sesuai: m.sesuai,
            tidakSesuai: m.tidakSesuai,
            berulang: m.berulang,
            notAssessedL1: m.notAssessedL1.map((r) => r.id),
            anyOpened: m.anyOpened,
          },
        ];
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.latestOpenedQuarter!)('latestOpenedQuarter $name', ({ input, expected }) => {
    const { db, at } = input as In;
    const got = Object.fromEntries(
      Object.keys(expected as object).map((p) => [p, latestOpenedQuarter(db, p, at)?.id ?? null]),
    );
    expect(got).toEqual(expected);
  });
});
