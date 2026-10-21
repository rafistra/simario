// Quarterly assessment rules — PRD §2.5, ch. 7 (FR-NIL-*), RB-NIL-*, INV-16/18/23.
// Pure functions over a DB draft; the scheduler and the repository call them.

import type { DB } from '@/test/fake/db';
import { addDays, latenessAt, QUARTER_ROMAN } from '../calendar';
import { optionFor, predicateFor, sortOptions } from '../scoreBands';
import type {
  Assessment,
  ComparisonResult,
  ComparisonStatus,
  ISODate,
  ISODateTime,
  Predicate,
  Quarter,
  RegisterRisk,
  RiskQuarter,
  ScoreOption,
} from '../types';
import { assignedLini2, holdingsOf } from './access';
import { expectedLini3, openedResults } from './board';
import { compareAssessments, explanationDueOn } from './comparison';
import { assessedInQuarter } from './register';

/** §2.5: the assessment window opens on `*_opens_on` and has no closing date of its own. */
export function windowOpen(q: Quarter, line: 1 | 3, today: ISODate): boolean {
  return today >= (line === 1 ? q.lini1OpensOn : q.lini3OpensOn);
}

export function windowOpensOn(q: Quarter, line: 1 | 3): ISODate {
  return line === 1 ? q.lini1OpensOn : q.lini3OpensOn;
}

/** The band version of a quarter: fixed when its first window opened, else the active one. */
export function bandVersionFor(db: DB, q: Quarter): string | null {
  return (
    q.scoreBandVersionId ?? db.scoreBandVersions.find((v) => v.status === 'active')?.id ?? null
  );
}

export function predicateIn(db: DB, q: Quarter, score: number | null): Predicate | null {
  if (score === null) return null;
  const version = bandVersionFor(db, q);
  return predicateFor(
    score,
    db.scoreBands.filter((b) => b.versionId === version),
  );
}

/** The statements of a band version in dropdown order (PRD v2.8). */
export function optionsOf(db: DB, versionId: string | null): ScoreOption[] {
  return sortOptions(db.scoreOptions.filter((o) => o.versionId === versionId));
}

export function optionLabelOf(
  db: DB,
  versionId: string | null,
  score: number | null,
): string | null {
  if (score === null) return null;
  return optionFor(score, optionsOf(db, versionId))?.label ?? null;
}

/** An assessment as users may see it: the statement replaces the number (PRD v2.8). */
export type AssessmentDisplay = Omit<Assessment, 'score'> & { optionLabel: string | null };

export function toDisplay(db: DB, a: Assessment): AssessmentDisplay {
  const { score, ...rest } = a;
  return { ...rest, optionLabel: optionLabelOf(db, a.scoreBandVersionId, score) };
}

/** The published risks of a position assessed in a quarter (RB-REG-006), with their RiskQuarter. */
export function quarterRisks(
  db: DB,
  positionId: string,
  q: Quarter,
): { risk: RegisterRisk; rq: RiskQuarter }[] {
  const reg = db.registers.find(
    (r) => r.positionId === positionId && r.fiscalYear === q.fiscalYear,
  );
  if (!reg) return [];
  return db.risks
    .filter((r) => r.registerId === reg.id && assessedInQuarter(db, r, q))
    .map((risk) => ({
      risk,
      rq: db.riskQuarters.find((x) => x.registerRiskId === risk.id && x.quarterId === q.id)!,
    }))
    .filter((x) => x.rq);
}

/** Has the result of this Lini 3 position for this risk-quarter opened (on the clock)? */
export function resultOpened(
  db: DB,
  rqId: string,
  lini3PositionId: string,
  at: ISODateTime,
): boolean {
  return openedResults(db, rqId, at).some((r) => r.lini3PositionId === lini3PositionId);
}

/**
 * INV-18: Lini 1 is frozen once any result of the risk opened; a Lini 3 position once its own
 * result opened.
 */
export function assessmentFrozen(
  db: DB,
  a: Pick<Assessment, 'riskQuarterId' | 'assessorLine' | 'assessorPositionId'>,
  at: ISODateTime,
): boolean {
  if (a.assessorLine === 1) return openedResults(db, a.riskQuarterId, at).length > 0;
  return resultOpened(db, a.riskQuarterId, a.assessorPositionId, at);
}

export function comparisonStatusAt(db: DB, rq: RiskQuarter, at: ISODateTime): ComparisonStatus {
  const opened = openedResults(db, rq.id, at);
  if (opened.length === 0) return 'waiting';
  const expected = expectedLini3(db, rq.quarterId);
  return expected.every((p) => opened.some((r) => r.lini3PositionId === p)) ? 'open' : 'partial';
}

const toleranceOf = (db: DB, year: number) =>
  db.fiscalYears.find((f) => f.year === year)?.toleranceDays ?? 7;

export function finaliseLateness(db: DB, q: Quarter, line: 1 | 3, at: ISODateTime) {
  return latenessAt(
    at,
    line === 1 ? q.lini1Deadline : q.lini3Deadline,
    toleranceOf(db, q.fiscalYear),
  );
}

/** Lateness of an explanation fixed at send (FR-NIL-008). */
export function explanationLateness(db: DB, r: ComparisonResult, at: ISODateTime, year: number) {
  return r.explanationDueOn ? latenessAt(at, r.explanationDueOn, toleranceOf(db, year)) : null;
}

/** Display state of a pending explanation: "belum dikirim" until due, then late. */
export function pendingExplanationLateness(
  db: DB,
  r: ComparisonResult,
  today: ISODate,
  year: number,
) {
  if (!r.explanationDueOn || today <= r.explanationDueOn) return null;
  return today <= addDays(r.explanationDueOn, toleranceOf(db, year))
    ? 'terlambat'
    : 'sangat_terlambat';
}

/** Lini 3 position has not finalised and the Lini 3 deadline has passed (§2.5 "Lini 3 marked Terlambat"). */
export function lini3Overdue(q: Quarter, a: Assessment | undefined, today: ISODate): boolean {
  return (!a || a.status !== 'final') && today > q.lini3Deadline;
}

export interface OpeningEvent {
  rqId: string;
  positionId: string;
  quarterId: string;
  opened: ComparisonResult[];
}

/**
 * §2.5 "When a comparison opens", evaluated for one risk-quarter at `at`. Mutates the draft:
 * opens results, closes an unfinalised Lini 1 as "Tidak dinilai Lini 1", updates the RiskQuarter.
 * Returns the newly opened results (empty when nothing changed). Idempotent.
 */
export function evaluateOpening(d: DB, rq: RiskQuarter, at: ISODateTime): ComparisonResult[] {
  const q = d.quarters.find((x) => x.id === rq.quarterId)!;
  const fy = d.fiscalYears.find((f) => f.year === q.fiscalYear);
  if (fy?.status === 'archived') return [];
  const today = at.slice(0, 10);
  const expected = expectedLini3(d, q.id);
  const existing = new Set(
    d.results.filter((r) => r.riskQuarterId === rq.id).map((r) => r.lini3PositionId),
  );
  const assessments = d.assessments.filter((a) => a.riskQuarterId === rq.id);
  let l1 = assessments.find((a) => a.assessorLine === 1);
  const finals = expected
    .map((p) => assessments.find((a) => a.assessorPositionId === p))
    .filter((a): a is Assessment => !!a && a.status === 'final');
  const allFinal =
    l1?.status === 'final' && finals.length === expected.length && expected.length > 0;
  const deadlinePassed = today > q.lini3Deadline;
  if (!allFinal && !(deadlinePassed && finals.length > 0)) return [];
  const toOpen = finals.filter((a) => !existing.has(a.assessorPositionId));
  if (toOpen.length === 0) return [];

  // First opening closes an unfinalised Lini 1 as "Tidak dinilai Lini 1" (§2.5).
  if (existing.size === 0 && (!l1 || l1.status !== 'final')) {
    const reg = d.registers.find(
      (r) => r.id === d.risks.find((x) => x.id === rq.registerRiskId)!.registerId,
    )!;
    if (!l1) {
      l1 = {
        id: `as-${rq.id}-${reg.positionId}`,
        riskQuarterId: rq.id,
        assessorPositionId: reg.positionId,
        assessorLine: 1,
        status: 'not_assessed',
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
      d.assessments.push(l1);
    } else
      Object.assign(l1, { status: 'not_assessed', score: null, predicate: null, updatedAt: at });
  }

  const opened: ComparisonResult[] = [];
  for (const a of toOpen) {
    const outcome = compareAssessments(l1, a);
    const r: ComparisonResult = {
      id: `cr-${rq.id}-${a.assessorPositionId}`,
      riskQuarterId: rq.id,
      lini3PositionId: a.assessorPositionId,
      openedAt: at,
      ...outcome,
      explanationDueOn:
        outcome.result === 'tidak_sesuai' ? explanationDueOn(at, q.explanationWorkdays) : null,
      explanationReason: null,
      explanationPlan: null,
      explanationSentAt: null,
      explanationSentByUserId: null,
      explanationLateness: null,
    };
    d.results.push(r);
    opened.push(r);
  }
  const live = d.riskQuarters.find((x) => x.id === rq.id)!;
  live.firstOpenedAt ??= at;
  live.comparisonStatus = expected.every(
    (p) => existing.has(p) || toOpen.some((a) => a.assessorPositionId === p),
  )
    ? 'open'
    : 'partial';
  return opened;
}

/** The RiskQuarter of the same lineage in the previous quarter (crossing fiscal years). */
export function previousRiskQuarter(db: DB, rq: RiskQuarter): RiskQuarter | undefined {
  const q = db.quarters.find((x) => x.id === rq.quarterId)!;
  const prevKey =
    q.number === 1 ? { year: q.fiscalYear - 1, n: 4 } : { year: q.fiscalYear, n: q.number - 1 };
  const prevQ = db.quarters.find((x) => x.fiscalYear === prevKey.year && x.number === prevKey.n);
  if (!prevQ) return undefined;
  const lineage = db.risks.find((r) => r.id === rq.registerRiskId)?.lineageId;
  const riskIds = new Set(db.risks.filter((r) => r.lineageId === lineage).map((r) => r.id));
  return db.riskQuarters.find((x) => x.quarterId === prevQ.id && riskIds.has(x.registerRiskId));
}

const kurangOpened = (db: DB, rqId: string) =>
  db.results.some(
    (r) =>
      r.riskQuarterId === rqId &&
      db.assessments.find(
        (a) => a.riskQuarterId === rqId && a.assessorPositionId === r.lini3PositionId,
      )?.predicate === 'kurang',
  );

/** FR-NIL-011: Lini 3 Kurang Terkendali in this quarter and the previous one (any directorate, by lineage). */
export function isRecurring(db: DB, rq: RiskQuarter): boolean {
  const prev = previousRiskQuarter(db, rq);
  return !!prev && kurangOpened(db, rq.id) && kurangOpened(db, prev.id);
}

/** Holders of the given positions on `today`. */
export function holdersOf(db: DB, positionIds: string[], today: ISODate): string[] {
  return db.users
    .filter(
      (u) =>
        u.active && holdingsOf(db, u.id, today).some((h) => positionIds.includes(h.positionId)),
    )
    .map((u) => u.id);
}

export function lini2For(db: DB, positionId: string, quarterId: string): string[] {
  return assignedLini2(db, positionId, quarterId);
}

export const twLabel = (q: Pick<Quarter, 'number'>) => `TW ${QUARTER_ROMAN[q.number - 1]}`;
