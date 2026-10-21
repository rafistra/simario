import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { apiFetch } from '@/data/http/client';
import { useDb } from '@/test/fake/local/store';
import { useDevSettings } from '@/state/devSettings';
import { useMe } from '@/state/me';
import { useSession } from '@/state/session';
import { AppShell } from './AppShell';

function Where() {
  const loc = useLocation();
  return <p>di {loc.pathname + loc.search}</p>;
}

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useDb.getState().reset();
    useSession.getState().signIn('usr-andi');
  });
});

describe('session ended by the server', () => {
  it('test_unauthenticated_redirects_to_login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell>isi</AppShell>} />
          <Route path="/login" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ code: 'unauthenticated', message: 'x' }), { status: 401 }),
    );
    await act(async () => {
      await apiFetch('/me').catch(() => undefined);
    });
    expect((await screen.findByText(/^di \/login/)).textContent).toContain('alasan=sesi-berakhir');
    expect(useMe.getState().status).toBe('expired');
    vi.unstubAllGlobals();
  });
});
