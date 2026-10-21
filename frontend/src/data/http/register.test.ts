import { act } from '@testing-library/react';
import { useDb } from '@/test/fake/local/store';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { devApi } from './dev';
import { registerViewKey, useRegisterViews } from './register';

const A1 = { positionId: 'pos-ppk-a1', fiscalYear: 2027 };

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useDb.getState().reset();
    useRegisterViews.setState({ views: {}, errors: {}, generation: 0 });
  });
});

describe('register view cache', () => {
  it('never serves one user the view loaded for another', async () => {
    act(() => useSession.getState().signIn('usr-andi'));
    await useRegisterViews.getState().load(A1);
    expect(useRegisterViews.getState().views[registerViewKey(A1)]?.access.isHolder).toBe(true);
    act(() => useSession.getState().signIn('usr-siti'));
    expect(useRegisterViews.getState().views[registerViewKey(A1)]).toBeUndefined();
    await useRegisterViews.getState().load(A1);
    expect(useRegisterViews.getState().views[registerViewKey(A1)]?.access.isHolder).toBe(false);
  });

  it('drops cached views when the clock or the data change', async () => {
    act(() => useSession.getState().signIn('usr-andi'));
    await useRegisterViews.getState().load(A1);
    await devApi.setClock('2027-05-01T09:00');
    expect(useRegisterViews.getState().views).toEqual({});
    expect(useRegisterViews.getState().generation).toBe(1);
  });
});
