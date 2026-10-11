// Assessment seed: TW IV 2026 (archived lineage) and TW I 2027 (opened by 6 Apr 2027) for
// PPK A-1, plus PPK A-2 and Pejabat Pengadaan Satker B; TW II 2027 Lini 3 drafts (blind phase).
// Scores follow the DesignBrief §11/§13 with boundary scores shifted to the confirmed bands.

import { latenessAt } from '@/domain/calendar';
import { compareAssessments, explanationDueOn } from '@/domain/rules/comparison';
import { predicateFor } from '@/domain/scoreBands';
import type { Assessment, ComparisonResult, Lateness, RiskQuarter } from '@/domain/types';
import { scoreBands } from './reference';

const BANDS = scoreBands.filter((b) => b.versionId === 'sbv-1');

export const riskQuarters: RiskQuarter[] = [];
export const assessments: Assessment[] = [];
export const results: ComparisonResult[] = [];

const KEP = 'pos-kepatuhan';
const PAI = 'pos-pai';

type Score = number | 'nr' | null; // 'nr' = Lini 1 "Belum relevan"; null = not finalised

interface Finalise {
  at: string;
  by: string;
  deadline: string;
}

interface RowSpec {
  riskId: string;
  l1: Score;
  kep: Score;
  pai: Score;
  l1Final?: Finalise;
  kepFinal?: Finalise;
  paiFinal?: Finalise;
  notRelevantReason?: string;
  kepNote?: string;
  paiNote?: string;
  noEvidence?: boolean;
}

interface QuarterSpec {
  quarterId: string;
  l1Pos: string;
  l1Default: Finalise;
  kepDefault: Finalise;
  paiDefault: Finalise;
  /** When the comparison evaluation ran for a risk whose assessors are all final. */
  fullOpenAt: (row: RowSpec) => string;
  /** Lini 3 deadline passing: partial opening for Lini 3 positions already final. */
  deadlinePassedAt: string;
  explanationWorkdays: number;
  explanations?: Record<string, Partial<ComparisonResult>>;
  recurring?: string[];
}

const assessmentId = (rqId: string, pos: string) => `as-${rqId}-${pos}`;

function makeAssessment(
  rqId: string,
  positionId: string,
  line: 1 | 3,
  score: Score,
  fin: Finalise | undefined,
  extra: Partial<Assessment>,
): Assessment {
  const final = score !== null && fin;
  const numeric = typeof score === 'number' ? score : null;
  return {
    id: assessmentId(rqId, positionId),
    riskQuarterId: rqId,
    assessorPositionId: positionId,
    assessorLine: line,
    status: final ? 'final' : 'draft',
    score: numeric,
    predicate: numeric === null ? null : predicateFor(numeric, BANDS),
    notRelevant: score === 'nr',
    notRelevantReason: null,
    note: null,
    scoreBandVersionId: 'sbv-1',
    finalisedByUserId: final ? fin!.by : null,
    finalisedAt: final ? fin!.at : null,
    lateness: final ? (latenessAt(fin!.at, fin!.deadline, 7) as Lateness) : null,
    flags: [],
    updatedAt: fin?.at ?? '2027-04-05T10:00',
    ...extra,
  };
}

function seedQuarter(spec: QuarterSpec, rows: RowSpec[]) {
  for (const row of rows) {
    const rqId = `rq-${row.riskId}-${spec.quarterId}`;
    const l1 = makeAssessment(
      rqId,
      spec.l1Pos,
      1,
      row.l1,
      row.l1 === null ? undefined : (row.l1Final ?? spec.l1Default),
      {
        notRelevantReason: row.l1 === 'nr' ? (row.notRelevantReason ?? null) : null,
        flags: row.noEvidence ? ['no_evidence'] : [],
      },
    );
    const kep = makeAssessment(
      rqId,
      KEP,
      3,
      row.kep,
      row.kep === null ? undefined : (row.kepFinal ?? spec.kepDefault),
      { note: row.kepNote ?? null },
    );
    const pai = makeAssessment(
      rqId,
      PAI,
      3,
      row.pai,
      row.pai === null ? undefined : (row.paiFinal ?? spec.paiDefault),
      { note: row.paiNote ?? null },
    );
    // An assessor who has not started has no row ("Belum dimulai").
    assessments.push(...[l1, kep, pai].filter((a) => a.score !== null || a.notRelevant));

    // Opening per §2.5: all assessors final → open at the later finalise; otherwise at the
    // Lini 3 deadline the finalised Lini 3 positions open (partial), the rest when they finalise.
    const l3 = [kep, pai].filter((a) => a.status === 'final');
    const allFinal = l1.status === 'final' && l3.length === 2;
    const openedAt = new Map<string, string>();
    if (allFinal) {
      const fullAt = spec.fullOpenAt(row);
      const latest = [l1, kep, pai]
        .map((a) => a.finalisedAt!)
        .sort()
        .at(-1)!;
      if (latest <= spec.deadlinePassedAt) {
        openedAt.set(KEP, fullAt);
        openedAt.set(PAI, fullAt);
      } else {
        for (const a of l3)
          openedAt.set(
            a.assessorPositionId,
            a.finalisedAt! <= spec.deadlinePassedAt ? spec.deadlinePassedAt : a.finalisedAt!,
          );
      }
    } else if (l3.length > 0) {
      for (const a of l3)
        openedAt.set(
          a.assessorPositionId,
          a.finalisedAt! <= spec.deadlinePassedAt ? spec.deadlinePassedAt : a.finalisedAt!,
        );
    }

    const opened = openedAt.size > 0;
    const status = !opened ? 'waiting' : openedAt.size === 2 ? 'open' : 'partial';
    riskQuarters.push({
      id: rqId,
      registerRiskId: row.riskId,
      quarterId: spec.quarterId,
      comparisonStatus: status,
      firstOpenedAt: opened ? [...openedAt.values()].sort()[0]! : null,
      recurring: spec.recurring?.includes(row.riskId) ?? false,
    });

    for (const a of [kep, pai]) {
      const at = openedAt.get(a.assessorPositionId);
      if (!at) continue;
      const outcome = compareAssessments(l1, a);
      const key = `${row.riskId}:${a.assessorPositionId}`;
      results.push({
        id: `cr-${rqId}-${a.assessorPositionId}`,
        riskQuarterId: rqId,
        lini3PositionId: a.assessorPositionId,
        openedAt: at,
        ...outcome,
        explanationDueOn:
          outcome.result === 'tidak_sesuai' ? explanationDueOn(at, spec.explanationWorkdays) : null,
        explanationReason: null,
        explanationPlan: null,
        explanationSentAt: null,
        explanationSentByUserId: null,
        explanationLateness: null,
        ...spec.explanations?.[key],
      });
    }
  }
}

/* ---------- PPK A-1 · TW I–III 2026 (archived; history across years, FR-RWY-004) ---------- */

for (const [n, l1At, l3At, rows] of [
  [
    1,
    { at: '2026-03-26T14:00', deadline: '2026-03-27' },
    { at: '2026-04-02T10:00', deadline: '2026-04-03' },
    [
      { riskId: 'rr26-pemecahan', l1: 2.8, kep: 2.6, pai: 2.5 },
      { riskId: 'rr26-penyerapan', l1: 2.6, kep: 2.4, pai: 2.2 },
      { riskId: 'rr26-pembayaran', l1: 3.2, kep: 3.3, pai: 3.1 },
      { riskId: 'rr26-pl', l1: 2.7, kep: 2.9, pai: 2.8 },
    ],
  ],
  [
    2,
    { at: '2026-06-24T15:30', deadline: '2026-06-26' },
    { at: '2026-07-02T11:00', deadline: '2026-07-03' },
    [
      { riskId: 'rr26-pemecahan', l1: 2.7, kep: 2.5, pai: 2.3 },
      { riskId: 'rr26-penyerapan', l1: 2.9, kep: 3.0, pai: 2.7 },
      { riskId: 'rr26-pembayaran', l1: 3.3, kep: 3.2, pai: 3.4 },
      { riskId: 'rr26-pl', l1: 2.6, kep: 2.5, pai: 2.6 },
    ],
  ],
  [
    3,
    { at: '2026-09-24T10:00', deadline: '2026-09-25' },
    { at: '2026-10-01T16:00', deadline: '2026-10-02' },
    [
      { riskId: 'rr26-pemecahan', l1: 2.6, kep: 2.2, pai: 2.1 },
      {
        riskId: 'rr26-penyerapan',
        l1: 3.0,
        kep: 3.2,
        pai: 2.9,
        kepNote: 'Realisasi TW III melampaui RPD.',
      },
      { riskId: 'rr26-pembayaran', l1: 3.4, kep: 3.3, pai: 3.2 },
      { riskId: 'rr26-pl', l1: 2.8, kep: 2.7, pai: 2.9 },
    ],
  ],
] as const) {
  seedQuarter(
    {
      quarterId: `q-2026-${n}`,
      l1Pos: 'pos-ppk-a1',
      l1Default: { ...l1At, by: 'usr-andi' },
      kepDefault: { ...l3At, by: 'usr-hendra' },
      paiDefault: { ...l3At, by: 'usr-maya' },
      fullOpenAt: () => l3At.at,
      deadlinePassedAt: `${l3At.deadline}T23:59`,
      explanationWorkdays: 5,
    },
    rows.map((r) => ({ ...r })),
  );
}

/* ---------- PPK A-1 · TW IV 2026 (archived) ---------- */

seedQuarter(
  {
    quarterId: 'q-2026-4',
    l1Pos: 'pos-ppk-a1',
    l1Default: { at: '2026-12-23T15:00', by: 'usr-andi', deadline: '2026-12-25' },
    kepDefault: { at: '2026-12-30T10:00', by: 'usr-hendra', deadline: '2027-01-01' },
    paiDefault: { at: '2026-12-31T09:00', by: 'usr-maya', deadline: '2027-01-01' },
    fullOpenAt: () => '2026-12-31T09:00',
    deadlinePassedAt: '2027-01-02T00:00',
    explanationWorkdays: 5,
    explanations: {
      'rr26-pemecahan:pos-pai': {
        explanationStatus: 'sent',
        explanationReason:
          'Dua paket perangkat jaringan dipecah karena ketersediaan anggaran bertahap pada revisi DIPA.',
        explanationPlan:
          'Menggabungkan paket sejenis dalam satu proses E-Purchasing mulai TA 2027.',
        explanationSentAt: '2027-01-06T14:20',
        explanationSentByUserId: 'usr-andi',
      },
    },
  },
  [
    {
      riskId: 'rr26-pemecahan',
      l1: 2.5,
      kep: 2.3,
      pai: 1.7,
      paiNote:
        'Ditemukan dua kontrak sejenis dengan nilai di bawah ambang tender pada November 2026.',
    },
    { riskId: 'rr26-penyerapan', l1: 2.9, kep: 3.2, pai: 2.8 },
    { riskId: 'rr26-pembayaran', l1: 3.3, kep: 3.2, pai: 3.4 },
    { riskId: 'rr26-pl', l1: 2.6, kep: 2.6, pai: 2.4 },
  ],
);

/* ---------- PPK A-1 · TW I 2027 ---------- */

const L1_TW1 = { at: '2027-03-25T16:20', by: 'usr-andi', deadline: '2027-03-26' };
const PAI_LATE = { at: '2027-04-06T08:30', by: 'usr-maya', deadline: '2027-04-02' };

seedQuarter(
  {
    quarterId: 'q-2027-1',
    l1Pos: 'pos-ppk-a1',
    l1Default: L1_TW1,
    kepDefault: { at: '2027-04-01T15:00', by: 'usr-hendra', deadline: '2027-04-02' },
    paiDefault: { at: '2027-04-02T11:00', by: 'usr-maya', deadline: '2027-04-02' },
    fullOpenAt: () => '2027-04-02T11:00',
    deadlinePassedAt: '2027-04-03T00:00',
    explanationWorkdays: 5,
    recurring: ['rr-a1-pemecahan'],
    explanations: {
      'rr-a1-pemecahan:pos-kepatuhan': {
        explanationStatus: 'ready',
        explanationReason:
          'Dua paket lisensi diadakan terpisah karena DIPA awal memblokir sebagian anggaran.',
        explanationPlan:
          'Menggabungkan paket sejenis setelah blokir dibuka dan melapor ke UKPBJ sebelum 30 April 2027.',
      },
    },
  },
  [
    {
      riskId: 'rr-a1-penyerapan',
      l1: 2.4,
      kep: 2.6,
      pai: 1.8,
      kepNote: 'Realisasi TW I 8,4% di bawah RPD 12%; langkah penjadwalan ulang sudah tercatat.',
      paiNote: 'Tidak ada bukti pemantauan bulanan untuk Februari; dashboard belum dipakai.',
    },
    { riskId: 'rr-a1-dipa', l1: 3.2, kep: 3.1, pai: 3.1, noEvidence: true },
    {
      riskId: 'rr-a1-rpd',
      l1: 'nr',
      kep: 2.2,
      pai: 2.1,
      notRelevantReason:
        'Penarikan dana TW I hanya untuk belanja pegawai; RPD kegiatan baru berjalan TW II.',
    },
    {
      riskId: 'rr-a1-pemecahan',
      l1: 2.6,
      kep: 1.6,
      pai: 1.4,
      kepNote:
        'Dua kontrak lisensi sejenis dengan nilai di bawah ambang tender pada Februari 2027.',
      paiNote: 'Pola berulang sejak TW IV 2026.',
    },
    {
      riskId: 'rr-a1-pembayaran',
      l1: 3.1,
      kep: 3.4,
      pai: 2.7,
      paiFinal: PAI_LATE,
      paiNote: 'Satu tagihan termin terverifikasi 9 hari kerja.',
    },
    {
      riskId: 'rr-a1-material',
      l1: 3.1,
      kep: 3.1,
      pai: 2.9,
      l1Final: { at: '2027-03-29T09:10', by: 'usr-andi', deadline: '2027-03-26' },
      paiFinal: PAI_LATE,
    },
    { riskId: 'rr-a1-penyuapan', l1: 1.9, kep: 2.8, pai: 2.5, paiFinal: PAI_LATE },
  ],
);

/* ---------- PPK A-2 and Pejabat Pengadaan Satker B · TW I 2027 ---------- */

seedQuarter(
  {
    quarterId: 'q-2027-1',
    l1Pos: 'pos-ppk-a2',
    l1Default: { at: '2027-03-24T10:00', by: 'usr-bambang', deadline: '2027-03-26' },
    kepDefault: { at: '2027-03-31T11:00', by: 'usr-hendra', deadline: '2027-04-02' },
    paiDefault: { at: '2027-04-01T14:00', by: 'usr-maya', deadline: '2027-04-02' },
    fullOpenAt: () => '2027-04-01T14:00',
    deadlinePassedAt: '2027-04-03T00:00',
    explanationWorkdays: 5,
  },
  [
    { riskId: 'rr-a2-kebutuhan', l1: 3.2, kep: 3.3, pai: 3.1 },
    { riskId: 'rr-a2-luar-rencana', l1: 3.4, kep: 3.2, pai: 3.5 },
    { riskId: 'rr-a2-markup', l1: 2.8, kep: 2.6, pai: 2.4 },
  ],
);

seedQuarter(
  {
    quarterId: 'q-2027-1',
    l1Pos: 'pos-pjp-satker-b',
    l1Default: { at: '2027-03-26T15:30', by: 'usr-wulan', deadline: '2027-03-26' },
    kepDefault: { at: '2027-04-02T10:00', by: 'usr-hendra', deadline: '2027-04-02' },
    paiDefault: { at: '2027-04-02T10:00', by: 'usr-maya', deadline: '2027-04-02' },
    fullOpenAt: () => '2027-04-02T10:00',
    deadlinePassedAt: '2027-04-03T00:00',
    explanationWorkdays: 5,
  },
  [
    // PAI has not finalised Satker B yet: partial opening, PAI marked late in the queue.
    { riskId: 'rr-pjp-pemilihan', l1: 2.7, kep: 2.5, pai: null },
    { riskId: 'rr-pjp-evaluasi', l1: 3.3, kep: 3.2, pai: null },
    { riskId: 'rr-pjp-konflik', l1: 3.0, kep: 2.2, pai: null },
  ],
);

/* ---------- TW II 2027: RiskQuarter rows + Lini 3 blind drafts ---------- */

const TW2_RISKS = [
  'rr-a1-penyerapan',
  'rr-a1-dipa',
  'rr-a1-pemecahan',
  'rr-a1-pembayaran',
  'rr-a1-material',
  'rr-a1-penyuapan',
  'rr-a2-kebutuhan',
  'rr-a2-luar-rencana',
  'rr-a2-markup',
  'rr-pjp-pemilihan',
  'rr-pjp-evaluasi',
  'rr-pjp-konflik',
];

for (const riskId of TW2_RISKS) {
  riskQuarters.push({
    id: `rq-${riskId}-q-2027-2`,
    registerRiskId: riskId,
    quarterId: 'q-2027-2',
    comparisonStatus: 'waiting',
    firstOpenedAt: null,
    recurring: false,
  });
}

// Hendra's directorate started TW II early (window opened 1 Apr): two drafts, blind to everyone else.
for (const [riskId, score, note] of [
  ['rr-a1-pemecahan', 1.8, 'Belum ada bukti penggabungan paket.'],
  ['rr-a1-penyerapan', 2.7, null],
] as const) {
  const rqId = `rq-${riskId}-q-2027-2`;
  assessments.push(
    makeAssessment(rqId, KEP, 3, score, undefined, { note, updatedAt: '2027-04-05T16:45' }),
  );
}
