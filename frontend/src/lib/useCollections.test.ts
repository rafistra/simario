import { act, renderHook, waitFor } from '@testing-library/react';
import { useDb } from '@/data/local/store';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { useCollectionCache, useCollections } from './useCollections';

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useDb.getState().reset();
    useSession.getState().signIn('usr-nur');
    useCollectionCache.setState({ data: {}, errors: {} });
  });
});

describe('useCollections', () => {
  it('loads several collections, then exposes them together', async () => {
    const { result } = renderHook(() => useCollections(['positions', 'stages']));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.db).not.toBeNull());
    expect(result.current.db!.positions.length).toBeGreaterThan(0);
    expect(result.current.db!.stages.length).toBeGreaterThan(0);
  });

  it('reports a failed load and recovers on retry', async () => {
    useDevSettings.getState().set({ failNext: true });
    const { result } = renderHook(() => useCollections(['positions']));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loading).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.db).not.toBeNull());
    expect(result.current.error).toBeNull();
  });
});
