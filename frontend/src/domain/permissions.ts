// Permission catalogue — PRD FR-ADM-002. Application logic checks these codes, never role names
// (RB-ADM-002).

export type PermissionGroup =
  | 'Lini 1'
  | 'Papan'
  | 'Lini 3'
  | 'Delegasi'
  | 'Master Data'
  | 'Administrasi'
  | 'Audit'
  | 'Pengawasan';

export interface PermissionDef {
  code: number;
  group: PermissionGroup;
  label: string;
  /** 'scoped' = Sendiri/Unit/Semua; 'own' = own positions only; 'none' = unscoped. */
  scopeKind: 'scoped' | 'own' | 'none';
  /** INV-12: only the Pejabat (Pokja: Pengisi) of the acting position. */
  requiresOfficial: boolean;
  /** INV-24: on multi-Pejabat positions only the Pengisi or an Operator. */
  isDrafting: boolean;
  /** INV-25: requires a holding on the acting position. */
  isContentAction: boolean;
}

export const PERMISSIONS: PermissionDef[] = [
  {
    code: 1,
    group: 'Lini 1',
    label: 'Lihat register dan papan',
    scopeKind: 'scoped',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 2,
    group: 'Lini 1',
    label: 'Susun draf register',
    scopeKind: 'own',
    requiresOfficial: false,
    isDrafting: true,
    isContentAction: true,
  },
  {
    code: 3,
    group: 'Lini 1',
    label: 'Terbitkan dan nonaktifkan butir register',
    scopeKind: 'own',
    requiresOfficial: true,
    isDrafting: false,
    isContentAction: true,
  },
  {
    code: 4,
    group: 'Lini 1',
    label: 'Susun draf penilaian dan penjelasan Lini 1',
    scopeKind: 'own',
    requiresOfficial: false,
    isDrafting: true,
    isContentAction: true,
  },
  {
    code: 5,
    group: 'Lini 1',
    label: 'Tuntaskan penilaian Lini 1 dan kirim penjelasan',
    scopeKind: 'own',
    requiresOfficial: true,
    isDrafting: false,
    isContentAction: true,
  },
  {
    code: 6,
    group: 'Papan',
    label: 'Berpartisipasi di utas',
    scopeKind: 'own',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: true,
  },
  {
    code: 7,
    group: 'Papan',
    label: 'Unduh lampiran',
    scopeKind: 'scoped',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 8,
    group: 'Lini 3',
    label: 'Susun draf penilaian Lini 3',
    scopeKind: 'scoped',
    requiresOfficial: false,
    isDrafting: true,
    isContentAction: true,
  },
  {
    code: 9,
    group: 'Lini 3',
    label: 'Tuntaskan penilaian Lini 3',
    scopeKind: 'scoped',
    requiresOfficial: true,
    isDrafting: false,
    isContentAction: true,
  },
  {
    code: 10,
    group: 'Lini 3',
    label: 'Lihat lampiran konfidensial',
    scopeKind: 'scoped',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 11,
    group: 'Delegasi',
    label: 'Kelola operator sendiri',
    scopeKind: 'own',
    requiresOfficial: true,
    isDrafting: false,
    isContentAction: true,
  },
  {
    code: 12,
    group: 'Master Data',
    label: 'Kelola template',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 13,
    group: 'Master Data',
    label: 'Putuskan usulan risiko',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 14,
    group: 'Master Data',
    label: 'Kelola skala penilaian',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 15,
    group: 'Master Data',
    label: 'Kelola tahap',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 16,
    group: 'Master Data',
    label: 'Kelola formulir Data Umum',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 17,
    group: 'Master Data',
    label: 'Kelola jenis jabatan',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 18,
    group: 'Master Data',
    label: 'Kelola jabatan',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 19,
    group: 'Administrasi',
    label: 'Kelola tahun anggaran dan triwulan',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 20,
    group: 'Administrasi',
    label: 'Kelola penugasan pemantauan',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 21,
    group: 'Administrasi',
    label: 'Kelola pengguna dan jabatan Pejabat',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 22,
    group: 'Administrasi',
    label: 'Kelola peran dan akses',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 23,
    group: 'Audit',
    label: 'Lihat jejak audit',
    scopeKind: 'scoped',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 24,
    group: 'Pengawasan',
    label: 'Lihat penilaian sebelum hasilnya dibuka',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 25,
    group: 'Pengawasan',
    label: 'Hapus tanda konfidensial',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
  {
    code: 26,
    group: 'Pengawasan',
    label: 'Arsipkan tahun anggaran secara manual',
    scopeKind: 'none',
    requiresOfficial: false,
    isDrafting: false,
    isContentAction: false,
  },
];

export const PERMISSION_BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));

export const ROLE_VIEW_LABEL = {
  PMR: 'Pemilik Risiko',
  PMT: 'Pemantau',
  PJM: 'Penjamin Mutu',
  PMD: 'Pengelola Master Data',
  SAD: 'Superadmin',
} as const;

export type RoleViewCode = keyof typeof ROLE_VIEW_LABEL;
