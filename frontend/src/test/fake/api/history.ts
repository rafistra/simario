// Risk history — PRD ch. 8 (FR-RWY-001 … 006). Read model with VIS-1/2/7/9 applied here.

import { toDisplay, type AssessmentDisplay } from '@/domain/rules/assessment';
import { expectedLini3, openedResults } from '@/domain/rules/board';
import { inactiveLabel, assessedInQuarter, registerStages } from '@/domain/rules/register';
import { lembarMutu, type LembarMutu } from '@/domain/rules/sheets';
import { isLateDirectorate, viewerFor, type Viewer } from '@/domain/rules/visibility';
import type {
  ComparisonResult,
  ISODateTime,
  Quarter,
  RegisterRisk,
  RiskType,
  Stage,
} from '@/domain/types';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { assertCanRead } from '../local/actor';
import { ApiError, call } from '../local/call';
import { getDb } from '../local/store';

export interface ChipView {
  positionId: string;
  label: string;
  line: 1 | 3;
  kind: 'score' | 'belum_relevan' | 'tidak_dinilai' | 'menunggu';
  assessment: AssessmentDisplay | null;
  result: ComparisonResult | null;
  name: string;
}

export interface HistoryCell {
  quarter: Quarter;
  /** none = risk not assessed in that quarter ("—"); waiting = comparison not open (VIS-1). */
  state: 'none' | 'waiting' | 'open';
  chips: ChipView[];
  summary: 'sesuai' | 'tidak_sesuai' | 'partial' | 'incomparable' | null;
  recurring: boolean;
  riskId: string;
  positionId: string;
}

export interface HistoryRow {
  risk: RegisterRisk;
  stage: Stage;
  stageIndex: number;
  riskType: RiskType;
  inactiveLabel: string | null;
  recurring: boolean;
  tidakSesuai: boolean;
  cells: HistoryCell[];
  /** Same lineage in other fiscal years (FR-RWY-004). */
  otherYears: { fiscalYear: number; risk: RegisterRisk; cells: HistoryCell[] }[];
}

export interface HistoryView {
  fiscalYear: number;
  years: number[];
  quarters: Quarter[];
  mutu: LembarMutu[];
  rows: HistoryRow[];
  stages: { id: string; label: string }[];
  published: boolean;
}

function cellFor(
  db: DB,
  viewer: Viewer,
  risk: RegisterRisk,
  positionId: string,
  quarter: Quarter,
  at: ISODateTime,
): HistoryCell {
  const base = {
    quarter,
    chips: [] as ChipView[],
    summary: null,
    recurring: false,
    riskId: risk.id,
    positionId,
  };
  const rq = db.riskQuarters.find(
    (x) => x.registerRiskId === risk.id && x.quarterId === quarter.id,
  );
  if (!rq || !assessedInQuarter(db, risk, quarter)) return { ...base, state: 'none' };
  const expected = expectedLini3(db, quarter.id);
  const opened = openedResults(db, rq.id, at);
  const openedSet = new Set(opened.map((r) => r.lini3PositionId));
  const late = !viewer.blindViewGranted && isLateDirectorate(viewer, openedSet, expected);
  if (opened.length === 0 || late) return { ...base, state: 'waiting' };
  const pos = (id: string) => db.positions.find((p) => p.id === id);
  const assess = (id: string) =>
    db.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorPositionId === id) ?? null;
  const l1 = assess(positionId);
  const chips: ChipView[] = [
    {
      positionId,
      label: 'L1',
      line: 1,
      kind:
        !l1 || l1.status === 'not_assessed'
          ? 'tidak_dinilai'
          : l1.notRelevant
            ? 'belum_relevan'
            : 'score',
      assessment: l1 ? toDisplay(db, l1) : null,
      result: null,
      name: pos(positionId)?.name ?? '',
    },
    ...expected.map<ChipView>((p) => {
      const r = opened.find((x) => x.lini3PositionId === p) ?? null;
      const a = r ? assess(p) : null;
      return {
        positionId: p,
        label: pos(p)?.shortName ?? pos(p)?.code ?? '',
        line: 3,
        kind: !r ? 'menunggu' : a?.status === 'not_assessed' ? 'tidak_dinilai' : 'score',
        assessment: a ? toDisplay(db, a) : null,
        result: r,
        name: pos(p)?.name ?? '',
      };
    }),
  ];
  const summary = opened.some((r) => r.result === 'tidak_sesuai')
    ? 'tidak_sesuai'
    : opened.length < expected.length
      ? 'partial'
      : opened.every((r) => r.result === 'incomparable')
        ? 'incomparable'
        : 'sesuai';
  return { ...base, state: 'open', chips, summary, recurring: rq.recurring };
}

const isPublishedItem = (r: RegisterRisk) => r.status === 'active' || r.status === 'inactive';

export function buildHistory(
  db: DB,
  userId: string,
  positionId: string,
  fiscalYear: number,
  at: ISODateTime,
): HistoryView {
  assertCanRead(db, userId, positionId, at.slice(0, 10), fiscalYear);
  const viewer = viewerFor(db, userId, at.slice(0, 10));
  const quarters = db.quarters
    .filter((q) => q.fiscalYear === fiscalYear)
    .sort((a, b) => a.number - b.number);
  const registers = db.registers.filter((r) => r.positionId === positionId);
  const years = [...new Set(registers.map((r) => r.fiscalYear))].sort((a, b) => b - a);
  const reg = registers.find((r) => r.fiscalYear === fiscalYear);
  const published =
    !!reg && (reg.status === 'published' || reg.status === 'archived' || !!reg.publishedAt);
  const mutu = quarters.map((q) => lembarMutu(db, viewer, positionId, q, at));
  if (!reg || !published)
    return { fiscalYear, years, quarters, mutu, rows: [], stages: [], published: false };

  const allStages = registerStages(db, reg);
  const active = allStages.filter((s) => s.active);
  const types: RiskType[] = ['kinerja_anggaran', 'ketidakpatuhan', 'kecurangan'];
  const rows = db.risks
    .filter((r) => r.registerId === reg.id && isPublishedItem(r))
    .map<HistoryRow>((risk) => {
      const cells = quarters.map((q) => cellFor(db, viewer, risk, positionId, q, at));
      const otherYears = registers
        .filter((r) => r.fiscalYear !== fiscalYear)
        .flatMap((r) => {
          const other = db.risks.find(
            (x) => x.registerId === r.id && x.lineageId === risk.lineageId && isPublishedItem(x),
          );
          if (!other) return [];
          const qs = db.quarters
            .filter((q) => q.fiscalYear === r.fiscalYear)
            .sort((a, b) => a.number - b.number);
          return [
            {
              fiscalYear: r.fiscalYear,
              risk: other,
              cells: qs.map((q) => cellFor(db, viewer, other, positionId, q, at)),
            },
          ];
        })
        .sort((a, b) => b.fiscalYear - a.fiscalYear);
      const stage = db.stages.find((s) => s.id === risk.stageId)!;
      return {
        risk,
        stage,
        stageIndex: active.indexOf(stage) + 1,
        riskType: risk.riskType,
        inactiveLabel: risk.status === 'inactive' ? inactiveLabel(db, risk) : null,
        recurring: cells.some((c) => c.recurring),
        tidakSesuai: cells.some((c) => c.summary === 'tidak_sesuai'),
        cells,
        otherYears,
      };
    })
    .sort(
      (a, b) =>
        allStages.indexOf(a.stage) - allStages.indexOf(b.stage) ||
        types.indexOf(a.riskType) - types.indexOf(b.riskType) ||
        Number(a.risk.status === 'inactive') - Number(b.risk.status === 'inactive') ||
        a.risk.order - b.risk.order,
    );
  return {
    fiscalYear,
    years,
    quarters,
    mutu,
    rows,
    stages: allStages
      .filter((s) => rows.some((r) => r.stage.id === s.id))
      .map((s) => ({
        id: s.id,
        label: s.active ? `Tahap ${active.indexOf(s) + 1} · ${s.name}` : s.name,
      })),
    published: true,
  };
}

export const historyApi = {
  history: (positionId: string, fiscalYear: number) =>
    call(() => {
      const userId = useSession.getState().userId;
      if (!userId)
        throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
      return buildHistory(getDb(), userId, positionId, fiscalYear, now());
    }),
};
