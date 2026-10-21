import vectors from '@vectors/score-bands.json';
import { loadVectors } from '@/test/vectors';
import { predicateFor, validateBands, validateOptions, type BandLike } from './scoreBands';

// Shared with backend/tests/domain/test_score_bands_vectors.py (spec §4.9).
const rules = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

describe('shared vectors: predicateFor', () => {
  it.each(rules.predicateFor!)('$name', ({ input, expected }) => {
    const { score, bands } = input as { score: number; bands: BandLike[] };
    expect(predicateFor(score, bands)).toEqual(expected);
  });
});

describe('shared vectors: validateBands', () => {
  it.each(rules.validateBands!)('$name', ({ input, expected }) => {
    expect(validateBands((input as { bands: BandLike[] }).bands)).toEqual(expected);
  });
});

describe('shared vectors: validateOptions', () => {
  it.each(rules.validateOptions!)('$name', ({ input, expected }) => {
    const { options, bands } = input as {
      options: { id: string; value: number; label: string }[];
      bands: BandLike[];
    };
    expect(validateOptions(options, bands)).toEqual(expected);
  });
});
