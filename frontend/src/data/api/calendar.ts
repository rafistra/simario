// Fiscal years, quarters, Lini 3 exclusion, and archiving — PRD §2.5, FR-ADM-007, INV-9, INV-21.

import { addDays, defaultQuarters, QUARTER_ROMAN } from '@/domain/calendar';
import { quarterRisks } from '@/domain/rules/assessment';
import { buildSheetPayload } from '@/domain/rules/sheetPayload';
import type { FiscalYear, ISODate, ISODateTime, Quarter } from '@/domain/types';
import { formatDate } from '@/lib/format';
import type { DB } from '../db';
import { requireActor, type Actor } from '../local/actor';
import { ApiError, call } from '../local/call';
import { runComparisons } from '../local/comparisons';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit } from '../local/writers';
import { photoSelection } from './sheets';

const audit = (
  d: DB,
  a: Actor | null,
  at: ISODateTime,
  action: string,
  type: string,
  id: string,
  before: unknown,
  after: unknown,
) =>
  writeAudit(d, {
    at,
    actorUserId: a?.userId ?? null,
    actingAs: a?.actingAs ?? 'sistem',
    actingPositionId: null,
    action,
    entityType: type,
    entityId: id,
    before,
    after,
  });

const tw = (n: number) => `TW ${QUARTER_ROMAN[n - 1]}`;

/** INV-9 per quarter and across the year; returns readable problems keyed by field. */
export function quarterProblems(
  year: number,
  qs: Quarter[],
): { quarterId: string; field: string; message: string }[] {
  const out: { quarterId: string; field: string; message: string }[] = [];
  const sorted = [...qs].sort((a, b) => a.number - b.number);
  sorted.forEach((q, i) => {
    const add = (field: string, message: string) =>
      out.push({ quarterId: q.id, field, message: `${tw(q.number)}: ${message}` });
    if (q.startsOn > q.endsOn) add('endsOn', 'tanggal akhir sebelum tanggal mulai.');
    if (!q.startsOn.startsWith(String(year)) || !q.endsOn.startsWith(String(year)))
      add('startsOn', `triwulan harus berada di tahun ${year}.`);
    if (i > 0 && addDays(sorted[i - 1]!.endsOn, 1) !== q.startsOn)
      add('startsOn', 'triwulan harus bersambung dengan triwulan sebelumnya.');
    if (q.lini1OpensOn > q.lini1Deadline)
      add('lini1Deadline', 'tenggat Lini 1 sebelum jendela Lini 1 dibuka.');
    if (q.lini1Deadline >= q.lini3Deadline)
      add('lini3Deadline', 'tenggat Lini 3 harus sesudah tenggat Lini 1.');
    if (q.lini3OpensOn > q.lini3Deadline)
      add('lini3Deadline', 'tenggat Lini 3 sebelum jendela Lini 3 dibuka.');
    if (!(q.explanationWorkdays >= 1))
      add('explanationWorkdays', 'hari kerja penjelasan minimal 1.');
  });
  if (sorted[0] && sorted[0].startsOn !== `${year}-01-01`)
    out.push({ quarterId: sorted[0].id, field: 'startsOn', message: 'TW I dimulai 1 Januari.' });
  if (sorted.at(-1) && sorted.at(-1)!.endsOn !== `${year}-12-31`)
    out.push({
      quarterId: sorted.at(-1)!.id,
      field: 'endsOn',
      message: 'TW IV berakhir 31 Desember.',
    });
  return out;
}

export interface ArchiveStatus {
  year: number;
  status: FiscalYear['status'];
  tw4Complete: boolean;
  blockers: string[];
  baseHardLimit: ISODate;
  projected: ISODate;
}

/** §2.5 archiving conditions and the projected (extended) hard limit. */
export function archiveStatus(db: DB, year: number, today: ISODate): ArchiveStatus {
  const fy = db.fiscalYears.find((f) => f.year === year)!;
  const tw4 = db.quarters.find((q) => q.fiscalYear === year && q.number === 4)!;
  const base = addDays(tw4.lini3Deadline, fy.toleranceDays + fy.archiveGraceDays);
  const lini1 = db.positions.filter(
    (p) => db.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1,
  );
  const blockers: string[] = [];
  let open = 0;
  let pendingExpl = 0;
  let projected = base;
  for (const p of lini1)
    for (const { rq } of quarterRisks(db, p.id, tw4)) {
      if (rq.comparisonStatus !== 'open') open++;
    }
  for (const r of db.results) {
    const rq = db.riskQuarters.find((x) => x.id === r.riskQuarterId);
    const q = rq && db.quarters.find((x) => x.id === rq.quarterId);
    if (
      !q ||
      q.fiscalYear !== year ||
      !r.explanationRequired ||
      r.explanationStatus === 'sent' ||
      r.explanationStatus === 'not_sent' ||
      !r.explanationDueOn
    )
      continue;
    const limit = addDays(r.explanationDueOn, fy.toleranceDays);
    if (today <= limit) pendingExpl++;
    if (r.explanationDueOn <= base && limit > projected) projected = limit;
  }
  if (open) blockers.push(`${open} risiko TW IV belum terbuka penuh perbandingannya`);
  if (pendingExpl)
    blockers.push(`${pendingExpl} penjelasan wajib belum dikirim dan masih dalam tenggat`);
  if (today <= tw4.endsOn) blockers.push(`TW IV berakhir ${formatDate(tw4.endsOn)}`);
  return {
    year,
    status: fy.status,
    tw4Complete: blockers.length === 0,
    blockers,
    baseHardLimit: base,
    projected,
  };
}

/**
 * Archive a fiscal year (§2.5): unfinalised assessments become not_assessed, unsent mandatory
 * explanations not_sent, final sheet versions are frozen where content changed, then read-only.
 */
export function archiveYear(
  d: DB,
  year: number,
  at: ISODateTime,
  by: 'hard_limit' | 'manual',
  a: Actor | null,
) {
  const fy = d.fiscalYears.find((f) => f.year === year)!;
  const quarters = d.quarters.filter((q) => q.fiscalYear === year);
  const lini1 = d.positions.filter(
    (p) => d.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1,
  );
  let closed = 0;
  for (const q of quarters) {
    const expected = d.quarterAssessors
      .filter((x) => x.quarterId === q.id && !x.excluded)
      .map((x) => x.positionId);
    for (const p of lini1)
      for (const { rq } of quarterRisks(d, p.id, q)) {
        for (const assessor of [p.id, ...expected]) {
          const x = d.assessments.find(
            (y) => y.riskQuarterId === rq.id && y.assessorPositionId === assessor,
          );
          if (x?.status === 'final' || x?.status === 'not_assessed') continue;
          if (x) Object.assign(x, { status: 'not_assessed', updatedAt: at });
          else
            d.assessments.push({
              id: newId('as'),
              riskQuarterId: rq.id,
              assessorPositionId: assessor,
              assessorLine: assessor === p.id ? 1 : 3,
              status: 'not_assessed',
              score: null,
              predicate: null,
              notRelevant: false,
              notRelevantReason: null,
              note: null,
              scoreBandVersionId: q.scoreBandVersionId,
              finalisedByUserId: null,
              finalisedAt: null,
              lateness: null,
              flags: [],
              updatedAt: at,
            });
          closed++;
        }
        const live = d.riskQuarters.find((y) => y.id === rq.id)!;
        if (live.comparisonStatus === 'partial') live.comparisonStatus = 'open';
      }
  }
  for (const r of d.results) {
    const rq = d.riskQuarters.find((x) => x.id === r.riskQuarterId);
    const q = rq && d.quarters.find((x) => x.id === rq.quarterId);
    if (q?.fiscalYear === year && r.explanationRequired && r.explanationStatus !== 'sent')
      r.explanationStatus = 'not_sent';
  }
  // FR-LBR-009: final automatic version where the content changed since the last one.
  for (const q of quarters)
    for (const p of lini1) {
      if (quarterRisks(d, p.id, q).length === 0) continue;
      const payload = buildSheetPayload(d, p.id, q, at, photoSelection(d, p.id, q.id));
      for (const kind of ['komunikasi', 'mutu'] as const) {
        const last = d.snapshots
          .filter(
            (s) =>
              s.positionId === p.id &&
              s.quarterId === q.id &&
              s.kind === kind &&
              s.trigger !== 'print',
          )
          .sort((x, y) => (y.version ?? 0) - (x.version ?? 0))[0];
        const same =
          last &&
          JSON.stringify({ ...(last.payload as object), builtAt: '' }) ===
            JSON.stringify({ ...payload, builtAt: '' });
        if (same) continue;
        const unit = d.orgUnits.find((u) => u.id === p.orgUnitId)!;
        const prefix = `SIMARIO/${kind === 'komunikasi' ? 'LK' : 'LM'}/${q.fiscalYear}/TW${q.number}/${unit.code}-${p.code}/`;
        const id = newId('snap');
        d.snapshots.push({
          id,
          number: `${prefix}${String(d.snapshots.filter((s) => s.number.startsWith(prefix)).length + 1).padStart(3, '0')}`,
          positionId: p.id,
          quarterId: q.id,
          kind,
          version: (last?.version ?? 0) + 1,
          trigger: 'archive',
          isProvisional: false,
          supersededById: null,
          payload,
          createdByUserId: null,
          createdAt: at,
        });
        if (last) d.snapshots.find((s) => s.id === last.id)!.supersededById = id;
      }
    }
  for (const reg of d.registers)
    if (reg.fiscalYear === year && reg.status === 'published') reg.status = 'archived';
  Object.assign(fy, { status: 'archived', archivedAt: at, archivedBy: by });
  audit(
    d,
    a,
    at,
    'arsipkan_tahun_anggaran',
    'FiscalYear',
    String(year),
    { status: 'closing' },
    { status: 'archived', by, notAssessed: closed },
  );
}

/** Scheduled (§2.5): year status, expected Lini 3 sets, and archiving at the hard limit. */
export function runCalendar(d: DB, at: ISODateTime) {
  const today = at.slice(0, 10);
  for (const fy of d.fiscalYears) {
    if (fy.status === 'archived') continue;
    const tw4 = d.quarters.find((q) => q.fiscalYear === fy.year && q.number === 4);
    if (tw4 && fy.status === 'open' && today > tw4.endsOn) fy.status = 'closing';
    if (tw4 && fy.status === 'closing' && today > archiveStatus(d, fy.year, today).projected)
      archiveYear(d, fy.year, at, 'hard_limit', null);
  }
  // Expected Lini 3 set recorded when lini3_opens_on arrives.
  const lini3 = d.positions.filter(
    (p) => p.active && d.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 3,
  );
  for (const q of d.quarters) {
    if (q.lini3OpensOn > today || d.quarterAssessors.some((x) => x.quarterId === q.id)) continue;
    if (d.fiscalYears.find((f) => f.year === q.fiscalYear)?.status === 'archived') continue;
    for (const p of lini3)
      d.quarterAssessors.push({
        quarterId: q.id,
        positionId: p.id,
        excluded: false,
        exclusionReason: null,
        excludedByUserId: null,
      });
  }
}

export const calendarApi = {
  createFiscalYear: (year: number) =>
    call(() => {
      const a = requireActor([19]);
      if (getDb().fiscalYears.some((f) => f.year === year))
        throw new ApiError('validation', `TA ${year} sudah ada.`);
      mutateDb((d) => {
        d.fiscalYears.push({
          year,
          status: 'open',
          toleranceDays: 7,
          archiveGraceDays: 30,
          archivedAt: null,
          archivedBy: null,
        });
        d.quarters.push(...defaultQuarters(year, null));
        audit(d, a, a.at, 'buat_tahun_anggaran', 'FiscalYear', String(year), null, { year });
      });
    }),

  updateFiscalYear: (year: number, patch: { toleranceDays?: number; archiveGraceDays?: number }) =>
    call(() => {
      const a = requireActor([19]);
      if ((patch.toleranceDays ?? 1) < 0 || (patch.archiveGraceDays ?? 1) < 0)
        throw new ApiError('validation', 'Jumlah hari tidak boleh negatif.');
      mutateDb((d) => {
        const fy = d.fiscalYears.find((f) => f.year === year)!;
        if (fy.status === 'archived')
          throw new ApiError('archived', 'Tahun anggaran ini sudah diarsipkan.');
        const before = { toleranceDays: fy.toleranceDays, archiveGraceDays: fy.archiveGraceDays };
        Object.assign(fy, patch);
        audit(d, a, a.at, 'ubah_tahun_anggaran', 'FiscalYear', String(year), before, patch);
      });
    }),

  /** FR-ADM-007: INV-9; windows cannot move past entered scores; passed deadlines need confirmation. */
  updateQuarter: (
    quarterId: string,
    patch: Partial<Omit<Quarter, 'id' | 'fiscalYear' | 'number' | 'scoreBandVersionId'>>,
    confirmPastDeadline = false,
  ) =>
    call(() => {
      const a = requireActor([19]);
      const db = getDb();
      const q = db.quarters.find((x) => x.id === quarterId)!;
      if (db.fiscalYears.find((f) => f.year === q.fiscalYear)?.status === 'archived')
        throw new ApiError('archived', 'Tahun anggaran ini sudah diarsipkan.');
      const next = { ...q, ...patch };
      const problems = quarterProblems(
        q.fiscalYear,
        db.quarters
          .filter((x) => x.fiscalYear === q.fiscalYear)
          .map((x) => (x.id === q.id ? next : x)),
      );
      if (problems.length) throw new ApiError('inv9', problems[0]!.message, problems);
      for (const line of [1, 3] as const) {
        const field = line === 1 ? 'lini1OpensOn' : 'lini3OpensOn';
        if (next[field] > q[field]) {
          const affected = db.assessments.filter(
            (x) =>
              x.assessorLine === line &&
              db.riskQuarters.find((r) => r.id === x.riskQuarterId)?.quarterId === q.id &&
              x.updatedAt.slice(0, 10) < next[field],
          ).length;
          if (affected)
            throw new ApiError(
              'window',
              `Jendela Lini ${line} tidak dapat dimundurkan: ${affected} penilaian sudah diisi sebelum tanggal itu.`,
            );
        }
      }
      const passed = (['lini1Deadline', 'lini3Deadline'] as const).filter(
        (f) => patch[f] && patch[f] !== q[f] && q[f] < a.today,
      );
      if (passed.length && !confirmPastDeadline)
        throw new ApiError(
          'confirm',
          'Tenggat ini sudah lewat. Keterlambatan yang sudah tercatat tidak dihitung ulang.',
        );
      mutateDb((d) => {
        const x = d.quarters.find((y) => y.id === quarterId)!;
        const before = Object.fromEntries(
          Object.keys(patch).map((k) => [k, x[k as keyof Quarter]]),
        );
        Object.assign(x, patch);
        audit(d, a, a.at, 'ubah_triwulan', 'Quarter', quarterId, before, patch);
      });
    }),

  /** §2.5: exclude a Lini 3 position while it has finalised nothing in the quarter; re-evaluate openings. */
  excludeAssessor: (quarterId: string, positionId: string, reason: string) =>
    call(() => {
      const a = requireActor([19]);
      if (!reason.trim()) throw new ApiError('validation', 'Alasan pengecualian wajib diisi.');
      const db = getDb();
      const rqIds = db.riskQuarters.filter((r) => r.quarterId === quarterId).map((r) => r.id);
      if (
        db.assessments.some(
          (x) =>
            rqIds.includes(x.riskQuarterId) &&
            x.assessorPositionId === positionId &&
            x.status === 'final',
        )
      )
        throw new ApiError(
          'validation',
          'Direktorat ini sudah menuntaskan penilaian pada triwulan ini dan tidak dapat dikecualikan.',
        );
      mutateDb((d) => {
        const qa = d.quarterAssessors.find(
          (x) => x.quarterId === quarterId && x.positionId === positionId,
        );
        if (!qa) throw new ApiError('validation', 'Direktorat ini bukan penilai triwulan ini.');
        Object.assign(qa, {
          excluded: true,
          exclusionReason: reason.trim(),
          excludedByUserId: a.userId,
        });
        d.assessments = d.assessments.filter(
          (x) => !(rqIds.includes(x.riskQuarterId) && x.assessorPositionId === positionId),
        );
        audit(
          d,
          a,
          a.at,
          'kecualikan_penilai',
          'QuarterAssessor',
          `${quarterId}:${positionId}`,
          null,
          { reason: reason.trim() },
        );
        runComparisons(d, a.at, rqIds);
      });
    }),

  archiveManually: (year: number) =>
    call(() => {
      const a = requireActor([26]);
      const st = archiveStatus(getDb(), year, a.today);
      if (st.status === 'archived')
        throw new ApiError('archived', 'Tahun anggaran ini sudah diarsipkan.');
      if (!st.tw4Complete)
        throw new ApiError(
          'blocked',
          `TW IV belum lengkap: ${st.blockers.join('; ')}.`,
          st.blockers,
        );
      mutateDb((d) => archiveYear(d, year, a.at, 'manual', a));
    }),
};
