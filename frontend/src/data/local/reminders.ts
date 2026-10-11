// Deadline reminders — FR-NTF-005, 006, 009 (H-1), 012. Idempotent per event key; an event older
// than a few days is not raised retroactively (e.g. when the clock jumps far ahead).

import { addDays, daysBetween } from '@/domain/calendar';
import { holdersOf, quarterRisks, twLabel } from '@/domain/rules/assessment';
import { expectedLini3 } from '@/domain/rules/board';
import type { ISODateTime } from '@/domain/types';
import { formatDate } from '@/lib/format';
import type { DB } from '../db';
import { writeNotification } from './writers';

const RECENT_DAYS = 3;

/** Reminder moments: window opening, H-7 and H-1 before the deadline. */
function moments(opensOn: string, deadline: string) {
  return [
    { key: 'buka', day: opensOn },
    { key: 'h7', day: addDays(deadline, -7) },
    { key: 'h1', day: addDays(deadline, -1) },
  ];
}

export function runReminders(d: DB, at: ISODateTime) {
  const today = at.slice(0, 10);
  const due = (day: string) => day <= today && daysBetween(day, today) <= RECENT_DAYS;
  const open = new Set(d.fiscalYears.filter((f) => f.status !== 'archived').map((f) => f.year));
  const lini1 = d.positions.filter(
    (p) => p.active && d.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1,
  );

  for (const q of d.quarters.filter((x) => open.has(x.fiscalYear))) {
    // FR-NTF-005 — Lini 1 holders of each position, while unfinalised risks remain.
    for (const m of moments(q.lini1OpensOn, q.lini1Deadline)) {
      if (!due(m.day) || today > q.lini1Deadline) continue;
      for (const p of lini1) {
        const items = quarterRisks(d, p.id, q);
        if (items.length === 0) continue;
        const done = items.filter(({ rq }) => {
          const a = d.assessments.find((x) => x.riskQuarterId === rq.id && x.assessorLine === 1);
          return a?.status === 'final' || a?.status === 'not_assessed';
        }).length;
        if (done === items.length) continue;
        for (const userId of holdersOf(d, [p.id], today))
          writeNotification(d, {
            userId,
            kind: 'deadline',
            text: `Penilaian ${twLabel(q)} ${p.name}: tenggat ${formatDate(q.lini1Deadline)}, ${done} dari ${items.length} risiko sudah dinilai`,
            targetUrl: `/jabatan/${p.id}/penilaian/${q.fiscalYear}/${q.number}`,
            createdAt: at,
            eventKey: `ntf5:${p.id}:${q.id}:${m.key}`,
          });
      }
    }
    // FR-NTF-006 — Lini 3 holders of each expected directorate.
    for (const m of moments(q.lini3OpensOn, q.lini3Deadline)) {
      if (!due(m.day) || today > q.lini3Deadline) continue;
      for (const dir of expectedLini3(d, q.id)) {
        const items = lini1.flatMap((p) => quarterRisks(d, p.id, q));
        if (items.length === 0) continue;
        const done = items.filter(
          ({ rq }) =>
            d.assessments.find((x) => x.riskQuarterId === rq.id && x.assessorPositionId === dir)
              ?.status === 'final',
        ).length;
        if (done === items.length) continue;
        for (const userId of holdersOf(d, [dir], today))
          writeNotification(d, {
            userId,
            kind: 'deadline',
            text: `Penilaian Lini 3 ${twLabel(q)}: ${done} dari ${items.length} risiko sudah dinilai`,
            targetUrl: '/penilaian',
            createdAt: at,
            eventKey: `ntf6:${dir}:${q.id}:${m.key}`,
          });
      }
    }
  }

  // FR-NTF-009 — H-1 before a mandatory explanation's deadline when not sent.
  const pending = d.results.filter(
    (r) =>
      r.explanationRequired &&
      r.explanationStatus !== 'sent' &&
      r.explanationStatus !== 'not_sent' &&
      r.explanationDueOn &&
      r.openedAt <= at,
  );
  const byPosDue = new Map<
    string,
    { positionId: string; due: string; quarterId: string; risks: Set<string> }
  >();
  for (const r of pending) {
    if (!due(addDays(r.explanationDueOn!, -1)) || today > r.explanationDueOn!) continue;
    const rq = d.riskQuarters.find((x) => x.id === r.riskQuarterId)!;
    const risk = d.risks.find((x) => x.id === rq.registerRiskId)!;
    const reg = d.registers.find((x) => x.id === risk.registerId)!;
    if (!open.has(reg.fiscalYear)) continue;
    const key = `${reg.positionId}|${r.explanationDueOn}`;
    const g = byPosDue.get(key) ?? {
      positionId: reg.positionId,
      due: r.explanationDueOn!,
      quarterId: rq.quarterId,
      risks: new Set<string>(),
    };
    g.risks.add(rq.id);
    byPosDue.set(key, g);
  }
  for (const g of byPosDue.values()) {
    const q = d.quarters.find((x) => x.id === g.quarterId)!;
    for (const userId of holdersOf(d, [g.positionId], today))
      writeNotification(d, {
        userId,
        kind: 'explanation_required',
        text: `${g.risks.size} risiko memerlukan penjelasan paling lambat ${formatDate(g.due)}`,
        targetUrl: `/jabatan/${g.positionId}/penilaian/${q.fiscalYear}/${q.number}`,
        createdAt: at,
        eventKey: `ntf9h1:${g.positionId}:${g.due}`,
      });
  }

  // FR-NTF-012 — 14 days before the projected archive date (hard limit, §2.5).
  for (const fy of d.fiscalYears.filter((f) => f.status !== 'archived')) {
    const tw4 = d.quarters.find((q) => q.fiscalYear === fy.year && q.number === 4);
    if (!tw4) continue;
    const projected = addDays(tw4.lini3Deadline, fy.toleranceDays + fy.archiveGraceDays);
    if (!due(addDays(projected, -14)) || today > projected) continue;
    for (const p of lini1)
      for (const userId of holdersOf(d, [p.id], today))
        writeNotification(d, {
          userId,
          kind: 'archive',
          text: `Utas TA ${fy.year} akan diarsipkan sekitar ${formatDate(projected)}`,
          targetUrl: `/jabatan/${p.id}/papan/${fy.year}`,
          createdAt: at,
          eventKey: `ntf12:${fy.year}:${p.id}`,
        });
  }
}
