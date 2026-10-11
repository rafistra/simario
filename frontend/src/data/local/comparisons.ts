// Comparison opening, recurrence detection, and their notifications (§2.5, FR-NIL-007/009/011,
// FR-NTF-007/008/009). Runs as a scheduled task and right after every finalise.

import {
  evaluateOpening,
  holdersOf,
  isRecurring,
  lini2For,
  previousRiskQuarter,
  twLabel,
} from '@/domain/rules/assessment';
import { expectedLini3 } from '@/domain/rules/board';
import type { ComparisonResult, ISODateTime, RiskQuarter } from '@/domain/types';
import { formatDate } from '@/lib/format';
import type { DB } from '../db';
import { writeNotification } from './writers';

const short = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);

function positionOf(d: DB, rq: RiskQuarter) {
  const risk = d.risks.find((r) => r.id === rq.registerRiskId)!;
  const reg = d.registers.find((r) => r.id === risk.registerId)!;
  return { risk, reg, position: d.positions.find((p) => p.id === reg.positionId)! };
}

/**
 * Evaluates opening for the given risk-quarters (all when omitted), then recurrence, then
 * notifications. Idempotent: nothing happens when no result opens.
 */
export function runComparisons(d: DB, at: ISODateTime, rqIds?: string[]) {
  const today = at.slice(0, 10);
  const archived = new Set(d.fiscalYears.filter((f) => f.status === 'archived').map((f) => f.year));
  const candidates = d.riskQuarters.filter((rq) => {
    if (rqIds && !rqIds.includes(rq.id)) return false;
    const q = d.quarters.find((x) => x.id === rq.quarterId);
    return !!q && !archived.has(q.fiscalYear) && q.lini3OpensOn <= today;
  });
  const opened = new Map<string, ComparisonResult[]>(); // rqId → newly opened
  for (const rq of candidates) {
    const res = evaluateOpening(d, rq, at);
    if (res.length) opened.set(rq.id, res);
  }
  if (opened.size === 0) return;

  // FR-NIL-011: recurrence for opened risks and the following quarter of the same lineage.
  const recheck = new Set<string>(opened.keys());
  for (const rqId of opened.keys()) {
    const rq = d.riskQuarters.find((x) => x.id === rqId)!;
    const next = d.riskQuarters.find((x) => {
      const prev = previousRiskQuarter(d, x);
      return prev?.id === rq.id;
    });
    if (next && d.results.some((r) => r.riskQuarterId === next.id)) recheck.add(next.id);
  }
  for (const rqId of recheck) {
    const rq = d.riskQuarters.find((x) => x.id === rqId)!;
    const now = isRecurring(d, rq);
    if (now && !rq.recurring) {
      rq.recurring = true;
      const { risk, reg } = positionOf(d, rq);
      const q = d.quarters.find((x) => x.id === rq.quarterId)!;
      const ownOpened = new Set(
        d.results.filter((r) => r.riskQuarterId === rq.id).map((r) => r.lini3PositionId),
      );
      const recipients = new Set([
        ...holdersOf(d, [reg.positionId], today),
        ...holdersOf(d, lini2For(d, reg.positionId, q.id).slice(0, 1), today),
        // VIS-9: only Lini 3 holders whose own result for this risk has opened.
        ...holdersOf(d, [...ownOpened], today),
      ]);
      for (const userId of recipients)
        writeNotification(d, {
          userId,
          kind: 'recurring',
          text: `Risiko '${short(risk.descriptionSnapshot)}' dinilai Kurang Terkendali oleh Lini 3 dua triwulan berturut-turut`,
          targetUrl: `/jabatan/${reg.positionId}/papan/${reg.fiscalYear}/risiko/${risk.id}`,
          createdAt: at,
          eventKey: `recurring:${rq.id}`,
        });
    } else if (!now && rq.recurring && opened.has(rq.id)) rq.recurring = false;
  }

  // FR-NTF-007 and FR-NTF-009, grouped per position and quarter.
  const groups = new Map<string, { positionId: string; quarterId: string; rqs: string[] }>();
  for (const rqId of opened.keys()) {
    const rq = d.riskQuarters.find((x) => x.id === rqId)!;
    const { reg } = positionOf(d, rq);
    const key = `${reg.positionId}|${rq.quarterId}`;
    const g = groups.get(key) ?? { positionId: reg.positionId, quarterId: rq.quarterId, rqs: [] };
    g.rqs.push(rqId);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const q = d.quarters.find((x) => x.id === g.quarterId)!;
    const position = d.positions.find((p) => p.id === g.positionId)!;
    const fresh = g.rqs.flatMap((id) => opened.get(id)!);
    const url = `/jabatan/${g.positionId}/penilaian/${q.fiscalYear}/${q.number}`;
    const count = (results: ComparisonResult[]) =>
      `${results.filter((r) => r.result === 'sesuai').length} Sesuai, ${results.filter((r) => r.result === 'tidak_sesuai').length} Tidak Sesuai`;
    const message = (results: ComparisonResult[]) =>
      `Perbandingan ${twLabel(q)} ${position.name} dibuka: ${count(results)}`;
    const everyone = new Set([
      ...holdersOf(d, [g.positionId], today),
      ...holdersOf(d, lini2For(d, g.positionId, q.id), today),
    ]);
    for (const userId of everyone)
      writeNotification(d, {
        userId,
        kind: 'comparison_opened',
        text: message(fresh),
        targetUrl: url,
        createdAt: at,
        eventKey: `cmp:${g.positionId}:${q.id}:${at}`,
      });
    for (const l3 of expectedLini3(d, q.id)) {
      // VIS-9: a Lini 3 position counts only risks whose own result has opened.
      const own = fresh.filter((r) =>
        d.results.some((x) => x.riskQuarterId === r.riskQuarterId && x.lini3PositionId === l3),
      );
      if (own.length === 0) continue;
      for (const userId of holdersOf(d, [l3], today))
        if (!everyone.has(userId))
          writeNotification(d, {
            userId,
            kind: 'comparison_opened',
            text: message(own),
            targetUrl: url,
            createdAt: at,
            eventKey: `cmp:${g.positionId}:${q.id}:${at}`,
          });
    }
    const mandatory = fresh.filter((r) => r.explanationRequired);
    if (mandatory.length) {
      const due = mandatory.map((r) => r.explanationDueOn!).sort()[0]!;
      const risks = new Set(mandatory.map((r) => r.riskQuarterId)).size;
      for (const userId of holdersOf(d, [g.positionId], today))
        writeNotification(d, {
          userId,
          kind: 'explanation_due',
          text: `${risks} risiko memerlukan penjelasan paling lambat ${formatDate(due)}`,
          targetUrl: url,
          createdAt: at,
          eventKey: `expl:${g.positionId}:${q.id}:${at}`,
        });
    }
  }
}
