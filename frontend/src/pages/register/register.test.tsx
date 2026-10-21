import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { CollectionGate } from '@/components/DataGate/CollectionGate';
import { getDb, useDb } from '@/data/local/store';
import { useRegisterViews } from '@/data/repository';
import { useCollectionCache } from '@/lib/useCollections';
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
    useCollectionCache.setState({ data: {}, errors: {} });
    useRegisterViews.setState({ views: {}, errors: {}, generation: 0 });
  });
});

async function renderRegister(userId: string, positionId: string, fiscalYear = 2027) {
  act(() => useSession.getState().signIn(userId));
  const position = getDb().positions.find((p) => p.id === positionId)!;
  const ctx: WorkspaceOutletContext = { position, unitCode: 'X', fiscalYear, quarter: 2 };
  const view = render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={ctx} />}>
          <Route
            path="*"
            element={
              <CollectionGate
                names={[
                  'positionTypes',
                  'stages',
                  'dataUmumForms',
                  'riskTemplates',
                  'mitigationTemplates',
                  'users',
                  'quarters',
                  'fiscalYears',
                ]}
              >
                <RegisterPage />
              </CollectionGate>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

/** Stages start collapsed; open every stage section. */
function openStages() {
  for (const b of screen.queryAllByRole('button', {
    name: /Tahap [0-9]+ dari [0-9]+/,
    expanded: false,
  }))
    fireEvent.click(b);
}

describe('Register page loading', () => {
  it('shows the error with "Coba Lagi" when the register cannot be loaded', async () => {
    await act(() =>
      useCollectionCache
        .getState()
        .load([
          'positionTypes',
          'stages',
          'dataUmumForms',
          'riskTemplates',
          'mitigationTemplates',
          'users',
          'quarters',
          'fiscalYears',
        ]),
    );
    act(() => useDevSettings.getState().set({ failNext: true }));
    await renderRegister('usr-andi', 'pos-ppk-a1');
    expect(screen.getByText('Register gagal dimuat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba Lagi' }));
    expect(await screen.findByRole('heading', { name: /Register/ })).toBeInTheDocument();
  });
});

describe('Register page', () => {
  it('starts with stages collapsed and risk types expanded inside an opened stage', async () => {
    await renderRegister('usr-andi', 'pos-ppk-a1');
    const stage = screen.getByRole('button', { name: /Tahap 1 dari [0-9]+ Perencanaan Pengadaan/ });
    expect(stage).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Kinerja Anggaran/ })).not.toBeInTheDocument();
    fireEvent.click(stage);
    expect(stage).toHaveAttribute('aria-expanded', 'true');
    const type = screen.getByRole('button', { name: /^Kinerja Anggaran/ });
    expect(type).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('Keterlambatan revisi DIPA menghambat jadwal pengadaan.'),
    ).toBeInTheDocument();
    fireEvent.click(type);
    expect(type).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('Keterlambatan revisi DIPA menghambat jadwal pengadaan.'),
    ).not.toBeInTheDocument();
  });

  it('opens a stage and its risk type when publishing reveals a gap there', async () => {
    await renderRegister('usr-hadi', 'pos-kpa-satker-a');
    openStages();
    fireEvent.click(screen.getAllByRole('checkbox', { name: /^Pilih risiko/ })[0]!);
    await waitFor(() => expect(screen.getByText(/1 risiko dipilih/)).toBeInTheDocument());
    for (const b of screen.getAllByRole('button', {
      name: /Tahap [0-9]+ dari [0-9]+/,
      expanded: true,
    }))
      fireEvent.click(b);
    expect(
      screen.queryAllByRole('button', { name: /Tahap [0-9]+ dari [0-9]+/, expanded: true }),
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Terbitkan Register' }));
    await screen.findByRole('alert');
    const opened = screen.getAllByRole('button', {
      name: /Tahap [0-9]+ dari [0-9]+/,
      expanded: true,
    });
    expect(opened.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Belum ada risiko atau pernyataan/).length).toBeGreaterThan(0);
  });

  it('lists the gaps and keeps the register a draft when publishing too early', async () => {
    await renderRegister('usr-hadi', 'pos-kpa-satker-a');
    expect(screen.getByText('Mulai dari register TA 2026?')).toBeInTheDocument();
    openStages();
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

  it('shows the Operator the locked finalising action', async () => {
    await renderRegister('usr-rafi', 'pos-ppk-a1');
    expect(screen.getByText('Dilakukan oleh Andi Wirawan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terbitkan Tambahan' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('is read-only for a Pokja member who is not the Pengisi', async () => {
    await renderRegister('usr-ratna', 'pos-pokja-03');
    openStages();
    expect(screen.getByText('Anda anggota Pokja Pemilihan 03, bukan Pengisi')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Status dan tindakan' })).not.toBeInTheDocument();
  });

  it('hides unpublished additions from Lini 2 readers', async () => {
    await renderRegister('usr-siti', 'pos-ppk-a1');
    openStages();
    expect(screen.queryByText(/tambahan belum diterbitkan/)).not.toBeInTheDocument();
    const pending = getDb().risks.find(
      (r) => r.registerId === 'reg-ppk-a1-2027' && r.status === 'ready',
    )!;
    expect(screen.queryByText(pending.descriptionSnapshot)).not.toBeInTheDocument();
  });

  it('requires a reason before deactivating a risk', async () => {
    await renderRegister('usr-andi', 'pos-ppk-a1');
    openStages();
    fireEvent.click(screen.getAllByRole('button', { name: 'Tindakan risiko' })[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nonaktifkan risiko' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Mulai TW III risiko tidak lagi dinilai/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nonaktifkan Risiko' }));
    expect(await within(dialog).findByText('Alasan penonaktifan wajib diisi.')).toBeInTheDocument();
  });

  it('shows an archived register read-only with a way back to the open year', async () => {
    await renderRegister('usr-andi', 'pos-ppk-a1', 2026);
    expect(screen.getByText('Register TA 2026 telah diarsipkan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buka TA 2027/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
