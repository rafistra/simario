// Board and thread read models (FR-PPN-001, 002). Visibility (VIS-1/2/3/6/9) is applied here, so
// pages only receive what the viewer may see (CLAUDE.md §6).

import { quarterLabel } from '@/domain/calendar';
import { participationHolding, type Holding } from '@/domain/rules/access';
import {
  canEditComment,
  expectedLini3,
  isAlwaysSubscribed,
  isFollowing,
  isQuiet,
  lastActivity,
  latestOpened,
  openedResults,
  postingQuarter,
  relatedQuarters,
  storageUsed,
  QUOTA_BYTES,
  type LatestOpened,
} from '@/domain/rules/board';
import { optionLabelOf } from '@/domain/rules/assessment';
import { inactiveLabel, registerStages } from '@/domain/rules/register';
import {
  canSeeAssessment,
  canSeeAttachment,
  viewerFor,
  type Viewer,
} from '@/domain/rules/visibility';
import type {
  Attachment,
  Capacity,
  ComparisonStatus,
  ISODateTime,
  Line,
  Predicate,
  Quarter,
  RegisterRisk,
  RegisterStageDeclaration,
  RiskType,
  Stage,
} from '@/domain/types';
import { RISK_TYPES } from '@/domain/types';
import { formatDateTime } from '@/lib/format';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { assertCanRead } from '../local/actor';
import { ApiError, call } from '../local/call';
import { getDb } from '../local/store';

export type BoardMarker =
  'belum-langkah' | 'tidak-sesuai' | 'berulang' | 'tanpa-mitigasi' | 'nonaktif';

export interface BoardRow {
  risk: RegisterRisk;
  mitigations: number;
  counts: Record<Line, number>;
  lastActivity: ISODateTime | null;
  unseen: boolean;
  opened: LatestOpened | null;
  markers: BoardMarker[];
  inactiveLabel: string | null;
}

export interface BoardGroup {
  stage: Stage;
  index: number;
  types: { riskType: RiskType; rows: BoardRow[]; declaration: RegisterStageDeclaration | null }[];
  notRelevant: RegisterStageDeclaration | null;
}

export interface BoardView {
  published: boolean;
  archived: boolean;
  currentQuarter: Quarter | null;
  groups: BoardGroup[];
  total: number;
}

function viewerNow(): { userId: string; at: ISODateTime; today: string } {
  const userId = useSession.getState().userId;
  if (!userId) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  const at = now();
  return { userId, at, today: at.slice(0, 10) };
}

const isPublished = (r: { status: string }) => r.status === 'active' || r.status === 'inactive';

export function buildBoard(
  db: DB,
  userId: string,
  positionId: string,
  fiscalYear: number,
  at: ISODateTime,
): BoardView {
  const today = at.slice(0, 10);
  assertCanRead(db, userId, positionId, today, fiscalYear);
  const viewer = viewerFor(db, userId, today);
  const register = db.registers.find(
    (r) => r.positionId === positionId && r.fiscalYear === fiscalYear,
  );
  const fy = db.fiscalYears.find((f) => f.year === fiscalYear);
  const archived = fy?.status === 'archived';
  const published =
    !!register &&
    (register.status === 'published' || register.status === 'archived' || !!register.publishedAt);
  const currentQuarter = postingQuarter(db, fiscalYear, today);
  if (!register || !published)
    return { published: false, archived, currentQuarter, groups: [], total: 0 };

  const risks = db.risks.filter((r) => r.registerId === register.id && isPublished(r));
  const rows = new Map<string, BoardRow>();
  for (const risk of risks) {
    const comments = db.comments.filter((c) => c.registerRiskId === risk.id && !c.withdrawnAt);
    const counts: Record<Line, number> = { 1: 0, 2: 0, 3: 0 };
    for (const c of comments) counts[c.authorLine]++;
    const last = lastActivity(db, risk.id);
    const lastOther = db.comments
      .filter((c) => c.registerRiskId === risk.id && c.authorUserId !== userId)
      .reduce<string | null>((m, c) => (!m || c.createdAt > m ? c.createdAt : m), null);
    const seen = db.threadViews.find(
      (v) => v.userId === userId && v.registerRiskId === risk.id,
    )?.lastSeenAt;
    const opened = latestOpened(db, viewer, risk, at);
    const markers: BoardMarker[] = [];
    if (isQuiet(db, risk, currentQuarter)) markers.push('belum-langkah');
    if (opened?.tidakSesuai) markers.push('tidak-sesuai');
    if (opened?.recurring) markers.push('berulang');
    if (risk.flags.includes('no_mitigation')) markers.push('tanpa-mitigasi');
    if (risk.status === 'inactive') markers.push('nonaktif');
    rows.set(risk.id, {
      risk,
      mitigations: db.mitigations.filter(
        (m) => m.registerRiskId === risk.id && m.status === 'active',
      ).length,
      counts,
      lastActivity: last,
      unseen: !!lastOther && (!seen || lastOther > seen),
      opened,
      markers,
      inactiveLabel: risk.status === 'inactive' ? inactiveLabel(db, risk) : null,
    });
  }

  const stages = registerStages(db, register);
  const active = stages.filter((s) => s.active);
  const groups: BoardGroup[] = stages.map((stage) => {
    const decl = (rt: RiskType | null) =>
      db.declarations.find(
        (d) => d.registerId === register.id && d.stageId === stage.id && d.riskType === rt,
      ) ?? null;
    return {
      stage,
      index: active.indexOf(stage) + 1,
      notRelevant: decl(null),
      types: RISK_TYPES.map((riskType) => ({
        riskType,
        declaration: decl(riskType),
        rows: risks
          .filter((r) => r.stageId === stage.id && r.riskType === riskType)
          .sort(
            (a, b) =>
              Number(a.status === 'inactive') - Number(b.status === 'inactive') ||
              Number(a.isCustom) - Number(b.isCustom) ||
              a.order - b.order,
          )
          .map((r) => rows.get(r.id)!),
      })),
    };
  });
  return {
    published: true,
    archived,
    currentQuarter,
    groups: groups.filter(
      (g) => g.notRelevant || g.types.some((t) => t.rows.length || t.declaration),
    ),
    total: risks.length,
  };
}

/* ---------- Thread ---------- */

export interface ThreadAttachment {
  attachment: Attachment;
}

export interface ThreadComment {
  id: string;
  authorUserId: string;
  authorName: string;
  line: Line;
  capacity: Capacity;
  positionName: string;
  createdAt: ISODateTime;
  edited: boolean;
  isStep: boolean;
  /** Null when withdrawn (VIS-6). */
  body: string | null;
  withdrawnText: string | null;
  attachments: ThreadAttachment[];
  confidentialHidden: number;
  canEdit: boolean;
  canWithdraw: boolean;
  quarterId: string;
  isOwn: boolean;
}

export interface QuarterGroup {
  quarter: Quarter;
  comments: ThreadComment[];
  steps: number;
  /** System events shown dimmed at the top of the quarter. */
  events: { text: string; at: ISODateTime }[];
}

export interface MitigationThread {
  id: string;
  description: string;
  inactive: boolean;
  isCustom: boolean;
  quarters: QuarterGroup[];
  count: number;
  steps: number;
  lastActivity: ISODateTime | null;
}

export interface AssessmentCell {
  label: string;
  positionName: string;
  line: 1 | 3;
  optionLabel: string | null;
  predicate: Predicate | null;
  status: 'draft' | 'ready' | 'final' | 'not_assessed';
  notRelevant: boolean;
  own: boolean;
  result?: 'sesuai' | 'tidak_sesuai' | 'incomparable';
}

export interface QuarterCard {
  quarter: Quarter;
  fiscalYear: number;
  status: ComparisonStatus;
  visible: AssessmentCell[];
  hiddenLabels: string[];
  pendingExplanation: { dueOn: string | null } | null;
  href: string;
  linkLabel: string;
}

export interface ThreadView {
  risk: RegisterRisk;
  positionId: string;
  fiscalYear: number;
  stage: Stage;
  stageIndex: number;
  publishedBy: string | null;
  inactiveLabel: string | null;
  quiet: boolean;
  tidakSesuai: boolean;
  recurring: boolean;
  timeline: QuarterGroup[];
  mitigations: MitigationThread[];
  panel: QuarterCard[];
  previousUrl: string | null;
  nextUrl: string | null;
  archivedOn: string | null;
  following: boolean;
  alwaysFollowing: boolean;
  participation: Holding | null;
  postingQuarter: Quarter | null;
  relatedQuarters: Quarter[];
  /** FR-PPN-003 Lini 3 blind-phase guidance. */
  blindWarning: boolean;
  isOperatorHolding: boolean;
  storage: { used: number; quota: number };
  viewerIsHolder: boolean;
}

function attachmentsFor(
  db: DB,
  viewer: Viewer,
  ownerId: string,
): { list: ThreadAttachment[]; hidden: number } {
  const all = db.attachments.filter((a) => a.ownerKind === 'comment' && a.ownerId === ownerId);
  const list: ThreadAttachment[] = [];
  let hidden = 0;
  for (const a of all) {
    if (a.isConfidential && !viewer.canSeeConfidential) {
      hidden++;
      continue;
    }
    if (canSeeAttachment(viewer, a)) list.push({ attachment: a });
  }
  return { list, hidden };
}

const qOrder = (q: Quarter) => q.fiscalYear * 10 + q.number;

export function buildThread(db: DB, userId: string, riskId: string, at: ISODateTime): ThreadView {
  const today = at.slice(0, 10);
  const viewer = viewerFor(db, userId, today);
  const risk = db.risks.find((r) => r.id === riskId);
  if (!risk || !isPublished(risk)) throw new ApiError('not_found', 'Risiko tidak ditemukan.');
  const register = db.registers.find((r) => r.id === risk.registerId)!;
  assertCanRead(db, userId, register.positionId, today, register.fiscalYear);
  const stages = registerStages(db, register).filter((s) => s.active);
  const stage = db.stages.find((s) => s.id === risk.stageId)!;
  const fy = db.fiscalYears.find((f) => f.year === register.fiscalYear);
  const archivedOn = fy?.status === 'archived' ? (fy.archivedAt ?? null) : null;
  const posting = archivedOn ? null : postingQuarter(db, register.fiscalYear, today);
  const user = (id: string | null) => db.users.find((u) => u.id === id)?.fullName ?? '—';

  const toComment = (c: (typeof db.comments)[number]): ThreadComment => {
    const files = c.withdrawnAt ? { list: [], hidden: 0 } : attachmentsFor(db, viewer, c.id);
    const pos = db.positions.find((p) => p.id === c.actingPositionId);
    return {
      id: c.id,
      authorUserId: c.authorUserId,
      authorName: user(c.authorUserId),
      line: c.authorLine,
      capacity: c.actingAs,
      positionName: pos?.name ?? '',
      createdAt: c.createdAt,
      edited: !!c.editedAt,
      isStep: c.isStep && !c.withdrawnAt,
      body: c.withdrawnAt ? null : c.body,
      withdrawnText: c.withdrawnAt
        ? `Komentar ditarik oleh ${user(c.withdrawnByUserId)} pada ${formatDateTime(c.withdrawnAt)}`
        : null,
      attachments: files.list,
      confidentialHidden: files.hidden,
      canEdit: !archivedOn && canEditComment(c, userId, at),
      canWithdraw: !archivedOn && c.authorUserId === userId && !c.withdrawnAt,
      quarterId: c.quarterId,
      isOwn: c.authorUserId === userId,
    };
  };

  const group = (mitigationId: string | null): QuarterGroup[] => {
    const list = db.comments
      .filter((c) => c.registerRiskId === risk.id && c.registerMitigationId === mitigationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const byQ = new Map<string, QuarterGroup>();
    const ensure = (qid: string) => {
      let g = byQ.get(qid);
      if (!g) {
        g = { quarter: db.quarters.find((q) => q.id === qid)!, comments: [], steps: 0, events: [] };
        byQ.set(qid, g);
      }
      return g;
    };
    if (mitigationId === null && risk.publishedAt) {
      const q = postingQuarter(db, register.fiscalYear, risk.publishedAt.slice(0, 10));
      if (q)
        ensure(q.id).events.push({
          text: `Risiko diterbitkan oleh ${user(register.publishedByUserId)}`,
          at: risk.publishedAt,
        });
    }
    if (mitigationId === null && risk.deactivatedAt) {
      const q = postingQuarter(db, register.fiscalYear, risk.deactivatedAt.slice(0, 10));
      if (q)
        ensure(q.id).events.push({
          text: `Risiko dinonaktifkan — ${risk.deactivationReason ?? ''}`,
          at: risk.deactivatedAt,
        });
    }
    for (const c of list) {
      const g = ensure(c.quarterId);
      const tc = toComment(c);
      g.comments.push(tc);
      if (tc.isStep) g.steps++;
    }
    if (mitigationId === null && posting) ensure(posting.id);
    return [...byQ.values()].sort((a, b) => qOrder(a.quarter) - qOrder(b.quarter));
  };

  const mitigations = db.mitigations
    .filter((m) => m.registerRiskId === risk.id && isPublished(m))
    .sort((a, b) => a.order - b.order)
    .map<MitigationThread>((m) => {
      const quarters = group(m.id);
      const all = quarters.flatMap((q) => q.comments);
      return {
        id: m.id,
        description: m.descriptionSnapshot,
        inactive: m.status === 'inactive',
        isCustom: m.isCustom,
        quarters,
        count: all.filter((c) => c.body !== null).length,
        steps: all.filter((c) => c.isStep).length,
        lastActivity: all.reduce<string | null>(
          (x, c) => (!x || c.createdAt > x ? c.createdAt : x),
          null,
        ),
      };
    });

  // Right panel (VIS-1/2/9): this risk's quarters, newest first, plus the previous year's latest.
  const viewerHeld = new Set(viewer.heldPositionIds);
  const card = (rqId: string, fiscalYear: number, positionId: string): QuarterCard => {
    const rq = db.riskQuarters.find((x) => x.id === rqId)!;
    const quarter = db.quarters.find((q) => q.id === rq.quarterId)!;
    const opened = openedResults(db, rq.id, at);
    const openedSet = new Set(opened.map((r) => r.lini3PositionId));
    const expected = expectedLini3(db, quarter.id);
    const status: ComparisonStatus =
      opened.length === 0 ? 'waiting' : opened.length >= expected.length ? 'open' : 'partial';
    const visible: AssessmentCell[] = [];
    const hiddenLabels: string[] = [];
    const assessments = db.assessments.filter((a) => a.riskQuarterId === rq.id);
    const l1 = assessments.find((a) => a.assessorLine === 1);
    const l3positions = expected;
    const cell = (
      a: (typeof assessments)[number] | undefined,
      posId: string,
      line: 1 | 3,
    ): void => {
      const p = db.positions.find((x) => x.id === posId);
      const label = line === 1 ? `Lini 1 · ${p?.name ?? ''}` : (p?.shortName ?? p?.name ?? '');
      if (!a && viewerHeld.has(posId)) {
        visible.push({
          label,
          positionName: p?.name ?? '',
          line,
          optionLabel: null,
          predicate: null,
          status: 'draft',
          notRelevant: false,
          own: true,
        });
        return;
      }
      if (a && canSeeAssessment(viewer, a, openedSet, expected)) {
        const own = viewerHeld.has(posId);
        if (!own && a.status !== 'final' && a.status !== 'not_assessed') {
          hiddenLabels.push(line === 1 ? 'Lini 1' : (p?.name ?? ''));
          return;
        }
        visible.push({
          label,
          positionName: p?.name ?? '',
          line,
          optionLabel: optionLabelOf(db, a.scoreBandVersionId, a.score),
          predicate: a.predicate,
          status: a.status,
          notRelevant: a.notRelevant,
          own,
          result: line === 3 ? opened.find((r) => r.lini3PositionId === posId)?.result : undefined,
        });
      } else hiddenLabels.push(line === 1 ? 'Lini 1' : (p?.name.replace('Direktorat ', '') ?? ''));
    };
    cell(l1, l1?.assessorPositionId ?? positionId, 1);
    for (const pid of l3positions)
      cell(
        assessments.find((a) => a.assessorPositionId === pid),
        pid,
        3,
      );
    const pending =
      viewerHeld.has(positionId) && fiscalYear === register.fiscalYear
        ? opened.find(
            (r) =>
              r.explanationRequired &&
              (r.explanationStatus === 'pending' || r.explanationStatus === 'ready'),
          )
        : undefined;
    return {
      quarter,
      fiscalYear,
      status,
      visible,
      hiddenLabels,
      pendingExplanation: pending ? { dueOn: pending.explanationDueOn } : null,
      href: `/jabatan/${positionId}/penilaian/${fiscalYear}/${quarter.number}`,
      linkLabel: `Buka Penilaian TW ${['I', 'II', 'III', 'IV'][quarter.number - 1]}`,
    };
  };
  const ownQuarters = db.riskQuarters
    .filter((rq) => rq.registerRiskId === risk.id)
    .map((rq) => ({ rq, q: db.quarters.find((q) => q.id === rq.quarterId)! }))
    .sort((a, b) => qOrder(b.q) - qOrder(a.q))
    .map(({ rq }) => card(rq.id, register.fiscalYear, register.positionId));
  const prev = risk.previousYearRiskId
    ? db.risks.find((r) => r.id === risk.previousYearRiskId)
    : undefined;
  const prevRegister = prev ? db.registers.find((r) => r.id === prev.registerId) : undefined;
  const prevCards = prev
    ? db.riskQuarters
        .filter((rq) => rq.registerRiskId === prev.id)
        .map((rq) => ({ rq, q: db.quarters.find((q) => q.id === rq.quarterId)! }))
        .sort((a, b) => qOrder(b.q) - qOrder(a.q))
        .slice(0, 1)
        .map(({ rq }) => ({
          ...card(rq.id, prevRegister!.fiscalYear, prevRegister!.positionId),
          href: `/jabatan/${prevRegister!.positionId}/riwayat`,
          linkLabel: 'Riwayat TA sebelumnya',
        }))
    : [];
  const next = db.risks.find((r) => r.previousYearRiskId === risk.id && isPublished(r));
  const nextRegister = next ? db.registers.find((r) => r.id === next.registerId) : undefined;

  const participation = posting
    ? participationHolding(db, userId, register.positionId, posting.id, today)
    : null;
  const related = posting && participation ? relatedQuarters(db, risk, posting, at) : [];
  const currentRq = posting
    ? db.riskQuarters.find((rq) => rq.registerRiskId === risk.id && rq.quarterId === posting.id)
    : undefined;
  const ownLini3Opened = currentRq
    ? viewer.lini3PositionIds.some((p) =>
        openedResults(db, currentRq.id, at).some((r) => r.lini3PositionId === p),
      )
    : false;
  const latest = latestOpened(db, viewer, risk, at);

  return {
    risk,
    positionId: register.positionId,
    fiscalYear: register.fiscalYear,
    stage,
    stageIndex: stages.indexOf(stage) + 1,
    publishedBy: register.publishedByUserId ? user(register.publishedByUserId) : null,
    inactiveLabel: risk.status === 'inactive' ? inactiveLabel(db, risk) : null,
    quiet: !archivedOn && isQuiet(db, risk, posting),
    tidakSesuai: !!latest?.tidakSesuai,
    recurring: !!latest?.recurring,
    timeline: group(null),
    mitigations,
    panel: [...ownQuarters, ...prevCards],
    previousUrl:
      prev && prevRegister
        ? `/jabatan/${prevRegister.positionId}/papan/${prevRegister.fiscalYear}/risiko/${prev.id}`
        : null,
    nextUrl:
      next && nextRegister
        ? `/jabatan/${nextRegister.positionId}/papan/${nextRegister.fiscalYear}/risiko/${next.id}`
        : null,
    archivedOn,
    following: isFollowing(db, userId, risk.id, register.positionId, today),
    alwaysFollowing: isAlwaysSubscribed(db, userId, register.positionId, today),
    participation,
    postingQuarter: posting,
    relatedQuarters: related,
    blindWarning: participation?.line === 3 && !ownLini3Opened,
    isOperatorHolding: participation?.capacity === 'operator',
    storage: {
      used: storageUsed(db, register.positionId, register.fiscalYear),
      quota: QUOTA_BYTES,
    },
    viewerIsHolder: viewerHeld.has(register.positionId),
  };
}

export const boardApi = {
  board: (positionId: string, fiscalYear: number) =>
    call(() => {
      const { userId, at } = viewerNow();
      return buildBoard(getDb(), userId, positionId, fiscalYear, at);
    }),
  thread: (riskId: string) =>
    call(() => {
      const { userId, at } = viewerNow();
      return buildThread(getDb(), userId, riskId, at);
    }),
  quarterLabel,
};
