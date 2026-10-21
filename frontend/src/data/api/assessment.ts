// Quarterly assessment — PRD ch. 7 (FR-NIL-001 … 012). Drafting needs permission 4 (Lini 1) or 8
// (Lini 3) on the assessor position; finalising, reopening and sending need 5 / 9 as Pejabat
// (INV-12). Visibility (VIS-1/2/3/4/5/9) is applied in `buildAssessment`, never only in JSX.

import { QUARTER_ROMAN } from '@/domain/calendar';
import { checkAction, hasPermission, holdingsOf, type Holding } from '@/domain/rules/access';
import {
  assessmentFrozen,
  bandVersionFor,
  comparisonStatusAt,
  explanationLateness,
  finaliseLateness,
  holdersOf,
  lini2For,
  lini3Overdue,
  optionsOf,
  pendingExplanationLateness,
  predicateIn,
  quarterRisks,
  resultOpened,
  toDisplay,
  type AssessmentDisplay,
  windowOpen,
  windowOpensOn,
} from '@/domain/rules/assessment';
import {
  expectedLini3,
  fileProblem,
  isQuiet,
  MAX_FILES,
  openedResults,
} from '@/domain/rules/board';
import { registerStages } from '@/domain/rules/register';
import { optionFor, predicateFor } from '@/domain/scoreBands';
import {
  canSeeAssessment,
  canSeeAttachment,
  canSeeResult,
  isLateDirectorate,
  viewerFor,
  type Viewer,
} from '@/domain/rules/visibility';
import type {
  Assessment,
  Attachment,
  ComparisonResult,
  ComparisonStatus,
  ISODate,
  ISODateTime,
  Lateness,
  Predicate,
  Quarter,
  RegisterRisk,
  RiskQuarter,
  RiskType,
  Stage,
} from '@/domain/types';
import { formatDate } from '@/lib/format';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { assertCanRead } from '../local/actor';
import { ApiError, call } from '../local/call';
import { runComparisons } from '../local/comparisons';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit, writeNotification } from '../local/writers';
import type { NewFile } from './thread';

/* ---------- Read model ---------- */

export interface ScoreOptionItem {
  value: number;
  label: string;
  predicate: Predicate | null;
}

export interface CellView {
  positionId: string;
  line: 1 | 3;
  label: string;
  shortLabel: string;
  own: boolean;
  visible: boolean;
  editable: boolean;
  assessment: AssessmentDisplay | null;
  /** The viewer's own chosen value (dropdown key); null for every other column. */
  selectedValue: number | null;
  attachments: { attachment: Attachment; scanning: boolean }[];
  confidentialHidden: number;
  /** Lini 3 cells: the opened result as the viewer may see it. */
  result: ComparisonResult | null;
  /** Not finalised and past the deadline (lateness is marked, never locked). */
  overdue: boolean;
  canReopen: boolean;
  frozen: boolean;
}

export interface ExplanationView {
  result: ComparisonResult;
  directorate: string;
  /** Lini 1 holders see drafts; everyone else only the sent text. */
  showText: boolean;
  editable: boolean;
  sentByName: string | null;
  pendingLateness: Lateness;
}

export type RowSummary = 'waiting' | 'partial' | 'sesuai' | 'tidak_sesuai' | 'incomparable';

export interface RowView {
  rq: RiskQuarter;
  risk: RegisterRisk;
  stage: Stage;
  stageIndex: number;
  riskType: RiskType;
  quiet: boolean;
  recurring: boolean;
  summary: RowSummary;
  cells: CellView[];
  explanations: ExplanationView[];
  pinned: boolean;
}

export type AssessmentMode = 'lini1' | 'lini3' | 'reader';

export interface AssessmentView {
  quarter: Quarter;
  quarters: Quarter[];
  positionId: string;
  positionName: string;
  published: boolean;
  archived: boolean;
  mode: AssessmentMode;
  /** The viewer's own assessor column (Lini 1 position or Lini 3 directorate). */
  ownPositionId: string | null;
  holding: Holding | null;
  canFinalise: boolean;
  isOperator: boolean;
  officialName: string | null;
  windowOpen: boolean;
  opensOn: ISODate;
  status: ComparisonStatus;
  counts: Record<ComparisonStatus, number>;
  options: ScoreOptionItem[];
  guidance: { predicate: Predicate; guidance: string }[];
  bandVersionNumber: number | null;
  rows: RowView[];
  progress: { finalised: number; ready: number; draft: number; unscored: number; total: number };
  explanations: { pending: number; ready: number; nearestDue: ISODate | null };
  blind: { allowed: boolean; granted: boolean };
}

const isPublishedRegister = (status: string, publishedAt: string | null) =>
  status === 'published' || status === 'archived' || !!publishedAt;

function sessionUser() {
  const userId = useSession.getState().userId;
  if (!userId) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  return userId;
}

function attachmentsOf(db: DB, viewer: Viewer, assessmentId: string) {
  const list: { attachment: Attachment; scanning: boolean }[] = [];
  let hidden = 0;
  for (const a of db.attachments.filter(
    (x) => x.ownerKind === 'assessment' && x.ownerId === assessmentId,
  )) {
    if (a.scanStatus === 'quarantined') continue;
    if (a.isConfidential && !viewer.canSeeConfidential) {
      hidden++;
      continue;
    }
    if (a.scanStatus === 'pending') {
      if (a.uploadedById === viewer.userId) list.push({ attachment: a, scanning: true });
      continue;
    }
    if (canSeeAttachment(viewer, a)) list.push({ attachment: a, scanning: false });
  }
  return { list, hidden };
}

const dirName = (name: string) => name.replace(/^Direktorat /, '');

export function buildAssessment(
  db: DB,
  userId: string,
  positionId: string,
  fiscalYear: number,
  tw: number,
  at: ISODateTime,
  blindRequested = false,
): AssessmentView {
  const today = at.slice(0, 10);
  const quarter = db.quarters.find((q) => q.fiscalYear === fiscalYear && q.number === tw);
  if (!quarter)
    throw new ApiError('not_found', `Triwulan TW ${tw} TA ${fiscalYear} tidak ditemukan.`);
  assertCanRead(db, userId, positionId, today, fiscalYear);
  const quarters = db.quarters
    .filter((q) => q.fiscalYear === fiscalYear)
    .sort((a, b) => a.number - b.number);
  const position = db.positions.find((p) => p.id === positionId)!;
  const register = db.registers.find(
    (r) => r.positionId === positionId && r.fiscalYear === fiscalYear,
  );
  const published = !!register && isPublishedRegister(register.status, register.publishedAt);
  const archived = db.fiscalYears.find((f) => f.year === fiscalYear)?.status === 'archived';
  const blindAllowed = hasPermission(db, userId, 24, today);
  const viewer = viewerFor(db, userId, today, blindRequested && blindAllowed);
  const expected = expectedLini3(db, quarter.id);
  const holdings = holdingsOf(db, userId, today);

  let mode: AssessmentMode = 'reader';
  let holding: Holding | null = holdings.find((h) => h.positionId === positionId) ?? null;
  let ownPositionId: string | null = null;
  if (holding && hasPermission(db, userId, 4, today)) {
    mode = 'lini1';
    ownPositionId = positionId;
  } else {
    holding = holdings.find((h) => h.line === 3 && expected.includes(h.positionId)) ?? null;
    if (holding && hasPermission(db, userId, 8, today)) {
      mode = 'lini3';
      ownPositionId = holding.positionId;
    } else holding = null;
  }
  const ownLine: 1 | 3 = mode === 'lini3' ? 3 : 1;
  const draftOk = ownPositionId
    ? checkAction(db, userId, ownLine === 1 ? 4 : 8, ownPositionId, today).ok
    : false;
  const finaliseOk = ownPositionId
    ? checkAction(db, userId, ownLine === 1 ? 5 : 9, ownPositionId, today).ok
    : false;
  const isOpen = windowOpen(quarter, ownLine, today);
  const official = ownPositionId
    ? db.users.find(
        (u) =>
          u.id ===
          db.occupancies.find(
            (o) =>
              o.positionId === ownPositionId &&
              o.isFiller &&
              o.startDate <= today &&
              (!o.endDate || o.endDate >= today),
          )?.userId,
      )
    : undefined;

  const stages = register ? registerStages(db, register).filter((s) => s.active) : [];
  const allStages = register ? registerStages(db, register) : [];
  const items = published ? quarterRisks(db, positionId, quarter) : [];
  const columns: { positionId: string; line: 1 | 3 }[] = [
    { positionId, line: 1 },
    ...expected.map((p) => ({ positionId: p, line: 3 as const })),
  ];
  const counts: Record<ComparisonStatus, number> = { waiting: 0, partial: 0, open: 0 };
  const progress = { finalised: 0, ready: 0, draft: 0, unscored: 0, total: items.length };
  let pendingExpl = 0;
  let readyExpl = 0;
  let nearestDue: ISODate | null = null;

  const rows: RowView[] = items.map(({ risk, rq }) => {
    const opened = openedResults(db, rq.id, at);
    const openedSet = new Set(opened.map((r) => r.lini3PositionId));
    counts[comparisonStatusAt(db, rq, at)]++;
    const late = isLateDirectorate(viewer, openedSet, expected) && !viewer.blindViewGranted;
    const cells: CellView[] = columns.map((col) => {
      const p = db.positions.find((x) => x.id === col.positionId);
      const a = db.assessments.find(
        (x) => x.riskQuarterId === rq.id && x.assessorPositionId === col.positionId,
      );
      const own = col.positionId === ownPositionId;
      const frozen = a
        ? assessmentFrozen(db, a, at)
        : col.line === 1
          ? opened.length > 0
          : openedSet.has(col.positionId);
      let visible = own || viewer.blindViewGranted;
      if (!visible && a)
        visible =
          canSeeAssessment(viewer, a, openedSet, expected) &&
          (a.status === 'final' || a.status === 'not_assessed');
      const files = a && visible ? attachmentsOf(db, viewer, a.id) : { list: [], hidden: 0 };
      const result =
        col.line === 3 && !late
          ? (opened.find((r) => r.lini3PositionId === col.positionId) ?? null)
          : null;
      const status = a?.status;
      return {
        positionId: col.positionId,
        line: col.line,
        label: `Lini ${col.line} · ${col.line === 1 ? (p?.name ?? '') : dirName(p?.name ?? '')}`,
        shortLabel: col.line === 1 ? 'L1' : (p?.shortName ?? p?.code ?? ''),
        own,
        visible,
        editable:
          own &&
          draftOk &&
          isOpen &&
          !frozen &&
          !archived &&
          status !== 'final' &&
          status !== 'not_assessed',
        assessment: visible && a ? toDisplay(db, a) : null,
        selectedValue: own && a ? a.score : null,
        attachments: files.list,
        confidentialHidden: files.hidden,
        result,
        overdue:
          col.line === 3
            ? lini3Overdue(quarter, a, today) && !openedSet.has(col.positionId)
            : (!a || (a.status !== 'final' && a.status !== 'not_assessed')) &&
              today > quarter.lini1Deadline,
        canReopen: own && finaliseOk && status === 'final' && !frozen && !archived,
        frozen,
      };
    });

    const visibleResults = late ? [] : opened;
    let summary: RowSummary = 'waiting';
    if (visibleResults.length) {
      if (visibleResults.some((r) => r.result === 'tidak_sesuai')) summary = 'tidak_sesuai';
      else if (visibleResults.length < expected.length) summary = 'partial';
      else if (visibleResults.every((r) => r.result === 'incomparable')) summary = 'incomparable';
      else summary = 'sesuai';
    }

    const lini1Holder = mode === 'lini1';
    const explanations: ExplanationView[] = visibleResults
      .filter((r) => r.result === 'tidak_sesuai' && canSeeResult(viewer, openedSet, expected))
      .map((r) => {
        const sent = r.explanationStatus === 'sent';
        if (lini1Holder && !sent && r.explanationRequired) {
          if (r.explanationStatus === 'ready') readyExpl++;
          else pendingExpl++;
          if (r.explanationDueOn && (!nearestDue || r.explanationDueOn < nearestDue))
            nearestDue = r.explanationDueOn;
        }
        return {
          result: r,
          directorate: db.positions.find((p) => p.id === r.lini3PositionId)?.name ?? '',
          showText: sent || lini1Holder,
          editable:
            lini1Holder && draftOk && !sent && r.explanationStatus !== 'not_sent' && !archived,
          sentByName: r.explanationSentByUserId
            ? (db.users.find((u) => u.id === r.explanationSentByUserId)?.fullName ?? null)
            : null,
          pendingLateness: sent ? null : pendingExplanationLateness(db, r, today, fiscalYear),
        };
      });

    const ownCell = cells.find((c) => c.own);
    if (ownCell) {
      const s = ownCell.assessment?.status;
      if (s === 'final' || s === 'not_assessed') progress.finalised++;
      else if (s === 'ready') progress.ready++;
      else if (
        ownCell.assessment &&
        (ownCell.selectedValue !== null || ownCell.assessment.notRelevant)
      )
        progress.draft++;
      else progress.unscored++;
    }
    const stage = db.stages.find((s) => s.id === risk.stageId)!;
    return {
      rq,
      risk,
      stage,
      stageIndex: stages.indexOf(stage) + 1,
      riskType: risk.riskType,
      quiet: isQuiet(db, risk, quarter) && today >= quarter.startsOn && today <= quarter.endsOn,
      recurring: !late && rq.recurring && opened.length > 0,
      summary,
      cells,
      explanations,
      pinned:
        lini1Holder &&
        explanations.some(
          (e) => e.result.explanationRequired && e.result.explanationStatus !== 'sent',
        ),
    };
  });

  const stageOrder = (s: Stage) => allStages.indexOf(s);
  const typeOrder: RiskType[] = ['kinerja_anggaran', 'ketidakpatuhan', 'kecurangan'];
  rows.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      stageOrder(a.stage) - stageOrder(b.stage) ||
      typeOrder.indexOf(a.riskType) - typeOrder.indexOf(b.riskType) ||
      a.risk.order - b.risk.order,
  );

  const bandVersion = bandVersionFor(db, quarter);
  const bands = db.scoreBands
    .filter((b) => b.versionId === bandVersion)
    .sort((a, b) => a.order - b.order);
  const status: ComparisonStatus =
    items.length === 0
      ? 'waiting'
      : counts.open === items.length
        ? 'open'
        : counts.waiting === items.length
          ? 'waiting'
          : 'partial';
  return {
    quarter,
    quarters,
    positionId,
    positionName: position.name,
    published,
    archived,
    mode,
    ownPositionId,
    holding,
    canFinalise: finaliseOk && !archived,
    isOperator: holding?.capacity === 'operator',
    officialName: official?.fullName ?? null,
    windowOpen: isOpen,
    opensOn: windowOpensOn(quarter, ownLine),
    status,
    counts,
    options: optionsOf(db, bandVersion).map((o) => ({
      value: o.value,
      label: o.label,
      predicate: predicateFor(o.value, bands),
    })),
    guidance: bands.map((b) => ({ predicate: b.predicate, guidance: b.guidance })),
    bandVersionNumber: db.scoreBandVersions.find((v) => v.id === bandVersion)?.number ?? null,
    rows,
    progress,
    explanations: { pending: pendingExpl, ready: readyExpl, nearestDue },
    blind: { allowed: blindAllowed && mode === 'reader', granted: viewer.blindViewGranted },
  };
}

/* ---------- Lini 3 queue (FR-NIL-010) ---------- */

export type QueueStatus = 'belum' | 'draf' | 'siap' | 'dituntaskan' | 'belum_terbit';

export interface QueueRow {
  positionId: string;
  positionName: string;
  unitName: string;
  unitId: string;
  typeName: string;
  typeId: string;
  assessed: number;
  total: number;
  status: QueueStatus;
  lini1Done: boolean;
  tidakSesuai: number;
  recurring: number;
  notAssessedL1: number;
  overdue: boolean;
}

export interface QueueView {
  directorate: { id: string; name: string } | null;
  quarter: Quarter;
  quarters: Quarter[];
  rows: QueueRow[];
}

/**
 * FR-NIL-010 default: the open quarter with the earliest Lini 3 deadline that still has work for
 * the directorate (an overdue quarter comes first); otherwise the next upcoming deadline.
 */
export function defaultQueueQuarter(db: DB, today: ISODate, directorateId?: string): Quarter {
  const open = db.quarters
    .filter(
      (q) =>
        q.lini3OpensOn <= today &&
        db.fiscalYears.find((f) => f.year === q.fiscalYear)?.status !== 'archived',
    )
    .sort((a, b) => a.lini3Deadline.localeCompare(b.lini3Deadline));
  const outstanding = (q: Quarter) =>
    !!directorateId &&
    db.positions.some((p) =>
      quarterRisks(db, p.id, q).some(
        ({ rq }) =>
          db.assessments.find(
            (a) => a.riskQuarterId === rq.id && a.assessorPositionId === directorateId,
          )?.status !== 'final',
      ),
    );
  return (
    open.find((q) => q.lini3Deadline < today && outstanding(q)) ??
    open.find((q) => q.lini3Deadline >= today) ??
    open.at(-1) ??
    db.quarters[0]!
  );
}

export function buildQueue(
  db: DB,
  userId: string,
  quarterId: string | null,
  at: ISODateTime,
): QueueView {
  const today = at.slice(0, 10);
  const lini3 = holdingsOf(db, userId, today).find((h) => h.line === 3);
  const quarter =
    (quarterId && db.quarters.find((q) => q.id === quarterId)) ||
    defaultQueueQuarter(db, today, lini3?.positionId);
  const quarters = db.quarters
    .filter(
      (q) =>
        q.lini3OpensOn <= today &&
        db.fiscalYears.find((f) => f.year === q.fiscalYear)?.status !== 'archived',
    )
    .sort((a, b) => b.fiscalYear - a.fiscalYear || b.number - a.number);
  const holding = holdingsOf(db, userId, today).find((h) => h.line === 3);
  const dir = holding ? db.positions.find((p) => p.id === holding.positionId)! : null;
  const lini1 = db.positions.filter(
    (p) => p.active && db.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1,
  );
  const rows: QueueRow[] = lini1.map((p) => {
    const unit = db.orgUnits.find((u) => u.id === p.orgUnitId)!;
    const type = db.positionTypes.find((t) => t.id === p.positionTypeId)!;
    const reg = db.registers.find(
      (r) => r.positionId === p.id && r.fiscalYear === quarter.fiscalYear,
    );
    const base = {
      positionId: p.id,
      positionName: p.name,
      unitName: unit.name,
      unitId: unit.id,
      typeName: type.name,
      typeId: type.id,
    };
    if (!reg || !isPublishedRegister(reg.status, reg.publishedAt))
      return {
        ...base,
        assessed: 0,
        total: 0,
        status: 'belum_terbit' as const,
        lini1Done: false,
        tidakSesuai: 0,
        recurring: 0,
        notAssessedL1: 0,
        overdue: false,
      };
    const items = quarterRisks(db, p.id, quarter);
    const mine = items.map(({ rq }) =>
      db.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorPositionId === dir?.id),
    );
    const assessed = mine.filter((a) => a?.status === 'final').length;
    const status: QueueStatus =
      items.length > 0 && assessed === items.length
        ? 'dituntaskan'
        : mine.some((a) => a?.status === 'ready')
          ? 'siap'
          : mine.some((a) => a)
            ? 'draf'
            : 'belum';
    const l1 = items.map(({ rq }) =>
      db.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorLine === 1),
    );
    // Attention counts only where this directorate's own result has opened (VIS-9).
    const ownOpened = items.filter(({ rq }) => dir && resultOpened(db, rq.id, dir.id, at));
    return {
      ...base,
      assessed,
      total: items.length,
      status,
      lini1Done:
        items.length > 0 && l1.every((a) => a?.status === 'final' || a?.status === 'not_assessed'),
      tidakSesuai: ownOpened.filter(({ rq }) =>
        openedResults(db, rq.id, at).some((r) => r.result === 'tidak_sesuai'),
      ).length,
      recurring: ownOpened.filter(({ rq }) => rq.recurring).length,
      notAssessedL1: ownOpened.filter(
        ({ rq }) =>
          db.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorLine === 1)?.status ===
          'not_assessed',
      ).length,
      overdue: status !== 'dituntaskan' && today > quarter.lini3Deadline,
    };
  });
  return { directorate: dir ? { id: dir.id, name: dir.name } : null, quarter, quarters, rows };
}

/* ---------- Mutations ---------- */

interface Actor {
  userId: string;
  at: ISODateTime;
  today: ISODate;
  holding: Holding;
}

function actorFor(code: number, assessorPositionId: string): Actor {
  const userId = sessionUser();
  const at = now();
  const today = at.slice(0, 10);
  const res = checkAction(getDb(), userId, code, assessorPositionId, today);
  if (!res.ok) {
    const msg: Record<string, string> = {
      permission: 'Anda tidak memiliki izin untuk tindakan ini.',
      holding: 'Tindakan ini hanya untuk pemegang jabatan penilai.',
      official: 'Tindakan akhir dilakukan oleh Pejabat.',
      filler: 'Hanya Pengisi dan Operator yang ditunjuknya yang dapat menyusun penilaian ini.',
    };
    throw new ApiError('forbidden', msg[res.reason]!);
  }
  return { userId, at, today, holding: res.holding };
}

const audit = (
  d: DB,
  a: Actor,
  action: string,
  type: string,
  id: string,
  before: unknown,
  after: unknown,
) =>
  writeAudit(d, {
    at: a.at,
    actorUserId: a.userId,
    actingAs: a.holding.capacity,
    actingPositionId: a.holding.positionId,
    action,
    entityType: type,
    entityId: id,
    before,
    after,
  });

function contextOf(db: DB, rqId: string) {
  const rq = db.riskQuarters.find((x) => x.id === rqId);
  if (!rq) throw new ApiError('not_found', 'Risiko triwulan tidak ditemukan.');
  const q = db.quarters.find((x) => x.id === rq.quarterId)!;
  const risk = db.risks.find((r) => r.id === rq.registerRiskId)!;
  const reg = db.registers.find((r) => r.id === risk.registerId)!;
  if (db.fiscalYears.find((f) => f.year === q.fiscalYear)?.status === 'archived')
    throw new ApiError(
      'archived',
      'Tahun anggaran ini sudah diarsipkan. Penilaian hanya dapat dibaca.',
    );
  return { rq, q, risk, reg };
}

/** Line of an assessor position (1 = the risk's own position, 3 = a directorate). */
const lineOf = (db: DB, positionId: string): 1 | 3 =>
  db.positionTypes.find(
    (t) => t.id === db.positions.find((p) => p.id === positionId)?.positionTypeId,
  )?.line === 3
    ? 3
    : 1;

function assertWritable(db: DB, rqId: string, assessorPositionId: string, at: ISODateTime) {
  const { q } = contextOf(db, rqId);
  const line = lineOf(db, assessorPositionId);
  if (!windowOpen(q, line, at.slice(0, 10)))
    throw new ApiError(
      'window',
      `Penilaian TW ${QUARTER_ROMAN[q.number - 1]} dibuka mulai ${formatDate(windowOpensOn(q, line))}.`,
    );
  if (line === 3 && !expectedLini3(db, q.id).includes(assessorPositionId))
    throw new ApiError('excluded', 'Direktorat ini dikecualikan dari penilaian triwulan ini.');
  if (assessmentFrozen(db, { riskQuarterId: rqId, assessorLine: line, assessorPositionId }, at))
    throw new ApiError(
      'frozen',
      'Perbandingan risiko ini sudah dibuka; penilaian tidak dapat diubah.',
    );
  return { q, line };
}

export interface CellPatch {
  score?: number | null;
  notRelevant?: boolean;
  notRelevantReason?: string;
  note?: string;
}

function ensureAssessment(
  d: DB,
  rqId: string,
  positionId: string,
  line: 1 | 3,
  q: Quarter,
  at: ISODateTime,
): Assessment {
  let a = d.assessments.find(
    (x) => x.riskQuarterId === rqId && x.assessorPositionId === positionId,
  );
  if (!a) {
    a = {
      id: newId('as'),
      riskQuarterId: rqId,
      assessorPositionId: positionId,
      assessorLine: line,
      status: 'draft',
      score: null,
      predicate: null,
      notRelevant: false,
      notRelevantReason: null,
      note: null,
      scoreBandVersionId: bandVersionFor(d, q),
      finalisedByUserId: null,
      finalisedAt: null,
      lateness: null,
      flags: [],
      updatedAt: at,
    };
    d.assessments.push(a);
    a = d.assessments.at(-1)!;
  }
  return a;
}

export interface FinalisePreview {
  toFinalise: number;
  unscored: number;
  noEvidence: string[];
  missingReason: string[];
}

function finaliseCandidates(
  db: DB,
  lini1PositionId: string,
  quarter: Quarter,
  assessorPositionId: string,
  at: ISODateTime,
) {
  const line = lineOf(db, assessorPositionId);
  const items = quarterRisks(db, lini1PositionId, quarter);
  const rows = items.map(({ risk, rq }) => ({
    risk,
    rq,
    a: db.assessments.find(
      (x) => x.riskQuarterId === rq.id && x.assessorPositionId === assessorPositionId,
    ),
  }));
  const open = rows.filter(
    ({ a, rq }) =>
      !assessmentFrozen(db, { riskQuarterId: rq.id, assessorLine: line, assessorPositionId }, at) &&
      a?.status !== 'final' &&
      a?.status !== 'not_assessed',
  );
  const scored = open.filter(({ a }) => a && (a.score !== null || (line === 1 && a.notRelevant)));
  return { line, rows, open, scored };
}

export function finalisePreview(
  db: DB,
  lini1PositionId: string,
  quarter: Quarter,
  assessorPositionId: string,
  at: ISODateTime,
): FinalisePreview {
  const { line, open, scored } = finaliseCandidates(
    db,
    lini1PositionId,
    quarter,
    assessorPositionId,
    at,
  );
  return {
    toFinalise: scored.length,
    unscored: open.length - scored.length,
    noEvidence:
      line === 1
        ? scored
            .filter(
              ({ a }) =>
                !a!.notRelevant &&
                !db.attachments.some((f) => f.ownerKind === 'assessment' && f.ownerId === a!.id),
            )
            .map(({ risk }) => risk.descriptionSnapshot)
        : [],
    missingReason: scored
      .filter(({ a }) => a!.notRelevant && !a!.notRelevantReason?.trim())
      .map(({ risk }) => risk.descriptionSnapshot),
  };
}

function notifyPositionHolders(
  d: DB,
  positionId: string,
  text: string,
  url: string,
  at: ISODateTime,
  key: string,
  onlyFiller = false,
) {
  for (const o of d.occupancies.filter(
    (x) => x.positionId === positionId && (!onlyFiller || x.isFiller) && !x.endDate,
  ))
    writeNotification(d, {
      userId: o.userId,
      kind: 'ready',
      text,
      targetUrl: url,
      createdAt: at,
      eventKey: `${key}:${o.userId}`,
    });
}

export const assessmentApi = {
  page: (positionId: string, fiscalYear: number, tw: number, blind = false) =>
    call(() => buildAssessment(getDb(), sessionUser(), positionId, fiscalYear, tw, now(), blind)),

  queue: (quarterId: string | null) =>
    call(() => buildQueue(getDb(), sessionUser(), quarterId, now())),

  /** Autosave of the viewer's own cell (FR-NIL-002, 005). Editing a ready row returns it to draft. */
  saveCell: (rqId: string, assessorPositionId: string, patch: CellPatch) =>
    call(() => {
      const line = lineOf(getDb(), assessorPositionId);
      const a = actorFor(line === 1 ? 4 : 8, assessorPositionId);
      const db = getDb();
      const { q } = assertWritable(db, rqId, assessorPositionId, a.at);
      if (
        patch.score !== undefined &&
        patch.score !== null &&
        !optionFor(patch.score, optionsOf(db, bandVersionFor(db, q)))
      )
        throw new ApiError('validation', 'Pilihan penilaian tidak dikenal.');
      if (line === 3 && patch.notRelevant)
        throw new ApiError('validation', '"Belum relevan" tidak tersedia untuk Lini 3.');
      if (line === 1 && patch.note !== undefined)
        throw new ApiError('validation', 'Catatan penilaian hanya untuk Lini 3.');
      const existing = db.assessments.find(
        (x) => x.riskQuarterId === rqId && x.assessorPositionId === assessorPositionId,
      );
      if (existing?.status === 'final')
        throw new ApiError(
          'final',
          'Penilaian ini sudah dituntaskan. Pejabat dapat membukanya kembali.',
        );
      mutateDb((d) => {
        const x = ensureAssessment(d, rqId, assessorPositionId, line, q, a.at);
        const before = {
          score: x.score,
          notRelevant: x.notRelevant,
          notRelevantReason: x.notRelevantReason,
          note: x.note,
        };
        if (patch.score !== undefined) x.score = patch.score;
        if (patch.notRelevant !== undefined) {
          x.notRelevant = patch.notRelevant;
          if (patch.notRelevant) x.score = null;
          else x.notRelevantReason = null;
        }
        if (patch.notRelevantReason !== undefined) x.notRelevantReason = patch.notRelevantReason;
        if (patch.note !== undefined) x.note = patch.note.trim() ? patch.note : null;
        x.predicate = predicateIn(d, q, x.score);
        x.updatedAt = a.at;
        if (x.status === 'ready') x.status = 'draft';
        audit(d, a, 'simpan_draf_penilaian', 'Assessment', x.id, before, patch);
      });
    }),

  addFiles: (rqId: string, assessorPositionId: string, files: NewFile[]) =>
    call(() => {
      const line = lineOf(getDb(), assessorPositionId);
      const a = actorFor(line === 1 ? 4 : 8, assessorPositionId);
      const db = getDb();
      const { q } = assertWritable(db, rqId, assessorPositionId, a.at);
      const existing = db.assessments.find(
        (x) => x.riskQuarterId === rqId && x.assessorPositionId === assessorPositionId,
      );
      if (existing?.status === 'final')
        throw new ApiError(
          'final',
          'Penilaian ini sudah dituntaskan. Pejabat dapat membukanya kembali.',
        );
      const count = existing
        ? db.attachments.filter((f) => f.ownerKind === 'assessment' && f.ownerId === existing.id)
            .length
        : 0;
      if (count + files.length > MAX_FILES)
        throw new ApiError('validation', `Maksimal ${MAX_FILES} berkas per penilaian.`);
      for (const f of files) {
        const p = fileProblem(f.name, f.size);
        if (p) throw new ApiError('validation', `${f.name}: ${p}`);
      }
      const ids: string[] = [];
      mutateDb((d) => {
        const x = ensureAssessment(d, rqId, assessorPositionId, line, q, a.at);
        for (const f of files) {
          const id = newId('att');
          ids.push(id);
          d.attachments.push({
            id,
            ownerKind: 'assessment',
            ownerId: x.id,
            filename: f.name,
            sizeBytes: f.size,
            mimeType: f.mime,
            scanStatus: 'pending',
            // VIS-4: Lini 3 assessment files are confidential by default.
            isConfidential: line === 3 ? f.confidential : false,
            uploadedById: a.userId,
            uploadedAt: a.at,
          });
        }
        x.updatedAt = a.at;
        if (x.status === 'ready') x.status = 'draft';
        audit(d, a, 'lampirkan_bukti_penilaian', 'Assessment', x.id, null, {
          files: files.map((f) => f.name),
        });
      });
      setTimeout(
        () =>
          mutateDb((d) => {
            for (const f of d.attachments)
              if (ids.includes(f.id) && f.scanStatus === 'pending') f.scanStatus = 'clean';
          }),
        2000,
      );
    }),

  removeFile: (attachmentId: string) =>
    call(() => {
      const db = getDb();
      const f = db.attachments.find((x) => x.id === attachmentId && x.ownerKind === 'assessment');
      if (!f) throw new ApiError('not_found', 'Lampiran tidak ditemukan.');
      const x = db.assessments.find((y) => y.id === f.ownerId)!;
      const a = actorFor(x.assessorLine === 1 ? 4 : 8, x.assessorPositionId);
      assertWritable(db, x.riskQuarterId, x.assessorPositionId, a.at);
      if (x.status === 'final') throw new ApiError('final', 'Penilaian ini sudah dituntaskan.');
      mutateDb((d) => {
        d.attachments = d.attachments.filter((y) => y.id !== attachmentId);
        audit(d, a, 'hapus_bukti_penilaian', 'Assessment', x.id, { file: f.filename }, null);
      });
    }),

  /** Operator: scored draft rows become ready; the Pejabat is notified. */
  markReady: (lini1PositionId: string, quarterId: string, assessorPositionId: string) =>
    call<number>(() => {
      const line = lineOf(getDb(), assessorPositionId);
      const a = actorFor(line === 1 ? 4 : 8, assessorPositionId);
      const db = getDb();
      const q = db.quarters.find((x) => x.id === quarterId)!;
      const { scored } = finaliseCandidates(db, lini1PositionId, q, assessorPositionId, a.at);
      const ids = scored.filter(({ a: x }) => x!.status === 'draft').map(({ a: x }) => x!.id);
      if (ids.length === 0)
        throw new ApiError('nothing', 'Tidak ada baris berskor yang perlu ditandai siap.');
      mutateDb((d) => {
        for (const x of d.assessments) if (ids.includes(x.id)) x.status = 'ready';
        const actor = d.users.find((u) => u.id === a.userId)!.fullName;
        const pos = d.positions.find((p) => p.id === lini1PositionId)!;
        notifyPositionHolders(
          d,
          assessorPositionId,
          `${actor} menandai penilaian TW ${QUARTER_ROMAN[q.number - 1]} ${pos.name} siap untuk Anda tuntaskan`,
          `/jabatan/${lini1PositionId}/penilaian/${q.fiscalYear}/${q.number}`,
          a.at,
          `assess-ready:${lini1PositionId}:${q.id}:${assessorPositionId}:${a.at}`,
          true,
        );
        audit(d, a, 'tandai_siap_penilaian', 'Quarter', q.id, null, {
          position: lini1PositionId,
          rows: ids.length,
        });
      });
      return ids.length;
    }),

  /** FR-NIL-003/006: finalises scored rows only; lateness fixed per row; comparisons evaluated. */
  finalise: (lini1PositionId: string, quarterId: string, assessorPositionId: string) =>
    call<FinalisePreview>(() => {
      const line = lineOf(getDb(), assessorPositionId);
      const a = actorFor(line === 1 ? 5 : 9, assessorPositionId);
      const db = getDb();
      const q = db.quarters.find((x) => x.id === quarterId)!;
      if (!windowOpen(q, line, a.today))
        throw new ApiError(
          'window',
          `Penilaian TW ${QUARTER_ROMAN[q.number - 1]} dibuka mulai ${formatDate(windowOpensOn(q, line))}.`,
        );
      const preview = finalisePreview(db, lini1PositionId, q, assessorPositionId, a.at);
      if (preview.missingReason.length)
        throw new ApiError(
          'gaps',
          `Alasan "Belum relevan" wajib diisi untuk ${preview.missingReason.length} risiko.`,
          preview.missingReason,
        );
      if (preview.toFinalise === 0)
        throw new ApiError('nothing', 'Belum ada risiko berskor yang dapat dituntaskan.');
      const { scored } = finaliseCandidates(db, lini1PositionId, q, assessorPositionId, a.at);
      const rqIds = scored.map(({ rq }) => rq.id);
      mutateDb((d) => {
        const version = bandVersionFor(d, q);
        for (const { a: s } of scored) {
          const x = d.assessments.find((y) => y.id === s!.id)!;
          const hasFile = d.attachments.some(
            (f) => f.ownerKind === 'assessment' && f.ownerId === x.id,
          );
          Object.assign(x, {
            status: 'final',
            predicate: predicateIn(d, q, x.score),
            scoreBandVersionId: version,
            finalisedByUserId: a.userId,
            finalisedAt: a.at,
            lateness: finaliseLateness(d, q, line, a.at),
            flags: line === 1 && !x.notRelevant && !hasFile ? ['no_evidence'] : [],
            updatedAt: a.at,
          });
        }
        audit(d, a, 'tuntaskan_penilaian', 'Quarter', q.id, null, {
          position: lini1PositionId,
          assessor: assessorPositionId,
          rows: scored.length,
        });
        runComparisons(d, a.at, rqIds);
      });
      return preview;
    }),

  /** FR-NIL-004/006: per row, while its comparison (Lini 3: own result) has not opened. */
  reopen: (assessmentId: string) =>
    call(() => {
      const db = getDb();
      const x = db.assessments.find((y) => y.id === assessmentId);
      if (!x) throw new ApiError('not_found', 'Penilaian tidak ditemukan.');
      const a = actorFor(x.assessorLine === 1 ? 5 : 9, x.assessorPositionId);
      contextOf(db, x.riskQuarterId);
      if (x.status !== 'final')
        throw new ApiError('validation', 'Penilaian ini belum dituntaskan.');
      if (assessmentFrozen(db, x, a.at))
        throw new ApiError(
          'frozen',
          'Perbandingan risiko ini sudah dibuka; penilaian tidak dapat dibuka kembali.',
        );
      mutateDb((d) => {
        const y = d.assessments.find((z) => z.id === assessmentId)!;
        audit(
          d,
          a,
          'buka_kembali_penilaian',
          'Assessment',
          y.id,
          { status: 'final', lateness: y.lateness },
          { status: 'draft' },
        );
        Object.assign(y, {
          status: 'draft',
          finalisedAt: null,
          finalisedByUserId: null,
          lateness: null,
          flags: [],
          updatedAt: a.at,
        });
      });
    }),

  /** FR-NIL-008: Lini 1 drafts an explanation per comparison result. */
  saveExplanation: (resultId: string, patch: { reason?: string; plan?: string }) =>
    call(() => {
      const db = getDb();
      const r = db.results.find((x) => x.id === resultId);
      if (!r) throw new ApiError('not_found', 'Hasil perbandingan tidak ditemukan.');
      const { reg } = contextOf(db, r.riskQuarterId);
      const a = actorFor(4, reg.positionId);
      if (r.explanationStatus === 'sent')
        throw new ApiError('sent', 'Penjelasan yang sudah dikirim tidak dapat diubah.');
      if (r.result !== 'tidak_sesuai')
        throw new ApiError('validation', 'Penjelasan hanya untuk hasil Tidak Sesuai.');
      mutateDb((d) => {
        const x = d.results.find((y) => y.id === resultId)!;
        const before = { reason: x.explanationReason, plan: x.explanationPlan };
        if (patch.reason !== undefined) x.explanationReason = patch.reason;
        if (patch.plan !== undefined) x.explanationPlan = patch.plan;
        if (x.explanationStatus === 'ready')
          x.explanationStatus = x.explanationRequired ? 'pending' : 'optional';
        audit(d, a, 'ubah_draf_penjelasan', 'ComparisonResult', x.id, before, patch);
      });
    }),

  markExplanationsReady: (lini1PositionId: string, resultIds: string[]) =>
    call(() => {
      const a = actorFor(4, lini1PositionId);
      const db = getDb();
      const results = db.results.filter(
        (r) => resultIds.includes(r.id) && r.explanationStatus !== 'sent',
      );
      const missing = results.filter(
        (r) =>
          r.explanationRequired && (!r.explanationReason?.trim() || !r.explanationPlan?.trim()),
      );
      if (missing.length)
        throw new ApiError(
          'gaps',
          'Alasan/Kendala dan Rencana Tindak Lanjut wajib diisi.',
          missing.map((r) => r.id),
        );
      mutateDb((d) => {
        for (const x of d.results)
          if (results.some((r) => r.id === x.id)) x.explanationStatus = 'ready';
        audit(d, a, 'tandai_siap_penjelasan', 'ComparisonResult', resultIds.join(','), null, {
          count: results.length,
        });
      });
    }),

  /** FR-NIL-008: Pejabat sends; immutable afterwards (INV-23); lateness fixed; Lini 2/3 notified. */
  sendExplanations: (lini1PositionId: string, resultIds: string[]) =>
    call<number>(() => {
      const a = actorFor(5, lini1PositionId);
      const db = getDb();
      const results = db.results.filter(
        (r) =>
          resultIds.includes(r.id) && r.explanationStatus !== 'sent' && r.result === 'tidak_sesuai',
      );
      if (results.length === 0)
        throw new ApiError('nothing', 'Tidak ada penjelasan yang perlu dikirim.');
      const missing = results.filter(
        (r) =>
          (r.explanationRequired || r.explanationReason || r.explanationPlan) &&
          (!r.explanationReason?.trim() || !r.explanationPlan?.trim()),
      );
      if (missing.length)
        throw new ApiError(
          'gaps',
          'Alasan/Kendala dan Rencana Tindak Lanjut wajib diisi.',
          missing.map((r) => r.id),
        );
      mutateDb((d) => {
        for (const r of results) {
          const x = d.results.find((y) => y.id === r.id)!;
          const rq = d.riskQuarters.find((y) => y.id === x.riskQuarterId)!;
          const q = d.quarters.find((y) => y.id === rq.quarterId)!;
          const risk = d.risks.find((y) => y.id === rq.registerRiskId)!;
          Object.assign(x, {
            explanationStatus: 'sent',
            explanationSentAt: a.at,
            explanationSentByUserId: a.userId,
            explanationLateness: explanationLateness(d, x, a.at, q.fiscalYear),
          });
          const pos = d.positions.find((p) => p.id === lini1PositionId)!;
          const ownOpened = d.results
            .filter((y) => y.riskQuarterId === rq.id)
            .map((y) => y.lini3PositionId);
          const recipients = new Set([
            ...holdersOf(d, lini2For(d, lini1PositionId, q.id), a.today),
            ...holdersOf(d, ownOpened, a.today),
          ]);
          for (const userId of recipients)
            writeNotification(d, {
              userId,
              kind: 'explanation_sent',
              text: `${pos.name} mengirim penjelasan untuk '${risk.descriptionSnapshot}'`,
              targetUrl: `/jabatan/${lini1PositionId}/penilaian/${q.fiscalYear}/${q.number}`,
              createdAt: a.at,
              eventKey: `expl-sent:${x.id}`,
            });
          audit(
            d,
            a,
            'kirim_penjelasan',
            'ComparisonResult',
            x.id,
            { status: r.explanationStatus },
            { status: 'sent', lateness: x.explanationLateness },
          );
        }
      });
      return results.length;
    }),

  /** FR-NIL-012: permission 24; every view is audit-logged. */
  logBlindView: (positionId: string, quarterId: string) =>
    call(() => {
      const userId = sessionUser();
      const at = now();
      if (!hasPermission(getDb(), userId, 24, at.slice(0, 10)))
        throw new ApiError('forbidden', 'Anda tidak memiliki izin untuk tindakan ini.');
      mutateDb((d) =>
        writeAudit(d, {
          at,
          actorUserId: userId,
          actingAs: 'superadmin',
          actingPositionId: null,
          action: 'lihat_penilaian_sebelum_dibuka',
          entityType: 'Quarter',
          entityId: quarterId,
          before: null,
          after: { position: positionId },
        }),
      );
    }),
};
