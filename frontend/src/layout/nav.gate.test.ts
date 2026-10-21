import type { AuthContext } from '@/state/useAuth';
import { navFor } from './nav';

const auth = {
  active: { line: 1, positionId: 'pos-ppk-a1', capacity: 'pejabat' },
  currentQuarter: { fiscalYear: 2027, number: 2 },
  currentFiscalYear: 2027,
  holdings: [],
  can: () => true,
} as unknown as AuthContext;

const labels = () => navFor('PMR', auth).flatMap((s) => s.items.map((i) => i.label));

afterEach(() => vi.unstubAllEnvs());

describe('trial build menu', () => {
  it('shows every page normally', () => {
    expect(labels()).toContain('Penilaian Triwulan');
  });

  it('hides pages of modules still on local data', () => {
    vi.stubEnv('VITE_HIDE_UNMIGRATED', 'true');
    expect(labels()).toEqual([
      'Beranda',
      'Papan Risiko',
      'Register',
      'Penilaian Triwulan',
      'Riwayat Risiko',
      'Lembar Komunikasi',
    ]);
  });
});
