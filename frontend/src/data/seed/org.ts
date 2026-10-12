// Organisation seed — consistent with the Simario.pen DesignBrief (§7) and mockup personas.
// All names, NIPs, and decree numbers are fictional.

import type {
  MonitoringAssignment,
  OrgUnit,
  Position,
  PositionDelegate,
  PositionOccupancy,
  PositionType,
  Role,
  RolePermission,
  Scope,
  User,
  UserRole,
} from '@/domain/types';
import { PERMISSIONS } from '@/domain/permissions';

// Names follow the Otorita IKN work-unit export (12 Oct 2026); only units used by the seed.
export const orgUnits: OrgUnit[] = [
  { id: 'ou-ddkb', code: 'DDKB', name: 'Direktorat Data dan Kecerdasan Buatan', active: true },
  {
    id: 'ou-pgkp',
    code: 'DPGKP',
    name: 'Direktorat Pengelolaan Gedung, Kawasan dan Perkotaan',
    active: true,
  },
  { id: 'ou-spd', code: 'DSPD', name: 'Direktorat Sarana Prasarana Dasar', active: true },
  { id: 'ou-pelayanan-dasar', code: 'DPLD', name: 'Direktorat Pelayanan Dasar', active: true },
  { id: 'ou-biro-umum', code: 'BUPBJ', name: 'Biro Umum dan Pengadaan Barang/Jasa', active: true },
  {
    id: 'ou-birokeu',
    code: 'BKBA',
    name: 'Biro Keuangan, Barang Milik Negara, dan Aset Dalam Penguasaan',
    active: true,
  },
  { id: 'ou-pendanaan', code: 'DPDN', name: 'Direktorat Pendanaan', active: true },
  { id: 'ou-kepatuhan', code: 'DKP', name: 'Direktorat Kepatuhan', active: true },
  { id: 'ou-pai', code: 'DPAI', name: 'Direktorat Pengawasan dan Audit Internal', active: true },
];

export const positionTypes: PositionType[] = [
  {
    id: 'pt-kpa',
    code: 'KPA',
    name: 'KPA/Kasatker',
    line: 1,
    defaultRoleId: 'role-pmr',
    allowsMultipleOfficials: false,
    hasTemplates: true,
    isBuiltin: true,
    active: true,
    identitySchema: [
      { key: 'nama_satker', label: 'Nama Satker', kind: 'text' },
      { key: 'nomor_dipa_petikan', label: 'Nomor DIPA Petikan', kind: 'text' },
    ],
  },
  {
    id: 'pt-ppk',
    code: 'PPK',
    name: 'PPK',
    line: 1,
    defaultRoleId: 'role-pmr',
    allowsMultipleOfficials: false,
    hasTemplates: true,
    isBuiltin: true,
    active: true,
    identitySchema: [
      { key: 'nama_jabatan_ppk', label: 'Nama Jabatan PPK', kind: 'text' },
      { key: 'nomor_sk', label: 'Nomor SK PPK', kind: 'text' },
      { key: 'tanggal_sk', label: 'Tanggal SK PPK', kind: 'date' },
    ],
  },
  {
    id: 'pt-pokja',
    code: 'POKJA',
    name: 'Pokja Pemilihan',
    line: 1,
    defaultRoleId: 'role-pmr',
    allowsMultipleOfficials: true,
    hasTemplates: true,
    isBuiltin: true,
    active: true,
    identitySchema: [
      { key: 'nama_jabatan_pokja', label: 'Nama Jabatan Pokja', kind: 'text' },
      { key: 'nomor_sk', label: 'Nomor SK Pokja', kind: 'text' },
      { key: 'tanggal_sk', label: 'Tanggal SK Pokja', kind: 'date' },
    ],
  },
  {
    id: 'pt-pjp',
    code: 'PJP',
    name: 'Pejabat Pengadaan',
    line: 1,
    defaultRoleId: 'role-pmr',
    allowsMultipleOfficials: false,
    hasTemplates: true,
    isBuiltin: true,
    active: true,
    identitySchema: [
      { key: 'nama_pejabat_pengadaan', label: 'Nama Jabatan Pejabat Pengadaan', kind: 'text' },
      { key: 'nomor_sk', label: 'Nomor SK Pejabat Pengadaan', kind: 'text' },
      { key: 'tanggal_sk', label: 'Tanggal SK Pejabat Pengadaan', kind: 'date' },
    ],
  },
  {
    id: 'pt-pj-pemantauan',
    code: 'PJPM',
    name: 'Penanggung Jawab Pemantauan',
    line: 2,
    defaultRoleId: 'role-pmt',
    allowsMultipleOfficials: false,
    hasTemplates: false,
    isBuiltin: true,
    active: true,
    identitySchema: [],
  },
  {
    id: 'pt-unit-pendukung',
    code: 'UPPM',
    name: 'Unit Pendukung Pemantauan',
    line: 2,
    defaultRoleId: 'role-pmt',
    allowsMultipleOfficials: false,
    hasTemplates: false,
    isBuiltin: true,
    active: true,
    identitySchema: [],
  },
  {
    id: 'pt-penjamin-mutu',
    code: 'PJM',
    name: 'Penjamin Mutu',
    line: 3,
    defaultRoleId: 'role-pjm',
    allowsMultipleOfficials: false,
    hasTemplates: false,
    isBuiltin: true,
    active: true,
    identitySchema: [],
  },
];

const pos = (
  id: string,
  code: string,
  name: string,
  orgUnitId: string,
  positionTypeId: string,
  identity: Record<string, string> = {},
): Position => ({ id, code, name, orgUnitId, positionTypeId, identity, active: true });

export const positions: Position[] = [
  pos('pos-kpa-satker-a', 'KPA-A', 'KPA Satker A', 'ou-pgkp', 'pt-kpa', {
    nama_satker: 'Satker A — Direktorat Pengelolaan Gedung, Kawasan dan Perkotaan',
    nomor_dipa_petikan: 'SP DIPA-129.01.1.690451/2027',
  }),
  pos('pos-ppk-a1', 'PPKA1', 'PPK A-1', 'ou-ddkb', 'pt-ppk', {
    nama_jabatan_ppk: 'Pejabat Pembuat Komitmen A-1 Direktorat Data dan Kecerdasan Buatan',
    nomor_sk: 'KEP-12/OIKN/2027',
    tanggal_sk: '2027-01-04',
  }),
  pos('pos-ppk-a2', 'PPKA2', 'PPK A-2', 'ou-ddkb', 'pt-ppk', {
    nama_jabatan_ppk: 'Pejabat Pembuat Komitmen A-2 Direktorat Data dan Kecerdasan Buatan',
    nomor_sk: 'KEP-13/OIKN/2027',
    tanggal_sk: '2027-01-04',
  }),
  pos('pos-ppk-b2', 'PPKB2', 'PPK B-2', 'ou-spd', 'pt-ppk', {
    nama_jabatan_ppk: 'Pejabat Pembuat Komitmen B-2 Satker B',
  }),
  pos('pos-pokja-03', 'POKJA03', 'Pokja Pemilihan 03', 'ou-biro-umum', 'pt-pokja', {
    nama_jabatan_pokja: 'Kelompok Kerja Pemilihan 03 UKPBJ',
    nomor_sk: 'KEP-31/UKPBJ/2027',
    tanggal_sk: '2027-01-08',
  }),
  pos('pos-pjp-satker-b', 'PJPB', 'Pejabat Pengadaan Satker B', 'ou-spd', 'pt-pjp', {
    nama_pejabat_pengadaan: 'Pejabat Pengadaan Satker B',
    nomor_sk: 'KEP-07/SKB/2027',
    tanggal_sk: '2027-01-06',
  }),
  pos('pos-pjp-satker-c', 'PJPC', 'Pejabat Pengadaan Satker C', 'ou-pelayanan-dasar', 'pt-pjp'),
  pos(
    'pos-pj-pemantauan',
    'PJPM-DPDN',
    'Penanggung Jawab Pemantauan Direktorat Pendanaan',
    'ou-pendanaan',
    'pt-pj-pemantauan',
  ),
  pos(
    'pos-sup-birokeu',
    'UPPM-BKBA',
    'Unit Pendukung Pemantauan Biro Keuangan, BMN, ADP',
    'ou-birokeu',
    'pt-unit-pendukung',
  ),
  pos(
    'pos-sup-ukpbj',
    'UPPM-UKPBJ',
    'Unit Pendukung Pemantauan UKPBJ',
    'ou-biro-umum',
    'pt-unit-pendukung',
  ),
  {
    ...pos('pos-kepatuhan', 'DKP', 'Direktorat Kepatuhan', 'ou-kepatuhan', 'pt-penjamin-mutu'),
    shortName: 'KEP',
  },
  {
    ...pos(
      'pos-pai',
      'DPAI',
      'Direktorat Pengawasan dan Audit Internal',
      'ou-pai',
      'pt-penjamin-mutu',
    ),
    shortName: 'PAI',
  },
];

const user = (
  id: string,
  fullName: string,
  nip: string,
  email: string,
  orgUnitId: string,
  extra: Partial<User> = {},
): User => ({
  id,
  fullName,
  nip,
  email,
  orgUnitId,
  isLocalAccount: false,
  mustChangePassword: false,
  createdVia: 'admin',
  active: true,
  ...extra,
});

export const users: User[] = [
  user('usr-andi', 'Andi Wirawan', '198204172008011003', 'andi.wirawan@ikn.go.id', 'ou-ddkb'),
  user('usr-rafi', 'Rafi Ananda', '199507232020121004', 'rafi.ananda@ikn.go.id', 'ou-ddkb', {
    createdVia: 'delegation',
  }),
  user(
    'usr-bambang',
    'Bambang Hartono',
    '197911052006041002',
    'bambang.hartono@ikn.go.id',
    'ou-ddkb',
  ),
  user(
    'usr-dimas',
    'Dimas Prasetyo',
    '199102142015031001',
    'dimas.prasetyo@ikn.go.id',
    'ou-biro-umum',
  ),
  user('usr-ratna', 'Ratna Sari', '199306102018012002', 'ratna.sari@ikn.go.id', 'ou-biro-umum'),
  user(
    'usr-yohanes',
    'Yohanes Lubis',
    '198812302014021001',
    'yohanes.lubis@ikn.go.id',
    'ou-biro-umum',
  ),
  user('usr-rina', 'Rina Kartika', '199709182022032001', 'rina.kartika@ikn.go.id', 'ou-biro-umum', {
    createdVia: 'delegation',
  }),
  user('usr-budi', 'Budi Santoso', '199001012016011001', 'budi.santoso@ikn.go.id', 'ou-biro-umum', {
    createdVia: 'delegation',
    active: false,
  }),
  user('usr-wulan', 'Wulan Sari', '198505202010012003', 'wulan.sari@ikn.go.id', 'ou-spd'),
  user('usr-hadi', 'Hadi Susanto', '197603112003121001', 'hadi.susanto@ikn.go.id', 'ou-pgkp'),
  user(
    'usr-siti',
    'Siti Rahmawati',
    '197808252005012002',
    'siti.rahmawati@ikn.go.id',
    'ou-pendanaan',
  ),
  user('usr-yudi', 'Yudi Saputra', '198107142007011004', 'yudi.saputra@ikn.go.id', 'ou-birokeu'),
  user(
    'usr-wahyu',
    'Wahyu Hidayat',
    '198309302009011002',
    'wahyu.hidayat@ikn.go.id',
    'ou-biro-umum',
  ),
  user(
    'usr-lestari',
    'Lestari Wulandari',
    '199404052019032003',
    'lestari.wulandari@ikn.go.id',
    'ou-biro-umum',
    {
      isLocalAccount: true,
      mustChangePassword: true,
      password: 'Lestari-Awal-2027',
    },
  ),
  user(
    'usr-hendra',
    'Hendra Gunawan',
    '197702092002121001',
    'hendra.gunawan@ikn.go.id',
    'ou-kepatuhan',
  ),
  user(
    'usr-rizky',
    'Rizky Maulana',
    '199603262021011003',
    'rizky.maulana@ikn.go.id',
    'ou-kepatuhan',
    { createdVia: 'delegation' },
  ),
  user('usr-maya', 'Maya Kusuma', '198011192004122001', 'maya.kusuma@ikn.go.id', 'ou-pai'),
  user('usr-nur', 'Nur Aini', '198906152013022004', 'nur.aini@ikn.go.id', 'ou-ddkb'),
  user('usr-admin', 'Admin DKB', '198703122010011002', 'admin.dkb@ikn.go.id', 'ou-ddkb', {
    isLocalAccount: true,
    password: 'Simario-Admin-2027!',
  }),
  user(
    'usr-fajar',
    'Fajar Nugroho',
    '199805082023011002',
    'fajar.nugroho@ikn.go.id',
    'ou-biro-umum',
  ),
  // Reader within scope who is not a thread participant (mockup S9lsp1, FR-PPN-003).
  user('usr-dewi', 'Dewi Anggraini', '198412032009022001', 'dewi.anggraini@ikn.go.id', 'ou-ddkb'),
];

/**
 * Staff directory standing in for the Keycloak lookup used when a Pejabat appoints an Operator
 * (FR-ADM-010, OQ-11). People here are not yet SIMARIO users.
 */
export const staffDirectory = [
  {
    nip: '199812012024011001',
    fullName: 'Galih Pratama',
    email: 'galih.pratama@ikn.go.id',
    orgUnitId: 'ou-ddkb',
  },
  {
    nip: '199910172024012002',
    fullName: 'Intan Permatasari',
    email: 'intan.permatasari@ikn.go.id',
    orgUnitId: 'ou-ddkb',
  },
  {
    nip: '199607302021031002',
    fullName: 'Arif Setiawan',
    email: 'arif.setiawan@ikn.go.id',
    orgUnitId: 'ou-pgkp',
  },
];

const occ = (
  id: string,
  positionId: string,
  userId: string,
  startDate: string,
  decreeNo: string,
  extra: Partial<PositionOccupancy> = {},
): PositionOccupancy => ({
  id,
  positionId,
  userId,
  isFiller: true,
  startDate,
  endDate: null,
  decreeNo,
  decreeDate: startDate,
  decreeFile: `SK_${decreeNo.replace(/\W+/g, '_')}.pdf`,
  ...extra,
});

export const occupancies: PositionOccupancy[] = [
  occ('occ-andi-a1', 'pos-ppk-a1', 'usr-andi', '2025-01-06', 'KEP-04/OIKN/2025'),
  occ('occ-bambang-a2', 'pos-ppk-a2', 'usr-bambang', '2026-01-05', 'KEP-02/OIKN/2026'),
  occ('occ-hadi-kpa', 'pos-kpa-satker-a', 'usr-hadi', '2025-01-02', 'KEP-01/OIKN/2025'),
  occ('occ-dimas-pokja', 'pos-pokja-03', 'usr-dimas', '2027-01-08', 'KEP-31/UKPBJ/2027'),
  occ('occ-ratna-pokja', 'pos-pokja-03', 'usr-ratna', '2027-01-08', 'KEP-31/UKPBJ/2027', {
    isFiller: false,
  }),
  occ('occ-yohanes-pokja', 'pos-pokja-03', 'usr-yohanes', '2027-01-08', 'KEP-31/UKPBJ/2027', {
    isFiller: false,
  }),
  occ('occ-wulan-pjp-b', 'pos-pjp-satker-b', 'usr-wulan', '2026-01-05', 'KEP-03/SKB/2026'),
  occ('occ-siti-pj', 'pos-pj-pemantauan', 'usr-siti', '2026-12-15', 'KEP-88/OIKN/2026'),
  occ('occ-yudi-birokeu', 'pos-sup-birokeu', 'usr-yudi', '2025-01-02', 'KEP-05/OIKN/2025'),
  occ('occ-wahyu-ukpbj', 'pos-sup-ukpbj', 'usr-wahyu', '2025-01-02', 'KEP-06/OIKN/2025'),
  occ('occ-hendra-kep', 'pos-kepatuhan', 'usr-hendra', '2024-07-01', 'KEP-41/OIKN/2024'),
  occ('occ-maya-pai', 'pos-pai', 'usr-maya', '2024-07-01', 'KEP-42/OIKN/2024'),
];

const del = (
  id: string,
  positionId: string,
  userId: string,
  appointedByOccupancyId: string,
  startDate: string,
  letterNo: string,
  extra: Partial<PositionDelegate> = {},
): PositionDelegate => ({
  id,
  positionId,
  userId,
  appointedByOccupancyId,
  letterNo,
  letterDate: startDate,
  letterFile: `Surat_Delegasi_${letterNo.replace(/\W+/g, '_')}.pdf`,
  startDate,
  endDate: null,
  endReason: null,
  ...extra,
});

export const delegates: PositionDelegate[] = [
  del('del-rafi-a1', 'pos-ppk-a1', 'usr-rafi', 'occ-andi-a1', '2027-01-11', 'ND-045/DKB/2027'),
  del('del-dimas-a2', 'pos-ppk-a2', 'usr-dimas', 'occ-bambang-a2', '2027-01-15', 'ND-052/DKB/2027'),
  del(
    'del-dimas-pjp-b',
    'pos-pjp-satker-b',
    'usr-dimas',
    'occ-wulan-pjp-b',
    '2027-01-20',
    'ND-009/SKB/2027',
  ),
  del(
    'del-rina-pokja',
    'pos-pokja-03',
    'usr-rina',
    'occ-dimas-pokja',
    '2027-01-12',
    'ND-014/UKPBJ/2027',
  ),
  del(
    'del-budi-pokja',
    'pos-pokja-03',
    'usr-budi',
    'occ-dimas-pokja',
    '2027-01-12',
    'ND-013/UKPBJ/2027',
    {
      endDate: '2027-02-28',
      endReason: 'revoked',
    },
  ),
  del(
    'del-lestari-ukpbj',
    'pos-sup-ukpbj',
    'usr-lestari',
    'occ-wahyu-ukpbj',
    '2027-01-04',
    'ND-002/UKPBJ/2027',
  ),
  del(
    'del-rizky-kep',
    'pos-kepatuhan',
    'usr-rizky',
    'occ-hendra-kep',
    '2027-01-04',
    'ND-001/DKP/2027',
  ),
];

export const roles: Role[] = [
  { id: 'role-sad', code: 'SAD', name: 'Superadmin', isLocked: true },
  { id: 'role-pmr', code: 'PMR', name: 'Pemilik Risiko', isLocked: false },
  { id: 'role-pmt', code: 'PMT', name: 'Pemantau', isLocked: false },
  { id: 'role-pjm', code: 'PJM', name: 'Penjamin Mutu', isLocked: false },
  { id: 'role-pmd', code: 'PMD', name: 'Pengelola Master Data', isLocked: false },
  // Custom role (FR-ADM-003): read-only view of the work unit's positions.
  { id: 'role-pmu', code: 'PMU', name: 'Pimpinan Unit Kerja', isLocked: false },
];

const grant = (roleId: string, entries: [number, Scope | null][]): RolePermission[] =>
  entries.map(([permission, scope]) => ({ roleId, permission, scope }));

/** Default role configuration — FR-ADM-003. */
export const rolePermissions: RolePermission[] = [
  ...grant('role-pmr', [
    [1, 'sendiri'],
    [2, null],
    [3, null],
    [4, null],
    [5, null],
    [6, null],
    [7, 'sendiri'],
    [11, null],
  ]),
  ...grant('role-pmt', [
    [1, 'sendiri'],
    [6, null],
    [7, 'sendiri'],
    [11, null],
  ]),
  ...grant('role-pjm', [
    [1, 'semua'],
    [6, null],
    [7, 'semua'],
    [8, 'semua'],
    [9, 'semua'],
    [10, 'semua'],
    [11, null],
    [23, 'semua'],
  ]),
  ...grant('role-pmu', [[1, 'unit']]),
  ...grant('role-pmd', [
    [12, null],
    [13, null],
    [14, null],
    [15, null],
    [16, null],
    [17, null],
    [18, null],
  ]),
  ...grant(
    'role-sad',
    PERMISSIONS.map(
      (p) => [p.code, p.scopeKind === 'scoped' ? 'semua' : null] as [number, Scope | null],
    ),
  ),
];

/** Manual roles only; position roles are derived from holdings (§1.4.3). */
export const userRoles: UserRole[] = [
  { userId: 'usr-admin', roleId: 'role-sad', source: 'manual' },
  { userId: 'usr-nur', roleId: 'role-pmd', source: 'manual' },
  { userId: 'usr-dewi', roleId: 'role-pmu', source: 'manual' },
];

const SUPPORTS = [
  { positionId: 'pos-sup-birokeu', domain: 'budget_performance' as const },
  { positionId: 'pos-sup-ukpbj', domain: 'procurement' as const },
];

export const assignments: MonitoringAssignment[] = [
  ...['pos-ppk-a1', 'pos-ppk-a2', 'pos-kpa-satker-a', 'pos-pokja-03', 'pos-pjp-satker-b'].map(
    (target, i): MonitoringAssignment => ({
      id: `asg-2027-${i + 1}`,
      targetPositionId: target,
      leadPositionId: 'pos-pj-pemantauan',
      supports: SUPPORTS,
      quarterFromId: 'q-2027-1',
      quarterToId: 'q-2027-4',
      decreeNo: 'KEP-90/OIKN/2026',
    }),
  ),
  {
    id: 'asg-2026-1',
    targetPositionId: 'pos-ppk-a1',
    leadPositionId: 'pos-pj-pemantauan',
    supports: SUPPORTS,
    quarterFromId: 'q-2026-1',
    quarterToId: 'q-2026-4',
    decreeNo: 'KEP-21/OIKN/2025',
  },
];
