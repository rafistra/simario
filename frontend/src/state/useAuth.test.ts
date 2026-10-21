import { act } from '@testing-library/react';
import { buildSeed } from '@/test/fake/seed';
import { meFromLocal } from '@/test/meFromLocal';
import { useSession } from './session';
import { authFromMe } from './useAuth';

const db = buildSeed();

describe('authFromMe', () => {
  it('acts as Operator with the Pejabat who finalises', () => {
    const auth = authFromMe(meFromLocal(db, 'usr-rafi', '2027-04-06')!, null, null);
    expect(auth.active?.capacity).toBe('operator');
    expect(auth.active?.officialName).toBe('Andi Wirawan');
    expect(auth.can(4)).toBe(true);
  });

  it('follows the role view chosen in the session when the user has it', () => {
    act(() => useSession.getState().signIn('usr-admin'));
    const me = meFromLocal(db, 'usr-admin', '2027-04-06')!;
    expect(authFromMe(me, null, 'SAD').roleView).toBe('SAD');
    expect(authFromMe(me, null, 'PMR').roleView).toBe(me.roleViews.at(-1));
  });

  it('picks the chosen acting position among several holdings', () => {
    const me = meFromLocal(db, 'usr-dimas', '2027-04-06')!;
    const auth = authFromMe(me, 'pos-ppk-a2', null);
    expect(auth.active?.positionId).toBe('pos-ppk-a2');
    expect(auth.holdings.length).toBeGreaterThan(1);
  });
});
