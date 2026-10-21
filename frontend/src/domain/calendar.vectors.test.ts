import vectors from '@vectors/calendar.json';
import { loadVectors } from '@/test/vectors';
import { quarterProblems } from '@/data/api/calendar';
import { addWorkdays, defaultQuarters, latenessAt, quarterContaining } from './calendar';
import type { Quarter } from './types';

// Shared with backend/tests/domain/test_calendar_vectors.py (spec §4.9).
const rules = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

describe('shared vectors: quarterContaining', () => {
  it.each(rules.quarterContaining!)('$name', ({ input, expected }) => {
    const { quarters, day } = input as { quarters: Quarter[]; day: string };
    expect(quarterContaining(quarters, day)?.id ?? null).toEqual(expected);
  });
});

describe('shared vectors: defaultQuarters', () => {
  it.each(rules.defaultQuarters!)('$name', ({ input, expected }) => {
    const rows = defaultQuarters((input as { year: number }).year).map((q) => {
      const row: Partial<Quarter> = { ...q };
      delete row.id;
      delete row.fiscalYear;
      delete row.scoreBandVersionId;
      return row;
    });
    expect(rows).toEqual(expected);
  });
});

describe('shared vectors: addWorkdays', () => {
  it.each(rules.addWorkdays!)('$name', ({ input, expected }) => {
    const { iso, workdays } = input as { iso: string; workdays: number };
    expect(addWorkdays(iso, workdays)).toEqual(expected);
  });
});

describe('shared vectors: latenessAt', () => {
  it.each(rules.latenessAt!)('$name', ({ input, expected }) => {
    const { at, deadline, toleranceDays } = input as {
      at: string;
      deadline: string;
      toleranceDays: number;
    };
    expect(latenessAt(at, deadline, toleranceDays)).toEqual(expected);
  });
});

describe('shared vectors: quarterProblems', () => {
  it.each(rules.quarterProblems!)('$name', ({ input, expected }) => {
    const { year, quarters } = input as { year: number; quarters: Quarter[] };
    expect(quarterProblems(year, quarters)).toEqual(expected);
  });
});
