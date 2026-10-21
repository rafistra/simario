import vectors from '@vectors/register.json';
import type { DB } from '@/test/fake/db';
import { loadVectors } from '@/test/vectors';
import {
  assessedInQuarter,
  completeStages,
  deactivationQuarter,
  registerGaps,
} from './rules/register';
import type { Quarter } from './types';

// Shared with backend/tests/domain/test_register_vectors.py (spec §4.9).
const rules = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

describe('shared vectors: registerGaps', () => {
  it.each(rules.registerGaps!)('$name', ({ input, expected }) => {
    const { db, registerId } = input as { db: DB; registerId: string };
    expect(registerGaps(db, registerId)).toEqual(expected);
  });
});

describe('shared vectors: completeStages', () => {
  it.each(rules.completeStages!)('$name', ({ input, expected }) => {
    const { db, registerId } = input as { db: DB; registerId: string };
    expect(completeStages(db, registerId)).toEqual(expected);
  });
});

describe('shared vectors: deactivationQuarter', () => {
  it.each(rules.deactivationQuarter!)('$name', ({ input, expected }) => {
    const { quarters, currentId } = input as { quarters: Quarter[]; currentId: string };
    const current = quarters.find((q) => q.id === currentId)!;
    expect(deactivationQuarter(quarters, current)?.id ?? null).toEqual(expected);
  });
});

describe('shared vectors: assessedInQuarter', () => {
  it.each(rules.assessedInQuarter!)('$name', ({ input, expected }) => {
    const { db, riskId } = input as { db: DB; riskId: string };
    const risk = db.risks.find((r) => r.id === riskId)!;
    const got = Object.fromEntries(
      Object.keys(expected as object).map((qid) => [
        qid,
        assessedInQuarter(
          db,
          risk,
          db.quarters.find((q) => q.id === qid)!,
        ),
      ]),
    );
    expect(got).toEqual(expected);
  });
});
