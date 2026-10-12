// Reference seed. Stages and risk/mitigation templates come only from the Rapim deck extraction
// (docs/seed/template_risiko_rapim.json, FR-MST-010) — never retyped here.

import rapim from '@seed/template_risiko_rapim.json';
import { defaultQuarters } from '@/domain/calendar';
import type {
  DataUmumForm,
  FiscalYear,
  MitigationTemplate,
  Quarter,
  QuarterAssessor,
  RiskTemplate,
  RiskType,
  ScoreBand,
  ScoreBandVersion,
  Stage,
} from '@/domain/types';

const TYPE_ID: Record<string, string> = {
  KPA: 'pt-kpa',
  PPK: 'pt-ppk',
  POKJA: 'pt-pokja',
  PJP: 'pt-pjp',
};

export const stageId = (stageCode: string) => `stg-${stageCode}`;
export const templateId = (code: string) => `tpl-${code}`;
export const mitigationTemplateId = (code: string) => `mtpl-${code}`;

export const stages: Stage[] = [];
export const riskTemplates: RiskTemplate[] = [];
export const mitigationTemplates: MitigationTemplate[] = [];

for (const type of rapim.positionTypes) {
  const positionTypeId = TYPE_ID[type.code]!;
  for (const stage of type.stages) {
    stages.push({
      id: stageId(stage.code),
      positionTypeId,
      name: stage.name,
      order: stage.order,
      active: true,
    });
    for (const tpl of stage.templates) {
      riskTemplates.push({
        id: templateId(tpl.code),
        code: tpl.code,
        positionTypeId,
        stageId: stageId(stage.code),
        riskType: tpl.riskType as RiskType,
        description: tpl.description,
        order: tpl.order,
        active: true,
        updatedAt: '2026-10-12',
      });
      for (const m of tpl.mitigations) {
        mitigationTemplates.push({
          id: mitigationTemplateId(m.code),
          code: m.code,
          riskTemplateId: templateId(tpl.code),
          description: m.description,
          order: m.order,
          active: true,
        });
      }
    }
  }
}

// Inactive stage used by the TA 2026 register (master-data deactivation example in the mockups).
stages.push({
  id: 'stg-PPK-LEGACY-PL',
  positionTypeId: 'pt-ppk',
  name: 'Pengadaan Langsung',
  order: 6,
  active: false,
});

export const dataUmumForms: DataUmumForm[] = Object.values(TYPE_ID).map((positionTypeId) => ({
  id: `du-${positionTypeId}-v1`,
  positionTypeId,
  version: 1,
  fields: [],
  objectiveEnabled: false,
  defaultObjective: rapim.dataUmum.defaultObjective,
  // PPK moved to Versi 2 (Sumber Dana, Kode Paket RUP) on 4 Jan 2027 — frame IIM4I.
  active: positionTypeId !== 'pt-ppk',
  createdAt: '2026-10-12',
}));

dataUmumForms.push({
  id: 'du-pt-ppk-v2',
  positionTypeId: 'pt-ppk',
  version: 2,
  fields: [
    {
      key: 'sumber_dana',
      label: 'Sumber Dana',
      kind: 'list',
      mandatory: true,
      options: ['Rupiah Murni', 'PNBP', 'PHLN', 'SBSN'],
    },
    { key: 'kode_paket_rup', label: 'Kode Paket RUP', kind: 'text', mandatory: false },
  ],
  objectiveEnabled: false,
  defaultObjective: rapim.dataUmum.defaultObjective,
  active: true,
  createdAt: '2027-01-04',
});

/* ---------- Score bands (confirmed by the user: 0–2 K · 2,1–3 C · 3,1–4 T) ---------- */

const GUIDANCE = {
  kurang:
    'Pengendalian belum dirancang atau tidak berjalan; risiko terjadi berulang tanpa tindak lanjut.',
  cukup:
    'Pengendalian dirancang dan berjalan sebagian; masih ada kejadian atau bukti belum lengkap.',
  terkendali:
    'Pengendalian berjalan efektif dan terdokumentasi; tidak ada kejadian material pada triwulan.',
};

export const scoreBandVersions: ScoreBandVersion[] = [
  { id: 'sbv-1', number: 1, effectiveFrom: '2026-01-01', status: 'active' },
  { id: 'sbv-2', number: 2, effectiveFrom: '2028-01-01', status: 'draft' },
];

export const scoreBands: ScoreBand[] = [
  {
    versionId: 'sbv-1',
    lowerExclusive: null,
    upperInclusive: 2.0,
    predicate: 'kurang',
    order: 1,
    guidance: GUIDANCE.kurang,
  },
  {
    versionId: 'sbv-1',
    lowerExclusive: 2.0,
    upperInclusive: 3.0,
    predicate: 'cukup',
    order: 2,
    guidance: GUIDANCE.cukup,
  },
  {
    versionId: 'sbv-1',
    lowerExclusive: 3.0,
    upperInclusive: 4.0,
    predicate: 'terkendali',
    order: 3,
    guidance: GUIDANCE.terkendali,
  },
  // Draft Versi 2 with a 1,9–2,0 gap: the refused-save example on /master/skala-penilaian.
  {
    versionId: 'sbv-2',
    lowerExclusive: null,
    upperInclusive: 1.9,
    predicate: 'kurang',
    order: 1,
    guidance: GUIDANCE.kurang,
  },
  {
    versionId: 'sbv-2',
    lowerExclusive: 2.0,
    upperInclusive: 2.9,
    predicate: 'cukup',
    order: 2,
    guidance: GUIDANCE.cukup,
  },
  {
    versionId: 'sbv-2',
    lowerExclusive: 2.9,
    upperInclusive: 4.0,
    predicate: 'terkendali',
    order: 3,
    guidance: GUIDANCE.terkendali,
  },
];

/* ---------- Calendar ---------- */

export const fiscalYears: FiscalYear[] = [
  {
    year: 2026,
    status: 'archived',
    toleranceDays: 7,
    archiveGraceDays: 30,
    archivedAt: '2027-02-07T00:05',
    archivedBy: 'hard_limit',
  },
  {
    year: 2027,
    status: 'open',
    toleranceDays: 7,
    archiveGraceDays: 30,
    archivedAt: null,
    archivedBy: null,
  },
];

export const quarters: Quarter[] = [
  ...defaultQuarters(2026, 'sbv-1'),
  // TA 2027: TW I–II have opened windows (version fixed); TW III–IV fixed when their first window opens.
  ...defaultQuarters(2027).map((q) => ({
    ...q,
    scoreBandVersionId: q.number <= 2 ? 'sbv-1' : null,
  })),
];

/** Expected Lini 3 set, recorded at each opened quarter's lini3_opens_on (§2.5). */
export const quarterAssessors: QuarterAssessor[] = [
  'q-2026-1',
  'q-2026-2',
  'q-2026-3',
  'q-2026-4',
  'q-2027-1',
  'q-2027-2',
].flatMap((quarterId) =>
  ['pos-kepatuhan', 'pos-pai'].map((positionId) => ({
    quarterId,
    positionId,
    excluded: false,
    exclusionReason: null,
    excludedByUserId: null,
  })),
);

// A template deactivated during 2027 (FR-MST-004): kept in registers that used it; copy-forward
// marks it "Template sudah tidak aktif".
const rupTemplate = riskTemplates.find((t) => t.code === 'KPA-T1-KA-04')!;
rupTemplate.active = false;
rupTemplate.updatedAt = '2027-09-03';
