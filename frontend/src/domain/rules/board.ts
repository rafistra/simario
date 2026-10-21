// Board and thread rules — PRD §6 (FR-PPN-*), RB-PPN-004, §1.5 participation, VIS-1/2/3/9.

import type { DB } from '@/test/fake/db';
import type {
  Comment,
  ComparisonResult,
  ISODate,
  ISODateTime,
  Predicate,
  Quarter,
  RegisterRisk,
  RiskQuarter,
} from '../types';
import { holdingsOf, participationHolding, type Holding } from './access';
import { assessedInQuarter } from './register';
import { isLateDirectorate, type Viewer } from './visibility';

export const EDIT_WINDOW_MINUTES = 15;
export const MAX_COMMENT_LENGTH = 5000;
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const QUOTA_BYTES = 1024 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'mp4'];

const qKey = (q: Pick<Quarter, 'fiscalYear' | 'number'>) => q.fiscalYear * 10 + q.number;

/**
 * The quarter a comment posted now belongs to (§2.8 Comment, S-04): the quarter of the thread's
 * own fiscal year containing today; after year-end, TW IV. Null before the fiscal year starts.
 */
export function postingQuarter(db: DB, fiscalYear: number, today: ISODate): Quarter | null {
  const qs = db.quarters
    .filter((q) => q.fiscalYear === fiscalYear)
    .sort((a, b) => a.number - b.number);
  if (qs.length === 0 || today < qs[0]!.startsOn) return null;
  return qs.find((q) => q.startsOn <= today && today <= q.endsOn) ?? qs.at(-1)!;
}

/** Results whose opening moment has passed on the simulated clock. */
export function openedResults(db: DB, riskQuarterId: string, at: ISODateTime): ComparisonResult[] {
  return db.results.filter((r) => r.riskQuarterId === riskQuarterId && r.openedAt <= at);
}

/** Lini 3 positions expected to assess a quarter (not excluded). */
export function expectedLini3(db: DB, quarterId: string): string[] {
  return db.quarterAssessors
    .filter((a) => a.quarterId === quarterId && !a.excluded)
    .map((a) => a.positionId);
}

/**
 * RB-PPN-004: earlier quarters of the same fiscal year that still have an open comparison (not yet
 * fully opened) or a pending explanation for this risk — offered as "Terkait TW [n]".
 */
export function relatedQuarters(
  db: DB,
  risk: RegisterRisk,
  posting: Quarter,
  at: ISODateTime,
): Quarter[] {
  return db.quarters
    .filter((q) => q.fiscalYear === posting.fiscalYear && q.number < posting.number)
    .filter((q) => {
      const rq = db.riskQuarters.find((x) => x.registerRiskId === risk.id && x.quarterId === q.id);
      if (!rq) return false;
      const opened = openedResults(db, rq.id, at);
      if (opened.length === 0) return false;
      const partial = opened.length < expectedLini3(db, q.id).length;
      const pending = opened.some(
        (r) => r.explanationStatus === 'pending' || r.explanationStatus === 'ready',
      );
      return partial || pending;
    })
    .sort((a, b) => a.number - b.number);
}

const liveStep = (c: Comment) => c.isStep && c.authorLine === 1 && !c.withdrawnAt;

/** FR-PPN-004/009: a Langkah from Lini 1 on the risk or any of its mitigations in the quarter. */
export function hasLangkah(db: DB, riskId: string, quarterId: string): boolean {
  return db.comments.some(
    (c) => c.registerRiskId === riskId && c.quarterId === quarterId && liveStep(c),
  );
}

/** FR-PPN-009: "Belum ada langkah triwulan ini" — assessed in the quarter, no Langkah. */
export function isQuiet(db: DB, risk: RegisterRisk, quarter: Quarter | null): boolean {
  if (!quarter) return false;
  return assessedInQuarter(db, risk, quarter) && !hasLangkah(db, risk.id, quarter.id);
}

export interface OpenedChip {
  positionId: string;
  label: string;
  line: 1 | 3;
  predicate: Predicate | null;
  /** Lini 3 only. */
  result?: ComparisonResult['result'];
}

export interface LatestOpened {
  quarter: Quarter;
  riskQuarter: RiskQuarter;
  /** VIS-9: the viewer is a late directorate for this risk-quarter — nothing is shown. */
  hidden: boolean;
  chips: OpenedChip[];
  tidakSesuai: boolean;
  recurring: boolean;
}

/** The latest quarter of the risk with at least one opened result, as the viewer may see it. */
export function latestOpened(
  db: DB,
  viewer: Viewer,
  risk: RegisterRisk,
  at: ISODateTime,
): LatestOpened | null {
  const candidates = db.riskQuarters
    .filter((rq) => rq.registerRiskId === risk.id)
    .map((rq) => ({ rq, q: db.quarters.find((q) => q.id === rq.quarterId)! }))
    .filter(({ rq }) => openedResults(db, rq.id, at).length > 0)
    .sort((a, b) => qKey(b.q) - qKey(a.q));
  const top = candidates[0];
  if (!top) return null;
  const opened = openedResults(db, top.rq.id, at);
  const openedSet = new Set(opened.map((r) => r.lini3PositionId));
  const hidden = isLateDirectorate(viewer, openedSet, expectedLini3(db, top.q.id));
  const lini1 = db.assessments.find((a) => a.riskQuarterId === top.rq.id && a.assessorLine === 1);
  const chips: OpenedChip[] = hidden
    ? []
    : [
        {
          positionId: lini1?.assessorPositionId ?? '',
          label: 'L1',
          line: 1,
          predicate: lini1?.status === 'final' && !lini1.notRelevant ? lini1.predicate : null,
        },
        ...opened.map<OpenedChip>((r) => {
          const a = db.assessments.find(
            (x) => x.riskQuarterId === top.rq.id && x.assessorPositionId === r.lini3PositionId,
          );
          const p = db.positions.find((x) => x.id === r.lini3PositionId);
          return {
            positionId: r.lini3PositionId,
            label: p?.shortName ?? p?.code ?? '',
            line: 3,
            predicate: a?.predicate ?? null,
            result: r.result,
          };
        }),
      ];
  return {
    quarter: top.q,
    riskQuarter: top.rq,
    hidden,
    chips,
    tidakSesuai: !hidden && opened.some((r) => r.result === 'tidak_sesuai'),
    recurring: !hidden && top.rq.recurring,
  };
}

export interface Participant {
  userId: string;
  name: string;
  holding: Holding;
  positionName: string;
}

/**
 * Mention picker (FR-PPN-007): participants of this position's threads for the quarter (§1.5),
 * excluding the viewer.
 */
export function threadParticipants(
  db: DB,
  lini1PositionId: string,
  quarterId: string,
  today: ISODate,
  exceptUserId?: string,
): Participant[] {
  const out: Participant[] = [];
  for (const u of db.users) {
    if (!u.active || u.id === exceptUserId) continue;
    if (!holdingsOf(db, u.id, today).length) continue;
    const holding = participationHolding(db, u.id, lini1PositionId, quarterId, today);
    if (!holding) continue;
    out.push({
      userId: u.id,
      name: u.fullName,
      holding,
      positionName: db.positions.find((p) => p.id === holding.positionId)?.name ?? '',
    });
  }
  return out.sort((a, b) => a.holding.line - b.holding.line || a.name.localeCompare(b.name));
}

/** INV-19: the author may edit within 15 minutes of posting. */
export function canEditComment(c: Comment, userId: string, at: ISODateTime): boolean {
  if (c.authorUserId !== userId || c.withdrawnAt) return false;
  const minutes =
    (new Date(`${at}:00Z`).getTime() - new Date(`${c.createdAt}:00Z`).getTime()) / 60_000;
  return minutes <= EDIT_WINDOW_MINUTES;
}

/** Holders (Pejabat and Operators) of the position are always subscribed and cannot mute. */
export function isAlwaysSubscribed(
  db: DB,
  userId: string,
  positionId: string,
  today: ISODate,
): boolean {
  return holdingsOf(db, userId, today).some((h) => h.positionId === positionId);
}

export function isFollowing(
  db: DB,
  userId: string,
  riskId: string,
  positionId: string,
  today: ISODate,
): boolean {
  if (isAlwaysSubscribed(db, userId, positionId, today)) return true;
  const sub = db.subscriptions.find((s) => s.userId === userId && s.registerRiskId === riskId);
  return !!sub && !sub.muted;
}

/** Last activity on a risk thread (risk or mitigation comments). */
export function lastActivity(db: DB, riskId: string): ISODateTime | null {
  let last: ISODateTime | null = null;
  for (const c of db.comments)
    if (c.registerRiskId === riskId && (!last || c.createdAt > last)) last = c.createdAt;
  return last;
}

/** Storage used by attachments on a position's threads and assessments in a fiscal year (NFR-012). */
export function storageUsed(db: DB, positionId: string, fiscalYear: number): number {
  const reg = db.registers.find((r) => r.positionId === positionId && r.fiscalYear === fiscalYear);
  if (!reg) return 0;
  const riskIds = new Set(db.risks.filter((r) => r.registerId === reg.id).map((r) => r.id));
  const commentIds = new Set(
    db.comments.filter((c) => riskIds.has(c.registerRiskId)).map((c) => c.id),
  );
  const rqIds = new Set(
    db.riskQuarters.filter((rq) => riskIds.has(rq.registerRiskId)).map((rq) => rq.id),
  );
  const assessmentIds = new Set(
    db.assessments.filter((a) => rqIds.has(a.riskQuarterId)).map((a) => a.id),
  );
  return db.attachments
    .filter((a) =>
      a.ownerKind === 'comment' ? commentIds.has(a.ownerId) : assessmentIds.has(a.ownerId),
    )
    .reduce((n, a) => n + a.sizeBytes, 0);
}

export function fileProblem(name: string, size: number): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext))
    return `Format ${ext ? `.${ext}` : 'berkas'} tidak didukung. Gunakan PDF, DOCX, XLSX, PNG, JPG, atau MP4.`;
  if (size > MAX_FILE_BYTES) return 'Ukuran berkas melebihi 20 MB.';
  return null;
}
