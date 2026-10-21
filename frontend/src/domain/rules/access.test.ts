import { buildSeed } from '@/test/fake/seed';
import {
  checkAction,
  finalisingOfficial,
  hasPermission,
  holdingsOf,
  lini1PositionsInScope,
  participationHolding,
} from './access';

const db = buildSeed();
const TODAY = '2027-04-06';

describe('holdings', () => {
  it('lists Pejabat and Operator holdings', () => {
    expect(holdingsOf(db, 'usr-andi', TODAY)).toEqual([
      expect.objectContaining({ positionId: 'pos-ppk-a1', capacity: 'pejabat', isFiller: true }),
    ]);
    const dimas = holdingsOf(db, 'usr-dimas', TODAY).map((h) => `${h.positionId}:${h.capacity}`);
    expect(dimas).toEqual(
      expect.arrayContaining([
        'pos-pokja-03:pejabat',
        'pos-ppk-a2:operator',
        'pos-pjp-satker-b:operator',
      ]),
    );
  });

  it('ends a delegation that has passed its end date', () => {
    expect(holdingsOf(db, 'usr-budi', TODAY)).toEqual([]);
  });
});

describe('permissions and scope', () => {
  it('derives roles from holdings and manual roles', () => {
    expect(hasPermission(db, 'usr-andi', 5, TODAY)).toBe(true);
    expect(hasPermission(db, 'usr-siti', 5, TODAY)).toBe(false);
    expect(hasPermission(db, 'usr-nur', 12, TODAY)).toBe(true);
    expect(hasPermission(db, 'usr-nur', 1, TODAY)).toBe(false);
    expect(hasPermission(db, 'usr-admin', 24, TODAY)).toBe(true);
  });

  it('scopes Lini 1 visibility: own, assigned, all', () => {
    expect(lini1PositionsInScope(db, 'usr-andi', TODAY)).toEqual(['pos-ppk-a1']);
    expect(lini1PositionsInScope(db, 'usr-siti', TODAY, 1, 2027).sort()).toEqual(
      ['pos-kpa-satker-a', 'pos-pjp-satker-b', 'pos-pokja-03', 'pos-ppk-a1', 'pos-ppk-a2'].sort(),
    );
    expect(lini1PositionsInScope(db, 'usr-hendra', TODAY)).toContain('pos-ppk-b2');
  });
});

describe('content actions (INV-12, INV-24, INV-25)', () => {
  it('lets the Pejabat finalise and stops the Operator', () => {
    expect(checkAction(db, 'usr-andi', 5, 'pos-ppk-a1', TODAY).ok).toBe(true);
    expect(checkAction(db, 'usr-rafi', 5, 'pos-ppk-a1', TODAY)).toEqual({
      ok: false,
      reason: 'official',
    });
    expect(checkAction(db, 'usr-rafi', 4, 'pos-ppk-a1', TODAY).ok).toBe(true);
  });

  it('requires a holding on the acting position, even for Superadmin', () => {
    expect(checkAction(db, 'usr-andi', 2, 'pos-ppk-a2', TODAY)).toEqual({
      ok: false,
      reason: 'holding',
    });
    expect(checkAction(db, 'usr-admin', 2, 'pos-ppk-a1', TODAY)).toEqual({
      ok: false,
      reason: 'holding',
    });
  });

  it('closes drafting to Pokja members other than the Pengisi', () => {
    expect(checkAction(db, 'usr-ratna', 2, 'pos-pokja-03', TODAY)).toEqual({
      ok: false,
      reason: 'filler',
    });
    expect(checkAction(db, 'usr-dimas', 2, 'pos-pokja-03', TODAY).ok).toBe(true);
    expect(checkAction(db, 'usr-rina', 2, 'pos-pokja-03', TODAY).ok).toBe(true);
  });

  it('names the official who finalises', () => {
    expect(finalisingOfficial(db, 'pos-ppk-a1', TODAY)?.fullName).toBe('Andi Wirawan');
    expect(finalisingOfficial(db, 'pos-pokja-03', TODAY)?.fullName).toBe('Dimas Prasetyo');
    expect(finalisingOfficial(db, 'pos-ppk-b2', TODAY)).toBeNull();
  });
});

describe('participation (§1.5)', () => {
  it('admits holders, assigned Lini 2, and any Lini 3; others only read', () => {
    expect(participationHolding(db, 'usr-rafi', 'pos-ppk-a1', 'q-2027-2', TODAY)?.capacity).toBe(
      'operator',
    );
    expect(participationHolding(db, 'usr-siti', 'pos-ppk-a1', 'q-2027-2', TODAY)?.positionId).toBe(
      'pos-pj-pemantauan',
    );
    expect(participationHolding(db, 'usr-maya', 'pos-ppk-a1', 'q-2027-2', TODAY)?.positionId).toBe(
      'pos-pai',
    );
    expect(participationHolding(db, 'usr-dimas', 'pos-ppk-a1', 'q-2027-2', TODAY)).toBeNull();
    expect(participationHolding(db, 'usr-siti', 'pos-ppk-b2', 'q-2027-2', TODAY)).toBeNull();
  });
});
