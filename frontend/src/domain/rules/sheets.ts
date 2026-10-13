// Derived quarter summaries — FR-LBR-004 (Lembar Mutu), FR-RWY-001, FR-BRD-004. Neutral to the
// reader except VIS-9: a late directorate's viewer gets nothing about risks it is still blind on.

import type { DB } from '@/data/db';
import type { ISODateTime, Predicate, Quarter, RegisterRisk, RiskType } from '../types';
import { RISK_TYPES } from '../types';
import { predicateIn, quarterRisks } from './assessment';
import { expectedLini3, openedResults } from './board';
import { isLateDirectorate, type Viewer } from './visibility';

export interface MutuCell {
  /** null + opened=false → "Menunggu"; null + opened=true → "Tidak ada nilai". The average is internal (PRD v2.8). */
  predicate: Predicate | null;
  count: number;
  opened: boolean;
}

export interface MutuAssessor {
  positionId: string;
  label: string;
  line: 1 | 3;
}

export interface LembarMutu {
  quarter: Quarter;
  assessors: MutuAssessor[];
  rows: { riskType: RiskType; cells: MutuCell[] }[];
  sesuai: number;
  tidakSesuai: number;
  berulang: number;
  notAssessedL1: RegisterRisk[];
  /** Any result visible to this viewer has opened. */
  anyOpened: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function lembarMutu(
  db: DB,
  viewer: Viewer,
  positionId: string,
  quarter: Quarter,
  at: ISODateTime,
): LembarMutu {
  const expected = expectedLini3(db, quarter.id);
  const assessors: MutuAssessor[] = [
    { positionId, label: 'L1', line: 1 },
    ...expected.map((p) => {
      const pos = db.positions.find((x) => x.id === p);
      return { positionId: p, label: pos?.shortName ?? pos?.code ?? '', line: 3 as const };
    }),
  ];
  const items = quarterRisks(db, positionId, quarter)
    .map(({ risk, rq }) => {
      const opened = openedResults(db, rq.id, at);
      return {
        risk,
        rq,
        opened,
        late:
          !viewer.blindViewGranted &&
          isLateDirectorate(viewer, new Set(opened.map((r) => r.lini3PositionId)), expected),
      };
    })
    .filter((x) => !x.late);

  const rows = RISK_TYPES.map((riskType) => {
    const ofType = items.filter((x) => x.risk.riskType === riskType);
    const cells = assessors.map<MutuCell>((as) => {
      const relevant = ofType.filter((x) =>
        as.line === 1
          ? x.opened.length > 0
          : x.opened.some((r) => r.lini3PositionId === as.positionId),
      );
      const scores = relevant
        .map((x) =>
          db.assessments.find(
            (a) => a.riskQuarterId === x.rq.id && a.assessorPositionId === as.positionId,
          ),
        )
        .filter((a) => a && a.status === 'final' && !a.notRelevant && a.score !== null)
        .map((a) => a!.score!);
      const average = scores.length
        ? round1(scores.reduce((s, v) => s + v, 0) / scores.length)
        : null;
      return {
        predicate: average === null ? null : predicateIn(db, quarter, average),
        count: scores.length,
        opened: relevant.length > 0,
      };
    });
    return { riskType, cells };
  });

  const results = items.flatMap((x) => x.opened);
  return {
    quarter,
    assessors,
    rows,
    sesuai: results.filter((r) => r.result === 'sesuai').length,
    tidakSesuai: results.filter((r) => r.result === 'tidak_sesuai').length,
    berulang: items.filter((x) => x.opened.length > 0 && x.rq.recurring).length,
    notAssessedL1: items
      .filter(
        (x) =>
          x.opened.length > 0 &&
          db.assessments.find((a) => a.riskQuarterId === x.rq.id && a.assessorLine === 1)
            ?.status === 'not_assessed',
      )
      .map((x) => x.risk),
    anyOpened: results.length > 0,
  };
}

/** The most recent quarter of a position in which at least one result has opened (FR-BRD-004). */
export function latestOpenedQuarter(db: DB, positionId: string, at: ISODateTime): Quarter | null {
  const qs = [...db.quarters].sort((a, b) => b.fiscalYear - a.fiscalYear || b.number - a.number);
  return (
    qs.find((q) =>
      quarterRisks(db, positionId, q).some(({ rq }) => openedResults(db, rq.id, at).length > 0),
    ) ?? null
  );
}
