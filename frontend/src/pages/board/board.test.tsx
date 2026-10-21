import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useBoardRevision } from '@/data/repository';
import { getDb, useDb } from '@/test/fake/local/store';
import { simulateIncomingComment } from '@/test/fake/simulate';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import BoardPage from './BoardPage';
import ThreadPage from './ThreadPage';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow('2027-04-06T09:00');
    useDb.getState().reset();
  });
});

function renderAt(userId: string, positionId: string, path: string) {
  act(() => useSession.getState().signIn(userId));
  const position = getDb().positions.find((p) => p.id === positionId)!;
  const ctx: WorkspaceOutletContext = { position, unitCode: 'DDKB', fiscalYear: 2027, quarter: 2 };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Outlet context={ctx} />}>
          <Route path="/papan" element={<BoardPage />} />
          <Route path="/utas/:rid" element={<ThreadPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Papan Risiko', () => {
  it('lists published risks and filters by marker', async () => {
    renderAt('usr-andi', 'pos-ppk-a1', '/papan');
    expect(await screen.findByRole('link', { name: /^Pemecahan kontrak\./ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Berulang/ }));
    expect(screen.getByText(/1 dari \d+ risiko/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Penyerapan anggaran/ })).not.toBeInTheDocument();
    // Filters are remembered per user per position.
    await waitFor(() =>
      expect(
        getDb().preferences.find((p) => p.userId === 'usr-andi' && p.key === 'papan:pos-ppk-a1')
          ?.value,
      ).toMatchObject({ markers: ['berulang'] }),
    );
  });

  it('shows the unpublished empty state with "Buka Register" for Lini 1', async () => {
    renderAt('usr-hadi', 'pos-kpa-satker-a', '/papan');
    expect(await screen.findByText('Register TA 2027 belum diterbitkan.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buka Register' })).toBeInTheDocument();
  });
});

describe('Utas Risiko', () => {
  it('lets a participant post a Langkah with Ctrl+Enter', async () => {
    renderAt('usr-andi', 'pos-ppk-a1', '/utas/rr-a1-pembayaran');
    const box = await screen.findByRole('combobox', { name: 'Komentar' });
    fireEvent.change(box, { target: { value: 'Termin 2 diverifikasi.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tandai sebagai Langkah' }));
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(await screen.findByText('Termin 2 diverifikasi.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Belum ada langkah triwulan ini')).not.toBeInTheDocument(),
    );
  });

  it('offers only participants in the @mention picker', async () => {
    renderAt('usr-andi', 'pos-ppk-a1', '/utas/rr-a1-pembayaran');
    const box = await screen.findByRole('combobox', { name: 'Komentar' });
    fireEvent.change(box, { target: { value: '@Si', selectionStart: 3 } });
    expect(await screen.findByRole('option', { name: /Siti Rahmawati/ })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: '@Dewi', selectionStart: 5 } });
    expect(screen.queryByRole('option', { name: /Dewi Anggraini/ })).not.toBeInTheDocument();
  });

  it('shows the reader note instead of a composer for non-participants', async () => {
    renderAt('usr-dewi', 'pos-ppk-a1', '/utas/rr-a1-penyerapan');
    expect(await screen.findByText('Anda dapat membaca utas ini.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Komentar' })).not.toBeInTheDocument();
  });

  it('warns Lini 3 during the blind phase', async () => {
    renderAt('usr-hendra', 'pos-ppk-a1', '/utas/rr-a1-pemecahan');
    expect(await screen.findByText('Perbandingan triwulan ini belum dibuka.')).toBeInTheDocument();
    expect(
      screen.getByText('Hindari menyebutkan skor atau predikat penilaian Anda di utas ini.'),
    ).toBeInTheDocument();
  });

  it('holds new comments by others behind the "komentar baru" banner', async () => {
    renderAt('usr-andi', 'pos-ppk-a1', '/utas/rr-a1-pembayaran');
    await screen.findByRole('combobox', { name: 'Komentar' });
    act(() => {
      simulateIncomingComment('rr-a1-pembayaran', 'usr-andi');
    });
    // The 30-second poll finds a comment by someone else and reloads the thread view.
    act(() => useBoardRevision.getState().bump());
    const banner = await screen.findByRole('button', { name: '1 komentar baru — Tampilkan' });
    expect(
      screen.queryByText('Mohon pembaruan progres minggu ini beserta dokumen pendukungnya.'),
    ).not.toBeInTheDocument();
    fireEvent.click(banner);
    expect(
      await screen.findByText('Mohon pembaruan progres minggu ini beserta dokumen pendukungnya.'),
    ).toBeInTheDocument();
  });
});
