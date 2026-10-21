import vectors from '@vectors/score-bands.json';
import { predicateFor, validateBands, type BandLike } from './scoreBands';

// Shared with backend/tests/domain/test_score_bands_vectors.py (spec §4.9).
const fixtures = vectors.fixtures as unknown as Record<string, BandLike[]>;
const bandsOf = (value: unknown): BandLike[] =>
  typeof value === 'string' ? fixtures[value]! : (value as BandLike[]);

describe('shared vectors: predicateFor', () => {
  it.each(vectors.rules.predicateFor)('$name', ({ input, expected }) => {
    expect(predicateFor(input.score, bandsOf(input.bands))).toEqual(expected);
  });
});

describe('shared vectors: validateBands', () => {
  it.each(vectors.rules.validateBands)('$name', ({ input, expected }) => {
    expect(validateBands(bandsOf(input.bands))).toEqual(expected);
  });
});
