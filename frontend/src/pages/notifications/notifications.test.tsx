import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getDb, useDb } from '@/data/local/store';
import { Topbar } from '@/layout/Topbar';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import NotificationsPage from './NotificationsPage';

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow('2027-04-06T09:00');
    useDb.getState().reset();
    useSession.getState().signIn('usr-andi');
  });
});

describe('Notifikasi', () => {
  it('opens the panel from the bell and marks everything read', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <MemoryRouter>
        <Topbar onMenu={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Notifikasi, \d+ belum dibaca$/ }));
    const panel = screen.getByRole('dialog', { name: 'Notifikasi' });
    expect(await within(panel).findByText(/Perbandingan TW I PPK A-1 dibuka/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Tandai semua sudah dibaca' }));
    await act(async () => {});
    expect(getDb().notifications.filter((n) => n.userId === 'usr-andi' && !n.readAt)).toHaveLength(
      0,
    );
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toContain(
      '/api/v1/notifications/read-all',
    );
  });

  it('filters by kind on the full page', async () => {
    render(
      <MemoryRouter initialEntries={['/notifikasi']}>
        <NotificationsPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      within(await screen.findByRole('group', { name: 'Jenis' })).getByRole('button', {
        name: /^Berulang/,
      }),
    );
    expect(
      screen.getByText(/dinilai Kurang Terkendali oleh Lini 3 dua triwulan berturut-turut/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Perbandingan TW I PPK A-1 dibuka/)).not.toBeInTheDocument();
  });
});
