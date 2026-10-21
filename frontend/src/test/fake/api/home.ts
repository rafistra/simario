// Home cards — PRD ch. 4 (FR-BRD-001 … 011). Composition follows the active holding's line.

import { daysBetween, latenessAt } from '@/domain/calendar';
import {
  hasPermission,
  holdingsOf,
  lini1PositionsInScope,
  officialsOf,
} from '@/domain/rules/access';
import { assessmentFrozen, quarterRisks, resultOpened } from '@/domain/rules/assessment';
import {
  isFollowing,
  isQuiet,
  lastActivity,
  openedResults,
  postingQuarter,
} from '@/domain/rules/board';
import { latestOpenedQuarter, lembarMutu, type LembarMutu } from '@/domain/rules/sheets';
import { viewerFor } from '@/domain/rules/visibility';
import type { ISODate, ISODateTime, Lateness, Line, Quarter } from '@/domain/types';
import { formatDate } from '@/lib/format';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { ApiError, call } from '../local/call';
import { getDb } from '../local/store';

export interface Obligation {
  quarter: Quarter;
  deadline: ISODate;
  daysLeft: number;
  lateness: Lateness;
  done: number;
  total: number;
  href: string;
}

export interface ActionLine {
  text: string;
  href: string;
  urgent?: boolean;
}

export interface CoordinatedRow {
  positionId: string;
  name: string;
  unit: string;
  assessed: number;
  quiet: number;
  lastActivity: ISODateTime | null;
  href: string;
}

export interface ActivityRow {
  id: string;
  line: Line;
  author: string;
  position: string;
  risk: string;
  at: ISODateTime;
  href: string;
}

export interface PositionListRow {
  positionId: string;
  name: string;
  unit: string;
  unitId: string;
  type: string;
  typeId: string;
  register: 'belum' | 'draf' | 'siap' | 'terbit' | 'diarsipkan';
  quiet: number;
  lastActivity: ISODateTime | null;
  href: string;
}

export interface HomeView {
  line: Line | null;
  positionId: string | null;
  isPejabat: boolean;
  lini1?: {
    obligations: Obligation[];
    upcoming: { quarter: Quarter; opensOn: ISODate } | null;
    actions: ActionLine[];
    register: {
      fiscalYear: number;
      status: 'belum' | 'draf' | 'siap';
      canCopy: boolean;
      href: string;
    } | null;
    lastQuarter: { mutu: LembarMutu; href: string } | null;
  };
  lini2?: { rows: CoordinatedRow[]; quarter: Quarter | null };
  lini3?: {
    directorate: string;
    obligations: Obligation[];
    attention: {
      quarter: Quarter;
      tidakSesuai: number;
      berulang: number;
      notAssessed: number;
    } | null;
  };
  health?: { label: string; count: number; href: string; items: string[] }[];
  pmd?: { proposals: number };
  activity: ActivityRow[] | null;
}

const qOrder = (q: Quarter) => q.fiscalYear * 10 + q.number;
const lini1Positions = (db: DB) =>
  db.positions.filter(
    (p) => p.active && db.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1,
  );

function obligationFor(
  db: DB,
  q: Quarter,
  deadline: ISODate,
  done: number,
  total: number,
  href: string,
  today: ISODate,
): Obligation {
  const tolerance = db.fiscalYears.find((f) => f.year === q.fiscalYear)?.toleranceDays ?? 7;
  return {
    quarter: q,
    deadline,
    daysLeft: daysBetween(today, deadline),
    lateness: latenessAt(`${today}T00:00`, deadline, tolerance),
    done,
    total,
    href,
  };
}

function registerState(db: DB, positionId: string, year: number): PositionListRow['register'] {
  const r = db.registers.find((x) => x.positionId === positionId && x.fiscalYear === year);
  if (!r) return 'belum';
  if (r.status === 'archived' || db.fiscalYears.find((f) => f.year === year)?.status === 'archived')
    return 'diarsipkan';
  if (r.status === 'published' || r.publishedAt) return 'terbit';
  return r.status === 'ready' ? 'siap' : 'draf';
}

function quietCount(db: DB, positionId: string, today: ISODate): number {
  const year = Number(today.slice(0, 4));
  const q = postingQuarter(db, year, today);
  if (!q) return 0;
  return quarterRisks(db, positionId, q).filter(({ risk }) => isQuiet(db, risk, q)).length;
}

function lastActivityOf(db: DB, positionId: string, year: number): ISODateTime | null {
  const reg = db.registers.find((r) => r.positionId === positionId && r.fiscalYear === year);
  if (!reg) return null;
  return db.risks
    .filter((r) => r.registerId === reg.id)
    .map((r) => lastActivity(db, r.id))
    .reduce<string | null>((m, t) => (t && (!m || t > m) ? t : m), null);
}

export function buildHome(
  db: DB,
  userId: string,
  activePositionId: string | null,
  at: ISODateTime,
): HomeView {
  const today = at.slice(0, 10);
  const year = Number(today.slice(0, 4));
  const holdings = holdingsOf(db, userId, today);
  const holding = holdings.find((h) => h.positionId === activePositionId) ?? holdings[0] ?? null;
  const viewer = viewerFor(db, userId, today);
  const openYears = new Set(
    db.fiscalYears.filter((f) => f.status !== 'archived').map((f) => f.year),
  );
  const quarters = db.quarters
    .filter((q) => openYears.has(q.fiscalYear))
    .sort((a, b) => qOrder(a) - qOrder(b));
  const view: HomeView = {
    line: holding?.line ?? null,
    positionId: holding?.positionId ?? null,
    isPejabat: holding?.capacity === 'pejabat',
    activity: null,
  };

  if (holding?.line === 1) {
    const pid = holding.positionId;
    const base = `/jabatan/${pid}`;
    // FR-BRD-001: open obligations from any fiscal year.
    const obligations = quarters
      .filter((q) => today >= q.lini1OpensOn)
      .flatMap((q) => {
        const items = quarterRisks(db, pid, q);
        const l1 = (rqId: string) =>
          db.assessments.find((a) => a.riskQuarterId === rqId && a.assessorLine === 1);
        const owed = items.filter(({ rq }) => {
          const a = l1(rq.id);
          return (
            a?.status !== 'final' &&
            a?.status !== 'not_assessed' &&
            openedResults(db, rq.id, at).length === 0
          );
        });
        if (owed.length === 0) return [];
        const done = items.filter(({ rq }) => l1(rq.id)?.status === 'final').length;
        return [
          obligationFor(
            db,
            q,
            q.lini1Deadline,
            done,
            items.length,
            `${base}/penilaian/${q.fiscalYear}/${q.number}`,
            today,
          ),
        ];
      })
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
    const upcomingQ = quarters.find((q) => q.lini1OpensOn > today && q.fiscalYear >= year);
    // FR-BRD-002: actions.
    const actions: ActionLine[] = [];
    const pending = quarters.flatMap((q) =>
      quarterRisks(db, pid, q).flatMap(({ rq }) =>
        openedResults(db, rq.id, at)
          .filter(
            (r) =>
              r.explanationRequired &&
              r.explanationStatus !== 'sent' &&
              r.explanationStatus !== 'not_sent',
          )
          .map((r) => ({ r, q })),
      ),
    );
    if (pending.length) {
      const first = pending.sort((a, b) =>
        (a.r.explanationDueOn ?? '').localeCompare(b.r.explanationDueOn ?? ''),
      )[0]!;
      actions.push({
        text: `${pending.length} hasil Tidak Sesuai menunggu penjelasan · tenggat terdekat ${first.r.explanationDueOn ? formatDate(first.r.explanationDueOn) : '—'}`,
        href: `${base}/penilaian/${first.q.fiscalYear}/${first.q.number}`,
        urgent: true,
      });
    }
    const quiet = quietCount(db, pid, today);
    if (quiet)
      actions.push({
        text: `${quiet} risiko belum ada langkah triwulan ini`,
        href: `${base}/papan/${year}`,
      });
    if (holding.capacity === 'pejabat') {
      const reg = db.registers.find((r) => r.positionId === pid && r.fiscalYear === year);
      const readyItems = reg
        ? db.risks.filter((r) => r.registerId === reg.id && r.status === 'ready').length +
          db.mitigations.filter(
            (m) =>
              m.status === 'ready' &&
              db.risks.some((r) => r.id === m.registerRiskId && r.registerId === reg.id),
          ).length
        : 0;
      if (reg && (reg.status === 'ready' || readyItems > 0))
        actions.push({
          text: `${reg.status === 'ready' ? 'Register' : `${readyItems} tambahan register`} siap dari operator`,
          href: `${base}/register/${year}`,
        });
      for (const q of quarters) {
        const ready = quarterRisks(db, pid, q).filter(
          ({ rq }) =>
            db.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorLine === 1)
              ?.status === 'ready',
        ).length;
        if (ready)
          actions.push({
            text: `${ready} draf penilaian TW ${['I', 'II', 'III', 'IV'][q.number - 1]} ${q.fiscalYear} siap dari operator`,
            href: `${base}/penilaian/${q.fiscalYear}/${q.number}`,
          });
      }
    }
    // FR-BRD-003: register status.
    const state = registerState(db, pid, year);
    const prev = db.registers.find((r) => r.positionId === pid && r.fiscalYear === year - 1);
    const cur = db.registers.find((r) => r.positionId === pid && r.fiscalYear === year);
    const register =
      state === 'belum' || state === 'draf' || state === 'siap'
        ? {
            fiscalYear: year,
            status: state,
            canCopy: !!prev && (!cur || !db.risks.some((r) => r.registerId === cur.id)),
            href: `${base}/register/${year}`,
          }
        : null;
    // FR-BRD-004: last quarter result.
    const lq = latestOpenedQuarter(db, pid, at);
    view.lini1 = {
      obligations,
      upcoming: upcomingQ ? { quarter: upcomingQ, opensOn: upcomingQ.lini1OpensOn } : null,
      actions,
      register,
      lastQuarter: lq
        ? {
            mutu: lembarMutu(db, viewer, pid, lq, at),
            href: `${base}/lembar/${lq.fiscalYear}/${lq.number}`,
          }
        : null,
    };
  }

  if (holding?.line === 2) {
    const q = postingQuarter(db, year, today);
    const ids = lini1PositionsInScope(db, userId, today, 1, year);
    view.lini2 = {
      quarter: q,
      rows: ids
        .map((id) => {
          const p = db.positions.find((x) => x.id === id)!;
          return {
            positionId: id,
            name: p.name,
            unit: db.orgUnits.find((u) => u.id === p.orgUnitId)?.name ?? '',
            assessed: q ? quarterRisks(db, id, q).length : 0,
            quiet: quietCount(db, id, today),
            lastActivity: lastActivityOf(db, id, year),
            href: `/jabatan/${id}/papan/${year}`,
          };
        })
        .sort((a, b) => b.quiet - a.quiet || a.name.localeCompare(b.name)),
    };
  }

  if (holding?.line === 3) {
    const dir = holding.positionId;
    const all = lini1Positions(db);
    const obligations = quarters
      .filter(
        (q) =>
          today >= q.lini3OpensOn &&
          db.quarterAssessors.some(
            (a) => a.quarterId === q.id && a.positionId === dir && !a.excluded,
          ),
      )
      .flatMap((q) => {
        const items = all.flatMap((p) => quarterRisks(db, p.id, q));
        const mine = (rqId: string) =>
          db.assessments.find((a) => a.riskQuarterId === rqId && a.assessorPositionId === dir);
        const owed = items.filter(
          ({ rq }) =>
            mine(rq.id)?.status !== 'final' &&
            !assessmentFrozen(
              db,
              { riskQuarterId: rq.id, assessorLine: 3, assessorPositionId: dir },
              at,
            ),
        );
        if (owed.length === 0) return [];
        const done = items.filter(({ rq }) => mine(rq.id)?.status === 'final').length;
        return [
          obligationFor(db, q, q.lini3Deadline, done, items.length, `/penilaian?tw=${q.id}`, today),
        ];
      })
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
    const latest = [...quarters]
      .reverse()
      .find((q) =>
        all.some((p) =>
          quarterRisks(db, p.id, q).some(({ rq }) => resultOpened(db, rq.id, dir, at)),
        ),
      );
    let attention = null;
    if (latest) {
      // VIS-9: only risks whose result for this directorate has opened.
      const own = all
        .flatMap((p) => quarterRisks(db, p.id, latest))
        .filter(({ rq }) => resultOpened(db, rq.id, dir, at));
      attention = {
        quarter: latest,
        tidakSesuai: own.filter(({ rq }) =>
          openedResults(db, rq.id, at).some((r) => r.result === 'tidak_sesuai'),
        ).length,
        berulang: own.filter(({ rq }) => rq.recurring).length,
        notAssessed: own.filter(
          ({ rq }) =>
            db.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorLine === 1)
              ?.status === 'not_assessed',
        ).length,
      };
    }
    view.lini3 = {
      directorate: db.positions.find((p) => p.id === dir)?.name ?? '',
      obligations,
      attention,
    };
  }

  // FR-BRD-008: configuration health for Superadmin (user and role management).
  if (hasPermission(db, userId, 21, today) && hasPermission(db, userId, 22, today)) {
    const q = postingQuarter(db, year, today);
    const noPejabat = db.positions.filter(
      (p) => p.active && officialsOf(db, p.id, today).length === 0,
    );
    const lini1 = lini1Positions(db);
    const noAssignment = q
      ? lini1.filter(
          (p) =>
            !db.assignments.some((a) => {
              if (a.targetPositionId !== p.id) return false;
              const from = db.quarters.find((x) => x.id === a.quarterFromId)!;
              const to = db.quarters.find((x) => x.id === a.quarterToId)!;
              return qOrder(from) <= qOrder(q) && qOrder(q) <= qOrder(to);
            }),
        )
      : [];
    const unpublished = lini1.filter(
      (p) => !['terbit', 'diarsipkan'].includes(registerState(db, p.id, year)),
    );
    const noDeadlines = db.quarters.filter(
      (x) => x.fiscalYear === year && (!x.lini1Deadline || !x.lini3Deadline),
    );
    view.health = [
      {
        label: 'Jabatan tanpa Pejabat',
        count: noPejabat.length,
        href: '/pengaturan/pengguna',
        items: noPejabat.map((p) => p.name),
      },
      {
        label: 'Jabatan Lini 1 tanpa penugasan pemantauan triwulan ini',
        count: noAssignment.length,
        href: '/pengaturan/penugasan-pemantauan',
        items: noAssignment.map((p) => p.name),
      },
      {
        label: `Register TA ${year} belum terbit`,
        count: unpublished.length,
        href: '/jabatan',
        items: unpublished.map((p) => p.name),
      },
      {
        label: `Triwulan TA ${year} tanpa tenggat`,
        count: noDeadlines.length,
        href: '/pengaturan/tahun-anggaran',
        items: noDeadlines.map((x) => `TW ${x.number}`),
      },
    ];
  }

  if (!holding && !view.health && hasPermission(db, userId, 12, today))
    view.pmd = { proposals: db.proposals.filter((p) => p.status === 'pending').length };

  // FR-BRD-009: recent activity on followed threads (holders only — others cannot follow).
  if (holding) {
    view.activity = db.comments
      .filter((c) => c.authorUserId !== userId && !c.withdrawnAt && c.createdAt <= at)
      .filter((c) => {
        const risk = db.risks.find((r) => r.id === c.registerRiskId);
        const reg = risk && db.registers.find((r) => r.id === risk.registerId);
        return !!reg && isFollowing(db, userId, c.registerRiskId, reg.positionId, today);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((c) => {
        const risk = db.risks.find((r) => r.id === c.registerRiskId)!;
        const reg = db.registers.find((r) => r.id === risk.registerId)!;
        return {
          id: c.id,
          line: c.authorLine,
          author: db.users.find((u) => u.id === c.authorUserId)?.fullName ?? '',
          position: db.positions.find((p) => p.id === c.actingPositionId)?.name ?? '',
          risk: risk.descriptionSnapshot,
          at: c.createdAt,
          href: `/jabatan/${reg.positionId}/papan/${reg.fiscalYear}/risiko/${risk.id}#komentar-${c.id}`,
        };
      });
  }
  return view;
}

/** FR-BRD-011: `/jabatan` (scope Unit/All) and `/pantauan` (Lini 2 own scope). */
export function buildPositionList(db: DB, userId: string, at: ISODateTime): PositionListRow[] {
  const today = at.slice(0, 10);
  const year = Number(today.slice(0, 4));
  return lini1PositionsInScope(db, userId, today, 1, year)
    .map((id) => db.positions.find((p) => p.id === id)!)
    .filter((p) => p.active)
    .map((p) => ({
      positionId: p.id,
      name: p.name,
      unit: db.orgUnits.find((u) => u.id === p.orgUnitId)?.name ?? '',
      unitId: p.orgUnitId,
      type: db.positionTypes.find((t) => t.id === p.positionTypeId)?.name ?? '',
      typeId: p.positionTypeId,
      register: registerState(db, p.id, year),
      quiet: quietCount(db, p.id, today),
      lastActivity: lastActivityOf(db, p.id, year),
      href: `/jabatan/${p.id}/papan/${year}`,
    }))
    .sort((a, b) => b.quiet - a.quiet || a.name.localeCompare(b.name));
}

function sessionUser() {
  const userId = useSession.getState().userId;
  if (!userId) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  return userId;
}

export const homeApi = {
  home: (activePositionId: string | null) =>
    call(() => buildHome(getDb(), sessionUser(), activePositionId, now())),
  positions: () => call(() => buildPositionList(getDb(), sessionUser(), now())),
};
