// Calendar helpers — PRD §2.5. All arithmetic is on 'YYYY-MM-DD' strings in UTC to stay
// timezone-independent.

import type { ISODate, ISODateTime, Lateness, Quarter } from './types';

const toDate = (iso: ISODate) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const toISO = (d: Date): ISODate => d.toISOString().slice(0, 10);

export function addDays(iso: ISODate, days: number): ISODate {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Working days count Monday–Friday only (no holiday calendar in v1.0, §1.10). */
export function addWorkdays(iso: ISODate, workdays: number): ISODate {
  const d = toDate(iso);
  let left = workdays;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return toISO(d);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

export function lastFriday(year: number, month: number): ISODate {
  const d = lastDayOfMonth(year, month);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return toISO(d);
}

export function firstFriday(year: number, month: number): ISODate {
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return toISO(d);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Default quarter rows for a new fiscal year (FR-ADM-007, §2.5 defaults). */
export function defaultQuarters(year: number, scoreBandVersionId: string | null = null): Quarter[] {
  return ([1, 2, 3, 4] as const).map((n) => {
    const firstMonth = (n - 1) * 3 + 1;
    const thirdMonth = firstMonth + 2;
    const next = thirdMonth === 12 ? { y: year + 1, m: 1 } : { y: year, m: thirdMonth + 1 };
    return {
      id: `q-${year}-${n}`,
      fiscalYear: year,
      number: n,
      startsOn: `${year}-${pad(firstMonth)}-01`,
      endsOn: toISO(lastDayOfMonth(year, thirdMonth)),
      lini1OpensOn: `${year}-${pad(thirdMonth)}-01`,
      lini1Deadline: lastFriday(year, thirdMonth),
      lini3OpensOn: `${year}-${pad(firstMonth)}-01`,
      lini3Deadline: firstFriday(next.y, next.m),
      explanationWorkdays: 5,
      scoreBandVersionId,
    };
  });
}

/** Lateness marker fixed at the moment of finalising (§2.5). */
export function latenessAt(at: ISODateTime, deadline: ISODate, toleranceDays: number): Lateness {
  const day = at.slice(0, 10);
  if (day <= deadline) return null;
  if (day <= addDays(deadline, toleranceDays)) return 'terlambat';
  return 'sangat_terlambat';
}

export const QUARTER_ROMAN = ['I', 'II', 'III', 'IV'] as const;

export function quarterLabel(q: Pick<Quarter, 'number' | 'fiscalYear'>, withYear = true): string {
  return `TW ${QUARTER_ROMAN[q.number - 1]}${withYear ? ` ${q.fiscalYear}` : ''}`;
}

/** The quarter (of any fiscal year present) whose range contains `day`. */
export function quarterContaining(quarters: Quarter[], day: ISODate): Quarter | undefined {
  return quarters.find((q) => q.startsOn <= day && day <= q.endsOn);
}
