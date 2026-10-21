import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CollectionGate } from '@/components/DataGate/CollectionGate';
import { useToastStore } from '@/components/Feedback/toastStore';
import { useDb } from '@/test/fake/local/store';
import { useCollectionCache } from '@/lib/useCollections';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import ProposalsPage from './ProposalsPage';
import ScoreBandsPage from './ScoreBandsPage';

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow('2027-10-12T09:00');
    useDb.getState().reset();
    useToastStore.setState({ toasts: [] });
    useSession.getState().signIn('usr-nur');
    useCollectionCache.setState({ data: {}, errors: {} });
  });
});

/** Renders a master page behind its route's CollectionGate and waits for the data. */
async function renderPage(page: 'bands' | 'proposals') {
  render(
    <MemoryRouter>
      {page === 'bands' ? (
        <CollectionGate names={['quarters', 'scoreBandVersions', 'scoreBands', 'scoreOptions']}>
          <ScoreBandsPage />
        </CollectionGate>
      ) : (
        <CollectionGate names={['positionTypes', 'stages', 'riskTemplates', 'mitigationTemplates']}>
          <ProposalsPage />
        </CollectionGate>
      )}
    </MemoryRouter>,
  );
  await screen.findByRole('heading', {
    name: page === 'bands' ? 'Skala Penilaian' : 'Usulan Risiko',
  });
}

describe('Usulan Risiko', () => {
  it('keeps "Tolak Usulan" pressable and asks for a reason before rejecting', async () => {
    await renderPage('proposals');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tolak' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Tolak Usulan' }));
    expect(await screen.findByText('Alasan penolakan wajib diisi.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Alasan penolakan/), {
      target: { value: 'Sudah tercakup template KPA.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tolak Usulan' }));
    await waitFor(() =>
      expect(useDb.getState().db.proposals.filter((p) => p.status === 'rejected')).toHaveLength(1),
    );
  });
});

describe('Skala Penilaian', () => {
  it('shows the draft gap and refuses to save it', async () => {
    await renderPage('bands');
    expect(screen.getByText('Rentang tidak dapat disimpan')).toBeInTheDocument();
    expect(screen.getByText(/Ada celah antara 1,9 dan 2,0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Versi 2' }));
    await waitFor(() =>
      expect(useDb.getState().db.scoreBandVersions.find((v) => v.id === 'sbv-2')!.status).toBe(
        'draft',
      ),
    );
  });

  it('lists the draft statements and reports the uncovered predicate', async () => {
    await renderPage('bands');
    expect(screen.getByRole('table', { name: 'Pilihan penilaian' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mitigasi belum dilaksanakan')).toBeInTheDocument();
    expect(screen.getByText('Predikat Cukup Terkendali belum punya kalimat.')).toBeInTheDocument();
  });

  it('adds a statement in the draft and shows its predicate', async () => {
    await renderPage('bands');
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Pilihan' }));
    const values = screen.getAllByRole('textbox', { name: /^Nilai pilihan/ });
    const last = values.at(-1)!;
    fireEvent.change(last, { target: { value: '2,5' } });
    fireEvent.blur(last);
    await waitFor(() =>
      expect(useDb.getState().db.scoreOptions.filter((o) => o.versionId === 'sbv-2')).toHaveLength(
        6,
      ),
    );
    expect(screen.queryByText('Predikat Cukup Terkendali belum punya kalimat.')).toBeNull();
  });

  it('allows only text edits on the active version', async () => {
    await renderPage('bands');
    fireEvent.change(screen.getByLabelText('Versi'), { target: { value: 'sbv-1' } });
    expect(screen.getAllByRole('textbox', { name: /^Nilai pilihan/ })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tambah Pilihan' })).toBeDisabled();
    expect(
      screen.getByText('Ubah nilai atau jumlah pilihan lewat Buat Versi Baru.'),
    ).toBeInTheDocument();
    const first = screen.getAllByRole('textbox', { name: /^Kalimat pilihan/ })[0]!;
    fireEvent.change(first, { target: { value: 'Mitigasi belum berjalan' } });
    fireEvent.blur(first);
    await waitFor(() =>
      expect(useDb.getState().db.scoreOptions.find((o) => o.id === 'so-sbv-1-0')!.label).toBe(
        'Mitigasi belum berjalan',
      ),
    );
  });

  it('keeps text typed in another row while an earlier edit is still saving', async () => {
    act(() => useDevSettings.getState().set({ latency: true }));
    await renderPage('bands');
    const labels = () => screen.getAllByRole('textbox', { name: /^Kalimat pilihan/ });
    fireEvent.change(labels()[0]!, { target: { value: 'Belum dilaksanakan sama sekali' } });
    fireEvent.blur(labels()[0]!);
    fireEvent.change(labels()[1]!, { target: { value: 'Sebagian berjalan ' } });
    await waitFor(
      () =>
        expect(useDb.getState().db.scoreOptions.find((o) => o.id === 'so-sbv-2-0')!.label).toBe(
          'Belum dilaksanakan sama sekali',
        ),
      { timeout: 2000 },
    );
    expect(labels()[1]).toHaveValue('Sebagian berjalan ');
  });

  it('refuses to save invalid statements and explains why inline', async () => {
    await renderPage('bands');
    const lower = screen.getByLabelText('Batas bawah Cukup Terkendali');
    fireEvent.change(lower, { target: { value: '1,9' } });
    fireEvent.blur(lower);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Pilihan' }));
    expect(screen.queryByText('Rentang tidak dapat disimpan')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Versi 2' }));
    await waitFor(() =>
      expect(screen.getByText('Pilihan penilaian tidak dapat disimpan')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Periksa kalimat dan nilai yang ditandai merah\./)).toBeInTheDocument();
    expect(useDb.getState().db.scoreBandVersions.find((v) => v.id === 'sbv-2')!.status).toBe(
      'draft',
    );
    expect(
      useToastStore.getState().toasts.some((t) => t.title === 'Versi tidak dapat disimpan'),
    ).toBe(false);
  });

  it('reverts only the refused statement on the active version and says why', async () => {
    await renderPage('bands');
    fireEvent.change(screen.getByLabelText('Versi'), { target: { value: 'sbv-1' } });
    const labels = () => screen.getAllByRole('textbox', { name: /^Kalimat pilihan/ });
    const original = (labels()[1] as HTMLInputElement).value;
    const taken = (labels()[0] as HTMLInputElement).value;
    fireEvent.change(labels()[1]!, { target: { value: taken } });
    fireEvent.blur(labels()[1]!);
    fireEvent.change(labels()[2]!, { target: { value: 'Teks sedang diketik' } });
    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]).toMatchObject({
        variant: 'error',
        title: 'Kalimat tidak dapat disimpan',
        message: 'Kalimat sudah dipakai pilihan lain.',
      }),
    );
    expect(labels()[1]).toHaveValue(original);
    expect(labels()[2]).toHaveValue('Teks sedang diketik');
  });

  it('treats a trailing space on the active version as no change', async () => {
    await renderPage('bands');
    fireEvent.change(screen.getByLabelText('Versi'), { target: { value: 'sbv-1' } });
    const first = screen.getAllByRole('textbox', { name: /^Kalimat pilihan/ })[0]!;
    const original = (first as HTMLInputElement).value;
    const auditCount = useDb.getState().db.audit.length;
    fireEvent.change(first, { target: { value: `${original} ` } });
    fireEvent.blur(first);
    await waitFor(() => expect(first).toHaveValue(original));
    await new Promise((r) => setTimeout(r, 50));
    expect(useDb.getState().db.audit).toHaveLength(auditCount);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
