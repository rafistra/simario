import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useDb } from '@/test/fake/local/store';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import LoginPage from './LoginPage';

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Beranda</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useDb.getState().reset();
    useSession.getState().signOut();
  });
});

describe('Login against the backend', () => {
  it('shows the PRD message when SSO refused an unregistered NIP', () => {
    renderAt('/login?alasan=belum-terdaftar');
    expect(screen.getByText('Akun belum terdaftar')).toBeInTheDocument();
    expect(screen.getByText(/Akun Anda belum terdaftar di SIMARIO/)).toBeInTheDocument();
  });

  it('keeps the idle-timeout reason across the Keycloak sign-out round trip', () => {
    sessionStorage.setItem('simario:login-after', '/login?alasan=sesi-berakhir&kembali=%2Fjabatan');
    renderAt('/login');
    expect(screen.getByText('Sesi Anda berakhir. Silakan masuk kembali.')).toBeInTheDocument();
    expect(sessionStorage.getItem('simario:login-after')).toBeNull();
  });

  it('sends the SSO button to Keycloak', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderAt('/login?kembali=%2Fjabatan');
    fireEvent.click(screen.getByRole('button', { name: 'Masuk dengan Akun Otorita IKN' }));
    expect(assign).toHaveBeenCalledWith('/oidc/authenticate/?next=%2Fjabatan');
    vi.unstubAllGlobals();
  });

  it('offers persona sign-in in development and lands on the home page', async () => {
    renderAt('/login');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Masuk sebagai persona (mode pengembangan)' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Andi Wirawan/ }));
    expect(await screen.findByText('Beranda')).toBeInTheDocument();
    expect(useSession.getState().userId).toBe('usr-andi');
  });
});
