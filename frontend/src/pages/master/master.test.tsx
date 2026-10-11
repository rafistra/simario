import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useDb } from '@/data/local/store';
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
    useSession.getState().signIn('usr-nur');
  });
});

const renderPage = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Usulan Risiko', () => {
  it('keeps "Tolak Usulan" pressable and asks for a reason before rejecting', async () => {
    renderPage(<ProposalsPage />);
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
    renderPage(<ScoreBandsPage />);
    expect(screen.getByText('Rentang tidak dapat disimpan')).toBeInTheDocument();
    expect(screen.getByText(/Ada celah antara 1,9 dan 2,0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Versi 2' }));
    await waitFor(() =>
      expect(useDb.getState().db.scoreBandVersions.find((v) => v.id === 'sbv-2')!.status).toBe(
        'draft',
      ),
    );
  });
});
