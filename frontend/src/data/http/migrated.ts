// Temporary module gate (spec §4.10; removed in B9). Modules listed here run on the backend. A
// trial build (VITE_HIDE_UNMIGRATED=true) hides the routes and menu items of every other module,
// so real users never see the local demo data those modules still read.

export type ModuleKey =
  | 'beranda'
  | 'notifikasi'
  | 'master'
  | 'admin'
  | 'register'
  | 'papan'
  | 'penilaian'
  | 'riwayat'
  | 'lembar'
  | 'daftar'
  | 'pantauan'
  | 'metrik'
  | 'audit';

/** Updated as each stage moves a module (B2 master/admin, B3 register, B4 papan, B5 penilaian, B6
 * beranda, riwayat, daftar jabatan, pantauan, B7 lembar). */
export const MIGRATED: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  'notifikasi',
  'master',
  'admin',
  'register',
  'papan',
  'penilaian',
  'beranda',
  'riwayat',
  'daftar',
  'pantauan',
  'lembar',
]);

export const hideUnmigrated = (): boolean => import.meta.env.VITE_HIDE_UNMIGRATED === 'true';

/** The module a path belongs to; null for paths outside the gate (login, errors). */
export function moduleOfPath(path: string): ModuleKey | null {
  const p = path.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  if (p === '/') return 'beranda';
  const ws = /^\/jabatan\/[^/]+\/(papan|register|penilaian|riwayat|lembar)/.exec(p);
  if (ws) return ws[1] as ModuleKey;
  if (/^\/jabatan\/[^/]+$/.test(p)) return 'papan';
  if (p === '/jabatan') return 'daftar';
  if (p.startsWith('/jabatan-saya') || p.startsWith('/pengaturan')) return 'admin';
  if (p.startsWith('/notifikasi')) return 'notifikasi';
  if (p.startsWith('/master')) return 'master';
  if (p.startsWith('/pantauan')) return 'pantauan';
  if (p.startsWith('/penilaian')) return 'penilaian';
  if (p.startsWith('/metrik')) return 'metrik';
  if (p.startsWith('/jejak-audit')) return 'audit';
  return null;
}

/** Whether a path may be shown in this build. Beranda always shows (trial version when gated). */
export function pathVisible(path: string, hide = hideUnmigrated()): boolean {
  if (!hide) return true;
  const m = moduleOfPath(path);
  return m === null || m === 'beranda' || MIGRATED.has(m);
}
