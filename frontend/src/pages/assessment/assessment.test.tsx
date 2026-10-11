import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { getDb, useDb } from '@/data/local/store';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import AssessmentPage from './AssessmentPage';
import QueuePage from './QueuePage';

function setup(at: string, asOf = false) {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow(at);
    useDb.getState().reset(asOf ? at : undefined);
  });
}

function renderPage(userId: string, quarter: number, positionId = 'pos-ppk-a1') {
  act(() => useSession.getState().signIn(userId));
  const position = getDb().positions.find((p) => p.id === positionId)!;
  const ctx: WorkspaceOutletContext = { position, unitCode: 'DDKB', fiscalYear: 2027, quarter };
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={ctx} />}>
          <Route path="*" element={<AssessmentPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Penilaian Triwulan', () => {
  it('updates the predicate while typing and rejects out-of-range scores', async () => {
    setup('2027-03-18T09:00', true);
    renderPage('usr-rafi', 1);
    const input = await screen.findByRole('textbox', {
      name: /^Skor Lini 1 · PPK A-1 untuk Pemecahan kontrak/,
    });
    fireEvent.change(input, { target: { value: '2,6' } });
    expect(within(input.parentElement!).getByText('Cukup Terkendali')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '4,5' } });
    fireEvent.blur(input);
    expect(await screen.findByText('Skor 0,0–4,0')).toBeInTheDocument();
    // Operators see the finalising action locked (§2.4).
    expect(screen.getByText('Dilakukan oleh Andi Wirawan')).toBeInTheDocument();
  });

  it('shows the finalise summary verbatim and finalises scored rows only', async () => {
    setup('2027-03-18T09:00', true);
    renderPage('usr-andi', 1);
    const input = await screen.findByRole('textbox', { name: /untuk Pemecahan kontrak/ });
    fireEvent.change(input, { target: { value: '2,6' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(
        getDb().assessments.some(
          (a) => a.riskQuarterId === 'rq-rr-a1-pemecahan-q-2027-1' && a.score === 2.6,
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tuntaskan Penilaian' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        /^1 risiko akan dituntaskan\. 6 risiko belum dinilai dan tetap dapat diisi sampai perbandingannya dibuka\.$/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/1 risiko tanpa bukti/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tuntaskan Penilaian' }));
    await waitFor(() =>
      expect(
        getDb().assessments.find((a) => a.riskQuarterId === 'rq-rr-a1-pemecahan-q-2027-1')?.status,
      ).toBe('final'),
    );
    expect(await screen.findByRole('button', { name: /Buka Kembali/ })).toBeInTheDocument();
  });

  it('keeps other assessors hidden from a Lini 3 directorate before opening (VIS-1)', async () => {
    setup('2027-04-06T09:00');
    renderPage('usr-hendra', 2);
    await screen.findAllByRole('textbox', { name: /^Skor Lini 3 · Kepatuhan/ });
    expect(screen.getAllByText('Tersembunyi sampai perbandingan dibuka').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('checkbox', { name: 'Belum relevan triwulan ini' }),
    ).not.toBeInTheDocument();
  });

  it('asks the Superadmin before a logged blind view (FR-NIL-012)', async () => {
    setup('2027-04-06T09:00');
    renderPage('usr-admin', 2);
    fireEvent.click(await screen.findByRole('button', { name: 'Lihat penilaian sebelum dibuka' }));
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'Melihat penilaian sebelum perbandingan dibuka akan tercatat di jejak audit.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lihat dan Catat' }));
    expect(await screen.findByText(/Tampilan buta tercatat di jejak audit/)).toBeInTheDocument();
    expect(getDb().audit.at(-1)?.action).toBe('lihat_penilaian_sebelum_dibuka');
  });

  it('lists positions for the Lini 3 queue, including unpublished registers', async () => {
    setup('2027-04-06T09:00');
    act(() => useSession.getState().signIn('usr-maya'));
    render(
      <MemoryRouter>
        <QueuePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Antrean Penilaian')).toBeInTheDocument();
    expect(screen.getAllByText('Register belum terbit').length).toBeGreaterThan(0);
  });
});
