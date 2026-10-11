import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { getDb, useDb } from '@/data/local/store';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import SheetPage from './SheetPage';

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow('2027-04-06T09:00');
    useDb.getState().reset();
    useSession.getState().signIn('usr-andi');
  });
  window.print = vi.fn();
});

function renderSheet(path = '/') {
  const position = getDb().positions.find((p) => p.id === 'pos-ppk-a1')!;
  const ctx: WorkspaceOutletContext = { position, unitCode: 'DDKB', fiscalYear: 2027, quarter: 1 };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Outlet context={ctx} />}>
          <Route path="*" element={<SheetPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Lembar', () => {
  it('prints from a new numbered snapshot', async () => {
    renderSheet();
    expect(await screen.findByText('Lembar Komunikasi Tiga Lini')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cetak' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByLabelText('Keduanya'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Buat Salinan & Cetak' }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    const prints = getDb().snapshots.filter(
      (s) => s.trigger === 'print' && s.quarterId === 'q-2027-1',
    );
    expect(prints.map((s) => s.number).sort()).toEqual([
      'SIMARIO/LK/2027/TW1/DDKB-PPKA1/001',
      'SIMARIO/LK/2027/TW1/DDKB-PPKA1/002',
      'SIMARIO/LM/2027/TW1/DDKB-PPKA1/001',
    ]);
  });

  it('shows a frozen copy with the verbatim banner', async () => {
    renderSheet('/?salinan=snap-3');
    expect(await screen.findByText('Ini salinan beku.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat tampilan berjalan.' })).toBeInTheDocument();
  });
});
