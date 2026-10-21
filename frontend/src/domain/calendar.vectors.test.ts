import vectors from '@vectors/calendar.json';
import { loadVectors } from '@/test/vectors';
import { quarterContaining } from './calendar';
import type { Quarter } from './types';

// Shared with backend/tests/domain/test_calendar_vectors.py (spec §4.9).
const rules = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

describe('shared vectors: quarterContaining', () => {
  it.each(rules.quarterContaining!)('$name', ({ input, expected }) => {
    const { quarters, day } = input as { quarters: Quarter[]; day: string };
    expect(quarterContaining(quarters, day)?.id ?? null).toEqual(expected);
  });
});
