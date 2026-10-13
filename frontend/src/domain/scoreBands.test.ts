import { optionFor, snapToOption, sortOptions, validateOptions } from './scoreBands';
import type { ScoreBand } from './types';

const band = (
  predicate: ScoreBand['predicate'],
  lowerExclusive: number | null,
  upperInclusive: number,
  order: number,
) => ({ predicate, lowerExclusive, upperInclusive, order });
const V1 = [band('kurang', null, 2, 1), band('cukup', 2, 3, 2), band('terkendali', 3, 4, 3)];
const opt = (id: string, value: number, label = `Kalimat ${id}`) => ({ id, value, label });
const FIVE = [opt('a', 0), opt('b', 1), opt('c', 2), opt('d', 3), opt('e', 4)];

describe('score options', () => {
  it('sorts by value and finds an exact value match', () => {
    expect(sortOptions([opt('x', 3), opt('y', 0)]).map((o) => o.id)).toEqual(['y', 'x']);
    expect(optionFor(3, FIVE)?.id).toBe('d');
    expect(optionFor(0, FIVE)?.id).toBe('a');
    expect(optionFor(2.5, FIVE)).toBeNull();
  });

  it('accepts the five seed statements under Versi 1 bands', () => {
    expect(validateOptions(FIVE, V1)).toEqual([]);
  });

  it('reports empty, duplicate and out-of-range options', () => {
    const problems = validateOptions(
      [
        opt('a', 0, ' '),
        opt('b', 1, 'Sama'),
        opt('c', 1, 'sama '),
        opt('d', 4.25),
        opt('e', 3),
        opt('f', 4),
      ],
      V1,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        { kind: 'empty-label', optionId: 'a' },
        { kind: 'duplicate-label', optionId: 'c' },
        { kind: 'duplicate-value', optionId: 'c' },
        { kind: 'out-of-range', optionId: 'd' },
      ]),
    );
  });

  it('flags a predicate with no statement, evaluated against the same version bands', () => {
    // Draft Versi 2 seed bands: gap 1,9–2,0, so value 2 has no predicate and Cukup is uncovered.
    const v2 = [
      band('kurang', null, 1.9, 1),
      band('cukup', 2, 2.9, 2),
      band('terkendali', 2.9, 4, 3),
    ];
    expect(validateOptions(FIVE, v2)).toEqual([{ kind: 'band-uncovered', predicate: 'cukup' }]);
    expect(validateOptions([opt('a', 0), opt('e', 4)], V1)).toEqual([
      { kind: 'band-uncovered', predicate: 'cukup' },
    ]);
  });

  it('flags NaN values (unparseable input) as out of range', () => {
    expect(validateOptions([...FIVE, opt('z', Number.NaN)], V1)).toContainEqual({
      kind: 'out-of-range',
      optionId: 'z',
    });
  });

  it('snaps a legacy score to the nearest option with the same predicate', () => {
    expect(snapToOption(2.7, FIVE, V1)).toBe(3);
    expect(snapToOption(2.1, FIVE, V1)).toBe(3);
    expect(snapToOption(3.4, FIVE, V1)).toBe(4);
    expect(snapToOption(1.8, FIVE, V1)).toBe(2);
    expect(snapToOption(1.6, FIVE, V1)).toBe(2);
    expect(snapToOption(0.5, FIVE, V1)).toBe(0); // tie → lower
    expect(snapToOption(3, FIVE, V1)).toBe(3);
  });
});
