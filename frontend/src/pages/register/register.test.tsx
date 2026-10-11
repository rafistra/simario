import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { getDb, useDb } from '@/data/local/store';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import RegisterPage from './RegisterPage';

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

function renderRegister(userId: string, positionId: string, fiscalYear = 2027) {
  act(() => useSession.getState().signIn(userId));
  const position = getDb().positions.find((p) => p.id === positionId)!;
  const ctx: WorkspaceOutletContext = { position, unitCode: 'X', fiscalYear, quarter: 2 };
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={ctx} />}>
          <Route path="*" element={<RegisterPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Register page', () => {
  it('lists the gaps and keeps the register a draft when publishing too early', async () => {
    renderRegister('usr-hadi', 'pos-kpa-satker-a');
    expect(screen.getByText('Mulai dari register TA 2026?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox', { name: /^Pilih risiko/ })[0]!);
    await waitFor(() => expect(screen.getByText(/1 risiko dipilih/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Terbitkan Register' }));
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(/Register belum dapat diterbitkan: \d+ hal perlu dilengkapi/),
    ).toBeInTheDocument();
    expect(
      within(alert).getByRole('button', {
        name: 'Data Umum — Kegiatan wajib diisi sebelum register diterbitkan.',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the Operator the locked finalising action', () => {
    renderRegister('usr-rafi', 'pos-ppk-a1');
    expect(screen.getByText('Dilakukan oleh Andi Wirawan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terbitkan Tambahan' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('is read-only for a Pokja member who is not the Pengisi', () => {
    renderRegister('usr-ratna', 'pos-pokja-03');
    expect(screen.getByText('Anda anggota Pokja Pemilihan 03, bukan Pengisi')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Status dan tindakan' })).not.toBeInTheDocument();
  });

  it('hides unpublished additions from Lini 2 readers', () => {
    renderRegister('usr-siti', 'pos-ppk-a1');
    expect(screen.queryByText(/tambahan belum diterbitkan/)).not.toBeInTheDocument();
    const pending = getDb().risks.find(
      (r) => r.registerId === 'reg-ppk-a1-2027' && r.status === 'ready',
    )!;
    expect(screen.queryByText(pending.descriptionSnapshot)).not.toBeInTheDocument();
  });

  it('requires a reason before deactivating a risk', async () => {
    renderRegister('usr-andi', 'pos-ppk-a1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tindakan risiko' })[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nonaktifkan risiko' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Mulai TW III risiko tidak lagi dinilai/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nonaktifkan Risiko' }));
    expect(await within(dialog).findByText('Alasan penonaktifan wajib diisi.')).toBeInTheDocument();
  });

  it('shows an archived register read-only with a way back to the open year', () => {
    renderRegister('usr-andi', 'pos-ppk-a1', 2026);
    expect(screen.getByText('Register TA 2026 telah diarsipkan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buka TA 2027/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
