// Register seed. Template-based risks copy the template wording verbatim (description_snapshot);
// risks the mockups showed that are not in the Rapim deck are custom risks and create proposals.

import rapim from '@seed/template_risiko_rapim.json';
import type {
  DataUmumValues,
  ItemStatus,
  Register,
  RegisterMitigation,
  RegisterRisk,
  RegisterStageDeclaration,
  RiskFlag,
  RiskProposal,
  RiskType,
} from '@/domain/types';
import { mitigationTemplateId, stageId, templateId } from './reference';

interface TplJson {
  code: string;
  riskType: string;
  description: string;
  mitigations: { code: string; description: string }[];
}

const TEMPLATES = new Map<string, TplJson & { stageCode: string }>();
for (const t of rapim.positionTypes)
  for (const s of t.stages)
    for (const tpl of s.templates) TEMPLATES.set(tpl.code, { ...tpl, stageCode: s.code });

export const registers: Register[] = [];
export const declarations: RegisterStageDeclaration[] = [];
export const risks: RegisterRisk[] = [];
export const mitigations: RegisterMitigation[] = [];
export const proposals: RiskProposal[] = [];

function register(
  id: string,
  positionId: string,
  fiscalYear: number,
  status: Register['status'],
  positionTypeId: string,
  dataUmum: Partial<DataUmumValues>,
  published?: { at: string; by: string },
  copiedFromRegisterId: string | null = null,
) {
  registers.push({
    id,
    positionId,
    fiscalYear,
    status,
    dataUmum: {
      tujuan: '',
      kegiatan: [],
      besarAnggaran: null,
      target: '',
      extra: {},
      ...dataUmum,
    },
    // TA 2027 PPK registers started after PPK Versi 2 (4 Jan 2027); others use Versi 1.
    dataUmumFormId:
      positionTypeId === 'pt-ppk' && fiscalYear >= 2027
        ? 'du-pt-ppk-v2'
        : `du-${positionTypeId}-v1`,
    copiedFromRegisterId,
    publishedAt: published?.at ?? null,
    publishedByUserId: published?.by ?? null,
  });
}

interface RiskOpts {
  id: string;
  registerId: string;
  order: number;
  status?: ItemStatus;
  publishedAt?: string | null;
  lineageId?: string;
  previousYearRiskId?: string;
  /** 1-based indexes of template mitigations to select. */
  mitigations?: number[];
  customMitigations?: string[];
  deactivated?: { at: string; fromQuarterId: string | null; reason: string };
}

function addMitigations(
  riskId: string,
  status: ItemStatus,
  tplCode: string | null,
  picks: number[],
  custom: string[],
) {
  let order = 1;
  if (tplCode) {
    const tpl = TEMPLATES.get(tplCode)!;
    for (const i of picks) {
      const m = tpl.mitigations[i - 1]!;
      mitigations.push({
        id: `${riskId}-m${order}`,
        registerRiskId: riskId,
        mitigationTemplateId: mitigationTemplateId(m.code),
        descriptionSnapshot: m.description,
        isCustom: false,
        order,
        status,
        deactivationReason: null,
      });
      order++;
    }
  }
  for (const text of custom) {
    mitigations.push({
      id: `${riskId}-m${order}`,
      registerRiskId: riskId,
      mitigationTemplateId: null,
      descriptionSnapshot: text,
      isCustom: true,
      order,
      status,
      deactivationReason: null,
    });
    order++;
  }
  return order - 1;
}

function finishRisk(
  base: Omit<
    RegisterRisk,
    'flags' | 'deactivatedAt' | 'deactivatedFromQuarterId' | 'deactivationReason'
  >,
  opts: RiskOpts,
  mitigationCount: number,
) {
  const flags: RiskFlag[] =
    mitigationCount === 0 && base.status !== 'draft' && base.status !== 'ready'
      ? ['no_mitigation']
      : [];
  risks.push({
    ...base,
    status: opts.deactivated ? 'inactive' : base.status,
    flags,
    deactivatedAt: opts.deactivated?.at ?? null,
    deactivatedFromQuarterId: opts.deactivated?.fromQuarterId ?? null,
    deactivationReason: opts.deactivated?.reason ?? null,
  });
}

function templateRisk(code: string, opts: RiskOpts) {
  const tpl = TEMPLATES.get(code)!;
  const status = opts.status ?? 'active';
  const count = addMitigations(
    opts.id,
    status,
    code,
    opts.mitigations ?? [],
    opts.customMitigations ?? [],
  );
  finishRisk(
    {
      id: opts.id,
      registerId: opts.registerId,
      stageId: stageId(tpl.stageCode),
      riskType: tpl.riskType as RiskType,
      riskTemplateId: templateId(code),
      descriptionSnapshot: tpl.description,
      isCustom: false,
      status,
      publishedAt: opts.publishedAt ?? null,
      previousYearRiskId: opts.previousYearRiskId ?? null,
      lineageId: opts.lineageId ?? `lin-${opts.id}`,
      order: opts.order,
    },
    opts,
    count,
  );
}

function customRisk(stage: string, riskType: RiskType, description: string, opts: RiskOpts) {
  const status = opts.status ?? 'active';
  const count = addMitigations(opts.id, status, null, [], opts.customMitigations ?? []);
  finishRisk(
    {
      id: opts.id,
      registerId: opts.registerId,
      stageId: stage,
      riskType,
      riskTemplateId: null,
      descriptionSnapshot: description,
      isCustom: true,
      status,
      publishedAt: opts.publishedAt ?? null,
      previousYearRiskId: opts.previousYearRiskId ?? null,
      lineageId: opts.lineageId ?? `lin-${opts.id}`,
      order: opts.order,
    },
    opts,
    count,
  );
}

let declarationSeq = 1;
function declare(registerId: string, stage: string, riskType: RiskType | null, reason: string) {
  declarations.push({
    id: `decl-${declarationSeq++}`,
    registerId,
    stageId: stage,
    riskType,
    kind: riskType ? 'no_risk_in_type' : 'stage_not_relevant',
    reason,
  });
}

/* ---------- PPK A-1 · TA 2026 (archived) ---------- */

const A1_26 = 'reg-ppk-a1-2026';
const PUB_26 = '2026-01-21T09:30';
register(
  A1_26,
  'pos-ppk-a1',
  2026,
  'archived',
  'pt-ppk',
  {
    kegiatan: ['Pengembangan Portal Data Terpadu', 'Pengadaan Perangkat Jaringan'],
    besarAnggaran: 3100000000,
    target: 'Realisasi anggaran ≥ 95% dan seluruh paket selesai serah terima Desember 2026.',
  },
  { at: PUB_26, by: 'usr-andi' },
);
templateRisk('PPK-T1-FR-03', {
  id: 'rr26-pemecahan',
  registerId: A1_26,
  order: 1,
  publishedAt: PUB_26,
  lineageId: 'lin-pemecahan',
  mitigations: [1, 2],
});
templateRisk('PPK-T2-KA-02', {
  id: 'rr26-penyerapan',
  registerId: A1_26,
  order: 1,
  publishedAt: PUB_26,
  lineageId: 'lin-penyerapan',
  mitigations: [1, 2],
});
templateRisk('PPK-T3-KA-02', {
  id: 'rr26-pembayaran',
  registerId: A1_26,
  order: 1,
  publishedAt: PUB_26,
  lineageId: 'lin-pembayaran',
  mitigations: [1, 2],
});
customRisk(
  'stg-PPK-LEGACY-PL',
  'kinerja_anggaran',
  'Keterlambatan proses pengadaan langsung menjelang akhir tahun.',
  {
    id: 'rr26-pl',
    registerId: A1_26,
    order: 1,
    publishedAt: PUB_26,
    customMitigations: ['Menjadwalkan pengadaan langsung secara triwulanan.'],
  },
);

/* ---------- PPK A-1 · TA 2027 (published, copied from 2026) ---------- */

const A1 = 'reg-ppk-a1-2027';
const PUB = '2027-01-20T10:15';
register(
  A1,
  'pos-ppk-a1',
  2027,
  'published',
  'pt-ppk',
  {
    kegiatan: [
      'Pengembangan Sistem Informasi Manajemen Risiko',
      'Pengadaan Perangkat Pusat Data',
      'Layanan Konsultansi Tata Kelola Data',
    ],
    besarAnggaran: 4250000000,
    target:
      'Seluruh paket TA 2027 berkontrak paling lambat Juni 2027 dan realisasi anggaran ≥ 95%.',
    extra: { sumber_dana: 'Rupiah Murni', kode_paket_rup: '48211904' },
  },
  { at: PUB, by: 'usr-andi' },
  A1_26,
);

customRisk(
  'stg-PPK-T1',
  'kinerja_anggaran',
  'Keterlambatan revisi DIPA menghambat jadwal pengadaan.',
  {
    id: 'rr-a1-dipa',
    registerId: A1,
    order: 1,
    publishedAt: PUB,
  },
);
customRisk('stg-PPK-T1', 'kinerja_anggaran', 'Deviasi Rencana Penarikan Dana (RPD) yang tinggi.', {
  id: 'rr-a1-rpd',
  registerId: A1,
  order: 2,
  publishedAt: PUB,
  customMitigations: [
    'Menyusun jadwal penarikan dana bulanan bersama Biro Keuangan.',
    'Memantau realisasi anggaran setiap bulan terhadap RPD.',
  ],
  deactivated: {
    at: '2027-03-20T14:00',
    fromQuarterId: 'q-2027-2',
    reason:
      'Rencana penarikan dana kini dipantau Biro Keuangan melalui Rencana Kerja Bulanan triwulanan.',
  },
});
declare(
  A1,
  'stg-PPK-T1',
  'ketidakpatuhan',
  'HPS seluruh paket TA 2027 disusun dan direviu tim teknis bersama UKPBJ; tidak ada risiko ketidakpatuhan pada tahap ini.',
);
templateRisk('PPK-T1-FR-03', {
  id: 'rr-a1-pemecahan',
  registerId: A1,
  order: 1,
  publishedAt: PUB,
  lineageId: 'lin-pemecahan',
  previousYearRiskId: 'rr26-pemecahan',
  mitigations: [1, 2],
});
templateRisk('PPK-T2-KA-02', {
  id: 'rr-a1-penyerapan',
  registerId: A1,
  order: 1,
  publishedAt: PUB,
  lineageId: 'lin-penyerapan',
  previousYearRiskId: 'rr26-penyerapan',
  mitigations: [1, 2],
  customMitigations: ['Menyusun jadwal penarikan dana bulanan bersama Biro Keuangan.'],
});
templateRisk('PPK-T2-KA-05', {
  id: 'rr-a1-berulang',
  registerId: A1,
  order: 2,
  status: 'ready',
  mitigations: [1, 2],
});
declare(
  A1,
  'stg-PPK-T2',
  'ketidakpatuhan',
  'Pembelian langsung TA 2027 hanya untuk alat tulis kantor dengan katalog harga tetap.',
);
declare(
  A1,
  'stg-PPK-T2',
  'kecurangan',
  'Seluruh pembelian langsung melalui E-Katalog dengan riwayat transaksi tercatat.',
);
templateRisk('PPK-T3-KA-02', {
  id: 'rr-a1-pembayaran',
  registerId: A1,
  order: 1,
  publishedAt: PUB,
  lineageId: 'lin-pembayaran',
  previousYearRiskId: 'rr26-pembayaran',
  mitigations: [1, 2],
  customMitigations: ['Menetapkan batas waktu verifikasi tagihan termin 5 hari kerja.'],
});
templateRisk('PPK-T3-KP-02', { id: 'rr-a1-material', registerId: A1, order: 1, publishedAt: PUB });
templateRisk('PPK-T3-FR-03', {
  id: 'rr-a1-penyuapan',
  registerId: A1,
  order: 1,
  publishedAt: PUB,
  mitigations: [1, 2],
});
declare(
  A1,
  'stg-PPK-T4',
  null,
  'Kontrak TA 2027 baru ditandatangani pada TW II; risiko pelaksanaan kontrak ditambahkan melalui register tambahan.',
);
declare(
  A1,
  'stg-PPK-T5',
  null,
  'Belum ada serah terima hasil pekerjaan pada TA 2027 hingga TW III.',
);

proposals.push(
  {
    id: 'prop-1',
    sourceRegisterRiskId: 'rr-a1-dipa',
    description: 'Keterlambatan revisi DIPA menghambat jadwal pengadaan.',
    proposerUserId: 'usr-rafi',
    status: 'pending',
    rejectionReason: null,
    createdAt: PUB,
  },
  {
    id: 'prop-2',
    sourceRegisterRiskId: 'rr-a1-rpd',
    description: 'Deviasi Rencana Penarikan Dana (RPD) yang tinggi.',
    proposerUserId: 'usr-rafi',
    status: 'pending',
    rejectionReason: null,
    createdAt: PUB,
  },
);

/* ---------- PPK A-2 · TA 2027 (published) ---------- */

const A2 = 'reg-ppk-a2-2027';
const PUB_A2 = '2027-01-25T13:40';
register(
  A2,
  'pos-ppk-a2',
  2027,
  'published',
  'pt-ppk',
  {
    kegiatan: ['Pengadaan Lisensi Perangkat Lunak Analitik'],
    besarAnggaran: 1850000000,
    target: 'Lisensi aktif paling lambat Mei 2027.',
  },
  { at: PUB_A2, by: 'usr-bambang' },
);
templateRisk('PPK-T1-KA-01', {
  id: 'rr-a2-kebutuhan',
  registerId: A2,
  order: 1,
  publishedAt: PUB_A2,
  mitigations: [1, 2],
});
templateRisk('PPK-T1-KP-01', {
  id: 'rr-a2-luar-rencana',
  registerId: A2,
  order: 1,
  publishedAt: PUB_A2,
  mitigations: [1, 2],
});
templateRisk('PPK-T1-FR-02', {
  id: 'rr-a2-markup',
  registerId: A2,
  order: 1,
  publishedAt: PUB_A2,
  mitigations: [1, 2],
});
for (const s of ['T2', 'T3', 'T4', 'T5'])
  declare(
    A2,
    `stg-PPK-${s}`,
    null,
    'Paket lisensi diadakan melalui satu kali proses perencanaan dan E-Purchasing.',
  );

/* ---------- KPA Satker A · TA 2026 (archived) — no TA 2027 register yet ---------- */
// Demonstrates "Salin dari TA 2026" (FR-REG-009) for Hadi Susanto, including a risk whose template
// has since been deactivated (KPA-T1-KA-04) and one deactivated risk that is not copied.

const KPA26 = 'reg-kpa-a-2026';
const PUB_KPA26 = '2026-01-26T09:00';
register(
  KPA26,
  'pos-kpa-satker-a',
  2026,
  'archived',
  'pt-kpa',
  {
    kegiatan: ['Pembangunan Jalan Kawasan Inti', 'Penataan Drainase Kawasan'],
    besarAnggaran: 16200000000,
    target: 'Realisasi anggaran ≥ 95% dan jalan kawasan inti fungsional Desember 2026.',
  },
  { at: PUB_KPA26, by: 'usr-hadi' },
);
for (const [code, id, picks] of [
  ['KPA-T1-KA-01', 'rr26-kpa-blokir', [1]],
  ['KPA-T1-KA-03', 'rr26-kpa-rpd', [1, 2, 3]],
  ['KPA-T1-KA-04', 'rr26-kpa-rup', [1, 2]],
  ['KPA-T1-KP-02', 'rr26-kpa-sasaran', [1, 2]],
  ['KPA-T1-FR-01', 'rr26-kpa-konflik', [1, 2]],
  ['KPA-T3-KA-01', 'rr26-kpa-serapan', [1, 2, 3]],
  ['KPA-T3-KP-01', 'rr26-kpa-tagihan', [1, 2]],
  ['KPA-T3-FR-02', 'rr26-kpa-suap', [1, 2]],
] as const)
  templateRisk(code, {
    id,
    registerId: KPA26,
    order: 1,
    publishedAt: PUB_KPA26,
    mitigations: [...picks],
  });
templateRisk('KPA-T1-KA-02', {
  id: 'rr26-kpa-rencana',
  registerId: KPA26,
  order: 2,
  publishedAt: PUB_KPA26,
  mitigations: [1],
  deactivated: {
    at: '2026-06-10T10:00',
    fromQuarterId: 'q-2026-3',
    reason: 'Rencana kegiatan disusun ulang bersama Biro Perencanaan.',
  },
});
for (const stage of ['KPA-T2', 'KPA-T4', 'KPA-T5'])
  declare(
    KPA26,
    `stg-${stage}`,
    null,
    'Ditangani pada tingkat Biro Perencanaan dan Biro Keuangan untuk Satker A.',
  );

/* ---------- Pokja Pemilihan 03 · TA 2027 (draft) ---------- */

const POKJA = 'reg-pokja-03-2027';
register(POKJA, 'pos-pokja-03', 2027, 'draft', 'pt-pokja', {
  kegiatan: ['Pemilihan Penyedia Paket Konstruksi Kawasan Inti'],
});
templateRisk('POKJA-T1-KA-01', {
  id: 'rr-pokja-kak',
  registerId: POKJA,
  order: 1,
  status: 'draft',
  mitigations: [1, 2],
});

/* ---------- Pejabat Pengadaan Satker B · TA 2027 (published) ---------- */

const PJP = 'reg-pjp-b-2027';
const PUB_PJP = '2027-02-03T10:00';
register(
  PJP,
  'pos-pjp-satker-b',
  2027,
  'published',
  'pt-pjp',
  {
    kegiatan: ['Pengadaan Peralatan Kantor Satker B'],
    besarAnggaran: 640000000,
    target: 'Seluruh pengadaan selesai TW III.',
  },
  { at: PUB_PJP, by: 'usr-wulan' },
);
templateRisk('PJP-T1-KA-01', {
  id: 'rr-pjp-pemilihan',
  registerId: PJP,
  order: 1,
  publishedAt: PUB_PJP,
  mitigations: [1, 2],
});
templateRisk('PJP-T1-KP-01', {
  id: 'rr-pjp-evaluasi',
  registerId: PJP,
  order: 1,
  publishedAt: PUB_PJP,
  mitigations: [1, 2],
});
templateRisk('PJP-T1-FR-02', {
  id: 'rr-pjp-konflik',
  registerId: PJP,
  order: 1,
  publishedAt: PUB_PJP,
  mitigations: [1, 2],
});
