import { addWorkdays, defaultQuarters, latenessAt, quarterLabel } from './calendar';
import { predicateFor, validateBands } from './scoreBands';
import type { ScoreBand } from './types';

describe('defaultQuarters (PRD §2.5)', () => {
  it('matches the TA 2027 dates used across the mockups', () => {
    const [tw1, tw2, tw3, tw4] = defaultQuarters(2027);
    expect(tw1).toMatchObject({
      startsOn: '2027-01-01',
      endsOn: '2027-03-31',
      lini3OpensOn: '2027-01-01',
      lini1OpensOn: '2027-03-01',
      lini1Deadline: '2027-03-26',
      lini3Deadline: '2027-04-02',
    });
    expect(tw2).toMatchObject({ lini1Deadline: '2027-06-25', lini3Deadline: '2027-07-02' });
    expect(tw3).toMatchObject({ lini1Deadline: '2027-09-24', lini3Deadline: '2027-10-01' });
    expect(tw4).toMatchObject({ lini1Deadline: '2027-12-31', lini3Deadline: '2028-01-07' });
  });

  it('gives TW IV 2026 its 25 Dec Lini 1 deadline', () => {
    expect(defaultQuarters(2026)[3]!.lini1Deadline).toBe('2026-12-25');
  });

  it('labels quarters in Roman numerals', () => {
    expect(quarterLabel({ number: 1, fiscalYear: 2027 })).toBe('TW I 2027');
  });
});

describe('workdays and lateness', () => {
  it('skips weekends', () => {
    expect(addWorkdays('2027-04-02', 5)).toBe('2027-04-09'); // Fri → next Fri
    expect(addWorkdays('2027-04-06', 5)).toBe('2027-04-13');
  });

  it('marks Terlambat within tolerance and Sangat Terlambat after', () => {
    expect(latenessAt('2027-04-02T16:00', '2027-04-02', 7)).toBeNull();
    expect(latenessAt('2027-04-06T08:30', '2027-04-02', 7)).toBe('terlambat');
    expect(latenessAt('2027-04-09T23:59', '2027-04-02', 7)).toBe('terlambat');
    expect(latenessAt('2027-04-10T08:00', '2027-04-02', 7)).toBe('sangat_terlambat');
  });
});

const ACTIVE: ScoreBand[] = [
  {
    versionId: 'v1',
    lowerExclusive: null,
    upperInclusive: 2.0,
    predicate: 'kurang',
    order: 1,
    guidance: '',
  },
  {
    versionId: 'v1',
    lowerExclusive: 2.0,
    upperInclusive: 3.0,
    predicate: 'cukup',
    order: 2,
    guidance: '',
  },
  {
    versionId: 'v1',
    lowerExclusive: 3.0,
    upperInclusive: 4.0,
    predicate: 'terkendali',
    order: 3,
    guidance: '',
  },
];

describe('score bands (confirmed: 0–2 K · 2,1–3 C · 3,1–4 T)', () => {
  it('maps boundary scores per the confirmed bands', () => {
    expect(predicateFor(0, ACTIVE)).toBe('kurang');
    expect(predicateFor(2.0, ACTIVE)).toBe('kurang');
    expect(predicateFor(2.1, ACTIVE)).toBe('cukup');
    expect(predicateFor(3.0, ACTIVE)).toBe('cukup');
    expect(predicateFor(3.1, ACTIVE)).toBe('terkendali');
    expect(predicateFor(4.0, ACTIVE)).toBe('terkendali');
  });

  it('accepts the active bands and reports a gap', () => {
    expect(validateBands(ACTIVE)).toEqual([]);
    const gapped = [
      { lowerExclusive: null, upperInclusive: 1.9, order: 1 },
      { lowerExclusive: 2.0, upperInclusive: 2.9, order: 2 },
      { lowerExclusive: 2.9, upperInclusive: 4.0, order: 3 },
    ];
    expect(validateBands(gapped)).toEqual([{ kind: 'gap', from: 1.9, to: 2.0 }]);
  });
});
