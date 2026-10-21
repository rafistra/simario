import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { useDb } from '@/test/fake/local/store';
import { useCollectionCache } from '@/lib/useCollections';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { CollectionGate } from './CollectionGate';

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useDb.getState().reset();
    useSession.getState().signIn('usr-nur');
    useCollectionCache.setState({ data: {}, errors: {} });
  });
});

function Form() {
  const [typed] = useState(() => `form-${Math.random()}`);
  return <p>{typed}</p>;
}

describe('CollectionGate', () => {
  it('keeps the page mounted when a reload after a mutation fails', async () => {
    render(
      <CollectionGate names={['stages']}>
        <Form />
      </CollectionGate>,
    );
    const before = (await screen.findByText(/^form-/)).textContent;
    act(() => useDevSettings.getState().set({ failNext: true }));
    await act(() => useCollectionCache.getState().load(['stages']));
    expect(screen.getByText(/^form-/).textContent).toBe(before);
    expect(screen.getByText('Data terbaru gagal dimuat')).toBeInTheDocument();
  });

  it('shows the error instead of the page when the first load fails', async () => {
    act(() => useDevSettings.getState().set({ failNext: true }));
    render(
      <CollectionGate names={['stages']}>
        <Form />
      </CollectionGate>,
    );
    expect(await screen.findByText('Data gagal dimuat')).toBeInTheDocument();
    expect(screen.queryByText(/^form-/)).toBeNull();
  });
});
