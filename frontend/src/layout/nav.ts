// Sidebar menus per role view — PRD §1.8.1. The role view changes only which menu is displayed;
// access is always checked on the page (FR-AUT-007).

import {
  Activity,
  BookMarked,
  Building2,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FileUp,
  Gauge,
  History,
  House,
  Inbox,
  Layers,
  LayoutList,
  NotebookPen,
  Network,
  Ruler,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { RoleViewCode } from '@/domain/permissions';
import type { AuthContext } from '@/state/useAuth';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
  /** Path prefix that marks the item active. */
  match: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const MASTER: NavItem[] = [
  { label: 'Jabatan', icon: Building2, to: '/master/jabatan', match: '/master/jabatan' },
  { label: 'Tahap', icon: Layers, to: '/master/tahap', match: '/master/tahap' },
  { label: 'Template', icon: BookMarked, to: '/master/template', match: '/master/template' },
  { label: 'Usulan', icon: Inbox, to: '/master/usulan', match: '/master/usulan' },
  { label: 'Data Umum', icon: ClipboardList, to: '/master/data-umum', match: '/master/data-umum' },
  {
    label: 'Skala Penilaian',
    icon: Ruler,
    to: '/master/skala-penilaian',
    match: '/master/skala-penilaian',
  },
];

const HOME: NavItem = { label: 'Beranda', icon: House, to: '/', match: '/' };

export function workspacePaths(positionId: string, year: number, quarter: number) {
  const base = `/jabatan/${positionId}`;
  return {
    papan: `${base}/papan/${year}`,
    register: `${base}/register/${year}`,
    penilaian: `${base}/penilaian/${year}/${quarter}`,
    riwayat: `${base}/riwayat?ta=${year}`,
    lembar: `${base}/lembar/${year}/${quarter}`,
  };
}

/** Menu of a role view. */
export function navFor(view: RoleViewCode | null, auth: AuthContext): NavSection[] {
  return allNav(view, auth).filter((s) => s.items.length > 0);
}

function allNav(view: RoleViewCode | null, auth: AuthContext): NavSection[] {
  switch (view) {
    case 'PMR': {
      const pos = auth.active?.line === 1 ? auth.active.positionId : null;
      if (!pos) return [{ items: [HOME] }];
      const q = auth.currentQuarter;
      const p = workspacePaths(pos, q?.fiscalYear ?? auth.currentFiscalYear, q?.number ?? 1);
      const base = `/jabatan/${pos}`;
      return [
        {
          items: [
            HOME,
            { label: 'Papan Risiko', icon: LayoutList, to: p.papan, match: `${base}/papan` },
            { label: 'Register', icon: NotebookPen, to: p.register, match: `${base}/register` },
            {
              label: 'Penilaian Triwulan',
              icon: ClipboardCheck,
              to: p.penilaian,
              match: `${base}/penilaian`,
            },
            { label: 'Riwayat Risiko', icon: History, to: p.riwayat, match: `${base}/riwayat` },
            { label: 'Lembar Komunikasi', icon: FileText, to: p.lembar, match: `${base}/lembar` },
          ],
        },
      ];
    }
    case 'PMT':
      return [
        {
          items: [
            HOME,
            { label: 'Jabatan Dipantau', icon: Network, to: '/pantauan', match: '/pantauan' },
          ],
        },
      ];
    case 'PJM':
      return [
        {
          items: [
            HOME,
            {
              label: 'Antrean Penilaian',
              icon: ShieldCheck,
              to: '/penilaian',
              match: '/penilaian',
            },
            { label: 'Daftar Jabatan', icon: Building2, to: '/jabatan', match: '/jabatan' },
            { label: 'Jejak Audit', icon: ScrollText, to: '/jejak-audit', match: '/jejak-audit' },
          ],
        },
      ];
    case 'PMD':
      return [{ items: [HOME] }, { title: 'Master Data', items: MASTER }];
    case 'SAD':
      return [
        { items: [HOME] },
        { title: 'Master Data', items: MASTER },
        {
          title: 'Pengaturan',
          items: [
            {
              label: 'Pengguna',
              icon: Users,
              to: '/pengaturan/pengguna',
              match: '/pengaturan/pengguna',
            },
            {
              label: 'Peran',
              icon: ShieldCheck,
              to: '/pengaturan/peran',
              match: '/pengaturan/peran',
            },
            {
              label: 'Penugasan Pemantauan',
              icon: Network,
              to: '/pengaturan/penugasan-pemantauan',
              match: '/pengaturan/penugasan-pemantauan',
            },
            {
              label: 'Tahun Anggaran',
              icon: CalendarRange,
              to: '/pengaturan/tahun-anggaran',
              match: '/pengaturan/tahun-anggaran',
            },
            {
              label: 'Impor Data',
              icon: FileUp,
              to: '/pengaturan/impor',
              match: '/pengaturan/impor',
            },
          ],
        },
        {
          items: [
            { label: 'Daftar Jabatan', icon: Building2, to: '/jabatan', match: '/jabatan' },
            { label: 'Metrik', icon: Gauge, to: '/metrik', match: '/metrik' },
            { label: 'Jejak Audit', icon: ScrollText, to: '/jejak-audit', match: '/jejak-audit' },
          ],
        },
      ];
    default:
      return [
        {
          items: [
            HOME,
            // Readers with Unit/All scope (e.g. a custom role) still reach the position directory (§1.8).
            ...(auth.permissions.get(1) === 'unit' || auth.permissions.get(1) === 'semua'
              ? [{ label: 'Daftar Jabatan', icon: Building2, to: '/jabatan', match: '/jabatan' }]
              : []),
            { label: 'Notifikasi', icon: Activity, to: '/notifikasi', match: '/notifikasi' },
          ],
        },
      ];
  }
}

/** Longest-prefix match so '/jabatan' does not light up on '/jabatan-saya'. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.match === '/') return pathname === '/';
  return pathname === item.match || pathname.startsWith(`${item.match}/`);
}
