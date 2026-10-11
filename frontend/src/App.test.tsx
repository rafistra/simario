import { act, render, screen } from '@testing-library/react';
import App from './App';
import { useClock } from './state/clock';
import { useDevSettings } from './state/devSettings';
import { useSession } from './state/session';

function visit(path: string, userId: string | null) {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow('2027-04-06T09:00');
    if (userId) useSession.getState().signIn(userId);
    else useSession.getState().signOut();
  });
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('routing and access guards', () => {
  it('sends a signed-out visitor to /login', () => {
    visit('/jabatan/pos-ppk-a1/papan/2027', null);
    expect(screen.getByRole('heading', { name: 'SIMARIO', level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Masuk dengan Akun Otorita IKN' }),
    ).toBeInTheDocument();
    expect(window.location.search).toContain('kembali=');
  });

  it('greets the Pejabat on Home with the acting position', () => {
    visit('/', 'usr-andi');
    expect(screen.getByRole('heading', { name: 'Beranda' })).toBeInTheDocument();
    expect(screen.getByText(/Anda bekerja sebagai Pejabat PPK A-1 · DDKB/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Papan Risiko' })).toHaveAttribute(
      'href',
      '/jabatan/pos-ppk-a1/papan/2027',
    );
  });

  it('shows the persistent Operator note', () => {
    visit('/', 'usr-rafi');
    expect(
      screen.getByText(
        'Anda bekerja sebagai operator untuk PPK A-1. Tindakan akhir dilakukan oleh Andi Wirawan.',
      ),
    ).toBeInTheDocument();
  });

  it('returns 403 for a page outside the user permissions', () => {
    visit('/pengaturan/pengguna', 'usr-andi');
    expect(screen.getByText('Anda tidak memiliki akses ke halaman ini')).toBeInTheDocument();
  });

  it('returns 403 for a workspace outside scope and 404 for an unknown id', () => {
    visit('/jabatan/pos-ppk-a2/papan/2027', 'usr-andi');
    expect(screen.getByText('Anda tidak memiliki akses ke halaman ini')).toBeInTheDocument();
  });

  it('returns 404 for unknown routes', () => {
    visit('/tidak-ada', 'usr-andi');
    expect(screen.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeInTheDocument();
  });

  it('opens a workspace in scope with its header and tabs', () => {
    visit('/jabatan/pos-ppk-a1/papan/2027', 'usr-siti');
    expect(screen.getByRole('heading', { name: 'PPK A-1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Papan' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Pejabat: Andi Wirawan · Operator: Rafi Ananda/)).toBeInTheDocument();
  });

  it('forces a local account with an initial password to change it first', () => {
    visit('/', 'usr-lestari');
    expect(
      screen.getByText('Kata sandi awal harus diganti sebelum melanjutkan.'),
    ).toBeInTheDocument();
  });

  it('lets Superadmin reach configuration pages', async () => {
    visit('/pengaturan/pengguna', 'usr-admin');
    expect(
      await screen.findByRole('heading', { name: 'Pengguna dan Jabatan' }),
    ).toBeInTheDocument();
  });
});
