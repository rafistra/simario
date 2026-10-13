// Lembar Komunikasi and Lembar Mutu payloads — PRD ch. 9 (FR-LBR-001 … 010).
// Built from a viewer-neutral view (VIS-7): an assessor's values appear only once that assessor's
// result for the risk has opened. Payloads keep per-risk values so a late directorate can be
// masked per reader (FR-LBR-010, VIS-9) and totals recomputed without masked risks.

import type { DB } from '@/data/db';
import { QUARTER_ROMAN } from '../calendar';
import { predicateFor } from '../scoreBands';
import type {
  Attachment,
  Comment,
  ISODateTime,
  Predicate,
  Quarter,
  RiskType,
  ScoreBand,
} from '../types';
import { RISK_TYPES } from '../types';
import { bandVersionFor, optionLabelOf, quarterRisks } from './assessment';
import { expectedLini3 } from './board';
import { assessedInQuarter } from './register';

export type SheetSection = 'A' | 'B' | 'C';

export interface SheetComment {
  id: string;
  author: string;
  role: string;
  at: ISODateTime;
  body: string;
  isStep: boolean;
  files: string[];
  confidential: number;
  images: { id: string; name: string }[];
}

export interface SheetAssessorValue {
  positionId: string;
  label: string;
  name: string;
  opened: boolean;
  /** Kept only to recompute Lembar Mutu after masking; never rendered (PRD v2.8). */
  score: number | null;
  /** The chosen statement, frozen with the payload (INV-22). */
  optionLabel: string | null;
  predicate: Predicate | null;
  notRelevant: boolean;
  notRelevantReason: string | null;
  notAssessed: boolean;
  note: string | null;
  result: 'sesuai' | 'tidak_sesuai' | 'incomparable' | null;
}

export interface SheetRisk {
  riskId: string;
  description: string;
  stage: string;
  riskType: RiskType;
  quiet: boolean;
  recurring: boolean;
  steps: SheetComment[];
  lini1Other: SheetComment[];
  lini2: SheetComment[];
  lini3Comments: SheetComment[];
  l1: SheetAssessorValue;
  lini3: SheetAssessorValue[];
  explanations: {
    directorate: string;
    reason: string;
    plan: string;
    sentAt: ISODateTime;
    sentBy: string;
    late: boolean;
  }[];
  pendingExplanations: number;
}

export interface SheetPayload {
  positionId: string;
  quarterId: string;
  fiscalYear: number;
  quarterNumber: number;
  builtAt: ISODateTime;
  identity: {
    unitName: string;
    unitCode: string;
    positionName: string;
    positionCode: string;
    officialName: string;
    period: string;
    tujuan: string;
    besarAnggaran: number | null;
  };
  assessors: { positionId: string; label: string; name: string; line: 1 | 3 }[];
  bands: ScoreBand[];
  risks: SheetRisk[];
  photos: Record<SheetSection, { id: string; name: string }[]>;
  signatures: { title: string; unit: string; name: string }[];
}

const isImage = (a: Attachment) => a.mimeType.startsWith('image/');

function sheetComment(db: DB, c: Comment, at: ISODateTime): SheetComment {
  const files = db.attachments.filter(
    (a) =>
      a.ownerKind === 'comment' &&
      a.ownerId === c.id &&
      a.scanStatus === 'clean' &&
      a.uploadedAt <= at,
  );
  const user = db.users.find((u) => u.id === c.authorUserId)?.fullName ?? '';
  const pos = db.positions.find((p) => p.id === c.actingPositionId)?.name ?? '';
  return {
    id: c.id,
    author: user,
    role: c.actingAs === 'operator' ? `Operator ${pos}` : pos,
    at: c.createdAt,
    body: c.body,
    isStep: c.isStep,
    files: files.filter((f) => !f.isConfidential && !isImage(f)).map((f) => f.filename),
    confidential: files.filter((f) => f.isConfidential).length,
    images: files
      .filter((f) => !f.isConfidential && isImage(f))
      .map((f) => ({ id: f.id, name: f.filename })),
  };
}

/** Lini 2 holder shown in the signature block: the lead position assigned for the quarter. */
function lini2Lead(db: DB, positionId: string, quarter: Quarter, today: string) {
  const key = (q: Quarter) => q.fiscalYear * 10 + q.number;
  const a = db.assignments.find((x) => {
    if (x.targetPositionId !== positionId) return false;
    const from = db.quarters.find((q) => q.id === x.quarterFromId)!;
    const to = db.quarters.find((q) => q.id === x.quarterToId)!;
    return key(from) <= key(quarter) && key(quarter) <= key(to);
  });
  const occ =
    a &&
    db.occupancies.find(
      (o) =>
        o.positionId === a.leadPositionId &&
        o.isFiller &&
        o.startDate <= today &&
        (!o.endDate || o.endDate >= today),
    );
  return {
    unit: a ? (db.positions.find((p) => p.id === a.leadPositionId)?.name ?? '') : '',
    name: occ ? (db.users.find((u) => u.id === occ.userId)?.fullName ?? '') : '',
  };
}

export function buildSheetPayload(
  db: DB,
  positionId: string,
  quarter: Quarter,
  at: ISODateTime,
  photoSelection?: Partial<Record<SheetSection, string[]>>,
): SheetPayload {
  const today = at.slice(0, 10);
  const position = db.positions.find((p) => p.id === positionId)!;
  const unit = db.orgUnits.find((u) => u.id === position.orgUnitId)!;
  const register = db.registers.find(
    (r) => r.positionId === positionId && r.fiscalYear === quarter.fiscalYear,
  );
  const officialOcc = db.occupancies.find(
    (o) =>
      o.positionId === positionId &&
      o.isFiller &&
      o.startDate <= today &&
      (!o.endDate || o.endDate >= today),
  );
  const official = db.users.find((u) => u.id === officialOcc?.userId)?.fullName ?? '';
  const expected = expectedLini3(db, quarter.id);
  const bandVersion = bandVersionFor(db, quarter);
  const bands = db.scoreBands.filter((b) => b.versionId === bandVersion);
  const label = (s: number | null) => optionLabelOf(db, bandVersion, s);
  const pos = (id: string) => db.positions.find((p) => p.id === id);

  const items = quarterRisks(db, positionId, quarter).filter(({ risk }) =>
    assessedInQuarter(db, risk, quarter),
  );
  const risks: SheetRisk[] = items.map(({ risk, rq }) => {
    const opened = db.results.filter((r) => r.riskQuarterId === rq.id && r.openedAt <= at);
    const comments = db.comments
      .filter(
        (c) =>
          c.registerRiskId === risk.id &&
          c.quarterId === quarter.id &&
          !c.withdrawnAt &&
          c.createdAt <= at,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ c, v: sheetComment(db, c, at) }));
    const a = (id: string) =>
      db.assessments.find((x) => x.riskQuarterId === rq.id && x.assessorPositionId === id);
    const l1a = a(positionId);
    const anyOpen = opened.length > 0;
    const l1: SheetAssessorValue = {
      positionId,
      label: 'L1',
      name: position.name,
      opened: anyOpen,
      score: anyOpen && l1a?.status === 'final' ? l1a.score : null,
      optionLabel: anyOpen && l1a?.status === 'final' ? label(l1a.score) : null,
      predicate: anyOpen && l1a?.status === 'final' ? l1a.predicate : null,
      notRelevant: anyOpen && !!l1a?.notRelevant,
      notRelevantReason: anyOpen ? (l1a?.notRelevantReason ?? null) : null,
      notAssessed: anyOpen && (!l1a || l1a.status === 'not_assessed'),
      note: null,
      result: null,
    };
    const lini3 = expected.map<SheetAssessorValue>((p) => {
      const r = opened.find((x) => x.lini3PositionId === p);
      const x = r ? a(p) : undefined;
      return {
        positionId: p,
        label: pos(p)?.shortName ?? pos(p)?.code ?? '',
        name: pos(p)?.name ?? '',
        opened: !!r,
        score: x?.status === 'final' ? x.score : null,
        optionLabel: x?.status === 'final' ? label(x.score) : null,
        predicate: x?.status === 'final' ? x.predicate : null,
        notRelevant: false,
        notRelevantReason: null,
        notAssessed: !!r && x?.status === 'not_assessed',
        note: x?.note ?? null,
        result: r?.result ?? null,
      };
    });
    const sent = opened.filter(
      (r) => r.explanationStatus === 'sent' && r.explanationSentAt && r.explanationSentAt <= at,
    );
    return {
      riskId: risk.id,
      description: risk.descriptionSnapshot,
      stage: db.stages.find((s) => s.id === risk.stageId)?.name ?? '',
      riskType: risk.riskType,
      quiet: !hasLangkahAt(db, risk.id, quarter.id, at),
      recurring: anyOpen && rq.recurring,
      steps: comments.filter(({ c }) => c.authorLine === 1 && c.isStep).map(({ v }) => v),
      lini1Other: comments.filter(({ c }) => c.authorLine === 1 && !c.isStep).map(({ v }) => v),
      lini2: comments.filter(({ c }) => c.authorLine === 2).map(({ v }) => v),
      lini3Comments: comments.filter(({ c }) => c.authorLine === 3).map(({ v }) => v),
      l1,
      lini3,
      explanations: sent.map((r) => ({
        directorate: pos(r.lini3PositionId)?.name ?? '',
        reason: r.explanationReason ?? '',
        plan: r.explanationPlan ?? '',
        sentAt: r.explanationSentAt!,
        sentBy: db.users.find((u) => u.id === r.explanationSentByUserId)?.fullName ?? '',
        late: !!r.explanationLateness,
      })),
      pendingExplanations: opened.filter(
        (r) => r.explanationRequired && r.explanationStatus !== 'sent',
      ).length,
    };
  });

  // FR-LBR-005: up to 5 images per section; default the 5 most recent.
  const sectionImages = (sec: SheetSection) => {
    const all = risks.flatMap((r) =>
      (sec === 'A'
        ? [...r.steps, ...r.lini1Other]
        : sec === 'B'
          ? r.lini2
          : r.lini3Comments
      ).flatMap((c) => c.images.map((i) => ({ ...i, at: c.at }))),
    );
    const chosen = photoSelection?.[sec];
    if (chosen)
      return chosen
        .map((id) => all.find((i) => i.id === id))
        .filter((i): i is (typeof all)[number] => !!i)
        .slice(0, 5);
    return [...all].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  };
  const strip = (l: { id: string; name: string }[]) => l.map(({ id, name }) => ({ id, name }));
  const lead = lini2Lead(db, positionId, quarter, today);
  const occName = (p: string) => {
    const o = db.occupancies.find(
      (x) =>
        x.positionId === p &&
        x.isFiller &&
        x.startDate <= today &&
        (!x.endDate || x.endDate >= today),
    );
    return db.users.find((u) => u.id === o?.userId)?.fullName ?? '';
  };
  return {
    positionId,
    quarterId: quarter.id,
    fiscalYear: quarter.fiscalYear,
    quarterNumber: quarter.number,
    builtAt: at,
    identity: {
      unitName: unit.name,
      unitCode: unit.code,
      positionName: position.name,
      positionCode: position.code,
      officialName: official,
      period: `TW ${QUARTER_ROMAN[quarter.number - 1]} · ${quarter.startsOn} – ${quarter.endsOn}`,
      tujuan: register?.dataUmum.tujuan ?? '',
      besarAnggaran: register?.dataUmum.besarAnggaran ?? null,
    },
    assessors: [
      { positionId, label: 'L1', name: position.name, line: 1 },
      ...expected.map((p) => ({
        positionId: p,
        label: pos(p)?.shortName ?? '',
        name: pos(p)?.name ?? '',
        line: 3 as const,
      })),
    ],
    bands,
    risks,
    photos: {
      A: strip(sectionImages('A')),
      B: strip(sectionImages('B')),
      C: strip(sectionImages('C')),
    },
    signatures: [
      { title: `Pejabat Lini 1`, unit: position.name, name: official },
      { title: 'Penanggung Jawab Pemantauan', unit: lead.unit || 'Lini 2', name: lead.name },
      { title: 'Direktorat Kepatuhan', unit: 'Lini 3', name: occName('pos-kepatuhan') },
      {
        title: 'Direktorat Pengawasan dan Audit Internal',
        unit: 'Lini 3',
        name: occName('pos-pai'),
      },
    ],
  };
}

/** Langkah present by `at` (comments are filtered by time for snapshots of the past). */
function hasLangkahAt(db: DB, riskId: string, quarterId: string, at: ISODateTime): boolean {
  return db.comments.some(
    (c) =>
      c.registerRiskId === riskId &&
      c.quarterId === quarterId &&
      c.isStep &&
      c.authorLine === 1 &&
      !c.withdrawnAt &&
      c.createdAt <= at,
  );
}

const maskedValue = (v: SheetAssessorValue): SheetAssessorValue => ({
  ...v,
  opened: false,
  score: null,
  optionLabel: null,
  predicate: null,
  notRelevant: false,
  notRelevantReason: null,
  notAssessed: false,
  note: null,
  result: null,
});

/**
 * FR-LBR-010 / VIS-9: for a Lini 3 reader whose own result for a risk has not opened, every other
 * assessment, result, explanation and the Berulang marker of that risk show "Menunggu".
 * Comments and the quiet marker are not masked. Returns the payload and the masked risk ids.
 */
export function maskPayloadFor(
  payload: SheetPayload,
  lini3PositionIds: string[],
): { payload: SheetPayload; masked: string[] } {
  const mine = payload.assessors
    .filter((a) => a.line === 3 && lini3PositionIds.includes(a.positionId))
    .map((a) => a.positionId);
  if (mine.length === 0) return { payload, masked: [] };
  const masked: string[] = [];
  const risks = payload.risks.map((r) => {
    const late = mine.some((p) => !r.lini3.find((x) => x.positionId === p)?.opened);
    if (!late) return r;
    masked.push(r.riskId);
    return {
      ...r,
      recurring: false,
      l1: maskedValue(r.l1),
      lini3: r.lini3.map((x) => (mine.includes(x.positionId) ? x : maskedValue(x))),
      explanations: [],
      pendingExplanations: 0,
    };
  });
  return { payload: { ...payload, risks }, masked };
}

export interface PayloadMutu {
  rows: {
    riskType: RiskType;
    cells: { predicate: Predicate | null; opened: boolean }[];
  }[];
  sesuai: number;
  tidakSesuai: number;
  berulang: number;
  notAssessedL1: string[];
}

/** FR-LBR-004 computed from a (possibly masked) payload. */
export function mutuFromPayload(p: SheetPayload): PayloadMutu {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const rows = RISK_TYPES.map((riskType) => {
    const ofType = p.risks.filter((r) => r.riskType === riskType);
    const cells = p.assessors.map((as) => {
      const values = ofType
        .map((r) => (as.line === 1 ? r.l1 : r.lini3.find((x) => x.positionId === as.positionId)!))
        .filter((v) => v?.opened);
      const scores = values
        .filter((v) => !v.notRelevant && !v.notAssessed && v.score !== null)
        .map((v) => v.score!);
      const average = scores.length
        ? round1(scores.reduce((s, v) => s + v, 0) / scores.length)
        : null;
      return {
        predicate: average === null ? null : predicateFor(average, p.bands),
        opened: values.length > 0,
      };
    });
    return { riskType, cells };
  });
  const results = p.risks.flatMap((r) => r.lini3.filter((x) => x.opened).map((x) => x.result));
  return {
    rows,
    sesuai: results.filter((r) => r === 'sesuai').length,
    tidakSesuai: results.filter((r) => r === 'tidak_sesuai').length,
    berulang: p.risks.filter((r) => r.recurring).length,
    notAssessedL1: p.risks.filter((r) => r.l1.notAssessed).map((r) => r.description),
  };
}

/** FR-LBR-009 freeze condition: every risk opened at least partially, every obligation closed. */
export function freezeReady(
  db: DB,
  positionId: string,
  quarter: Quarter,
  at: ISODateTime,
): boolean {
  const items = quarterRisks(db, positionId, quarter);
  if (items.length === 0) return false;
  const tolerance = db.fiscalYears.find((f) => f.year === quarter.fiscalYear)?.toleranceDays ?? 7;
  const today = at.slice(0, 10);
  const addDays = (d: string, n: number) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  return items.every(({ rq }) => {
    const opened = db.results.filter((r) => r.riskQuarterId === rq.id && r.openedAt <= at);
    if (opened.length === 0) return false;
    return opened.every(
      (r) =>
        !r.explanationRequired ||
        r.explanationStatus === 'sent' ||
        (r.explanationDueOn !== null && today > addDays(r.explanationDueOn, tolerance)),
    );
  });
}

/** `SIMARIO/[LK|LM]/[TA]/TW[n]/[kode unit]-[kode jabatan]/[urut]` (§2.8 PrintSnapshot). */
export function snapshotNumber(
  db: DB,
  kind: 'komunikasi' | 'mutu',
  positionId: string,
  quarter: Quarter,
): string {
  const p = db.positions.find((x) => x.id === positionId)!;
  const unit = db.orgUnits.find((u) => u.id === p.orgUnitId)!;
  const prefix = `SIMARIO/${kind === 'komunikasi' ? 'LK' : 'LM'}/${quarter.fiscalYear}/TW${quarter.number}/${unit.code}-${p.code}/`;
  const seq = db.snapshots.filter((s) => s.number.startsWith(prefix)).length + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}
