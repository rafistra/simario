import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CollectionGate } from '@/components/DataGate/CollectionGate';
import { getDb, useDb } from '@/test/fake/local/store';
import { useCollectionCache } from '@/lib/useCollections';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import AuditPage from './AuditPage';
import MyPositionsPage from './MyPositionsPage';
import UsersPage from './UsersPage';

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow('2027-04-06T09:00');
    useDb.getState().reset();
    useCollectionCache.setState({ data: {}, errors: {} });
  });
});

const signIn = (id: string) => act(() => useSession.getState().signIn(id));
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const gated = (names: React.ComponentProps<typeof CollectionGate>['names'], ui: React.ReactNode) =>
  wrap(<CollectionGate names={names}>{ui}</CollectionGate>);

describe('Administrasi', () => {
  it('Andi appoints Galih Pratama as Operator from Jabatan Saya', async () => {
    signIn('usr-andi');
    gated(
      [
        'occupancies',
        'delegates',
        'users',
        'positions',
        'positionTypes',
        'roles',
        'rolePermissions',
        'userRoles',
      ],
      <MyPositionsPage />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Tunjuk Operator' }));
    fireEvent.change(screen.getByLabelText('Cari pegawai (NIP atau nama)'), {
      target: { value: 'Galih' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Galih Pratama/ }));
    fireEvent.change(screen.getByLabelText(/Nomor surat penunjukan/), {
      target: { value: 'ND-77/DKB/2027' },
    });
    fireEvent.change(screen.getByLabelText(/Berkas surat/), { target: { value: 'nd-77.pdf' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Tunjuk Operator' }).at(-1)!);
    await waitFor(() =>
      expect(
        getDb().users.some((u) => u.fullName === 'Galih Pratama' && u.createdVia === 'delegation'),
      ).toBe(true),
    );
  });

  it('explains why the Pokja Pengisi cannot be deactivated', async () => {
    signIn('usr-admin');
    gated(
      [
        'users',
        'userRoles',
        'roles',
        'rolePermissions',
        'occupancies',
        'delegates',
        'orgUnits',
        'positionTypes',
        'positions',
      ],
      <UsersPage />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Tindakan untuk Dimas Prasetyo' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nonaktifkan' }));
    expect(screen.getByText(/adalah Pengisi Pokja Pemilihan 03/)).toBeInTheDocument();
  });

  it('logs "Tampilkan nilai asli" in the audit trail', async () => {
    signIn('usr-admin');
    gated(['users', 'positions'], <AuditPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tampilkan nilai asli' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Tampilkan dan Catat' }),
    );
    await waitFor(() =>
      expect(getDb().audit.some((a) => a.action === 'tampilkan_nilai_asli')).toBe(true),
    );
  });
});
