// Pure derivations of the calendar pages, moved out of the prototype module (B9) so pages do
// not bundle the local store. The fake backend re-exports them.

import { addDays, QUARTER_ROMAN } from '@/domain/calendar';
import { quarterRisks } from '@/domain/rules/assessment';
import type { FiscalYear, ISODate, Quarter } from '@/domain/types';
import { formatDate } from '@/lib/format';
import type { DB } from '@/test/fake/db';

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

export interface ArchiveStatus {
  year: number;
  status: FiscalYear['status'];
  tw4Complete: boolean;
  blockers: string[];
  baseHardLimit: ISODate;
  projected: ISODate;
}
