import vectors from '@vectors/assessment.json';
import type { DB } from '@/test/fake/db';
import { loadVectors } from '@/test/vectors';
import {
  assessmentFrozen,
  bandVersionFor,
  comparisonStatusAt,
  evaluateOpening,
  explanationLateness,
  finaliseLateness,
  isRecurring,
  lini3Overdue,
  optionLabelOf,
  pendingExplanationLateness,
  predicateIn,
  previousRiskQuarter,
  quarterRisks,
  windowOpen,
} from './rules/assessment';
import { expectedLini3 } from './rules/board';
import { compareAssessments } from './rules/comparison';
import type { Assessment } from './types';

// Shared with backend/tests/domain/test_assessment_vectors.py (spec §4.9).
const v = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

type In = { db: DB; today: string; at: string; quarterId: string; scores: (number | null)[] };
const q27 = (db: DB) => db.quarters.filter((q) => q.fiscalYear >= 2026);
const quarter = (db: DB, id: string) => db.quarters.find((q) => q.id === id)!;
const yearOf = (db: DB, rqId: string) =>
  quarter(db, db.riskQuarters.find((x) => x.id === rqId)!.quarterId).fiscalYear;

describe('shared vectors: assessment', () => {
  it.each(v.windowOpen!)('windowOpen $name', ({ input, expected }) => {
    const { db, today } = input as In;
    const got = Object.fromEntries(
      q27(db).map((q) => [q.id, [windowOpen(q, 1, today), windowOpen(q, 3, today)]]),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.bandVersionFor!)('bandVersionFor $name', ({ input, expected }) => {
    const { db } = input as In;
    expect(Object.fromEntries(db.quarters.map((q) => [q.id, bandVersionFor(db, q)]))).toEqual(
      expected,
    );
  });
  it.each(v.predicateIn!)('predicateIn $name', ({ input, expected }) => {
    const { db, quarterId, scores } = input as In;
    expect(scores.map((s) => predicateIn(db, quarter(db, quarterId), s))).toEqual(expected);
  });
  it.each(v.optionLabelOf!)('optionLabelOf $name', ({ input, expected }) => {
    const { db, values } = input as unknown as { db: DB; values: (number | null)[] };
    const got = Object.fromEntries(
      Object.keys(expected as object).map((ver) => [
        ver,
        values.map((s) => optionLabelOf(db, ver, s)),
      ]),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.quarterRisks!)('quarterRisks $name', ({ input, expected }) => {
    const { db } = input as In;
    const got = Object.fromEntries(
      Object.keys(expected as object).map((key) => {
        const [pos, qid] = key.split('|') as [string, string];
        return [key, quarterRisks(db, pos, quarter(db, qid)).map((x) => x.rq.id)];
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.assessmentFrozen!)('assessmentFrozen $name', ({ input, expected }) => {
    const { db, at } = input as In;
    expect(
      Object.fromEntries(db.assessments.map((a) => [a.id, assessmentFrozen(db, a, at)])),
    ).toEqual(expected);
  });
  it.each(v.comparisonStatusAt!)('comparisonStatusAt $name', ({ input, expected }) => {
    const { db, at } = input as In;
    expect(
      Object.fromEntries(db.riskQuarters.map((rq) => [rq.id, comparisonStatusAt(db, rq, at)])),
    ).toEqual(expected);
  });
  it.each(v.finaliseLateness!)('finaliseLateness $name', ({ input, expected }) => {
    const { db, at } = input as In;
    const got = Object.fromEntries(
      q27(db).map((q) => [q.id, [finaliseLateness(db, q, 1, at), finaliseLateness(db, q, 3, at)]]),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.explanationLateness!)('explanationLateness $name', ({ input, expected }) => {
    const { db, at } = input as In;
    const got = Object.fromEntries(
      db.results.map((r) => [r.id, explanationLateness(db, r, at, yearOf(db, r.riskQuarterId))]),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.pendingExplanationLateness!)(
    'pendingExplanationLateness $name',
    ({ input, expected }) => {
      const { db, today } = input as In;
      const got = Object.fromEntries(
        db.results.map((r) => [
          r.id,
          pendingExplanationLateness(db, r, today, yearOf(db, r.riskQuarterId)),
        ]),
      );
      expect(got).toEqual(expected);
    },
  );
  it.each(v.lini3Overdue!)('lini3Overdue $name', ({ input, expected }) => {
    const { db, today } = input as In;
    const got = Object.fromEntries(
      db.riskQuarters.flatMap((rq) => {
        const q = quarter(db, rq.quarterId);
        return expectedLini3(db, q.id).map((p) => [
          `${rq.id}|${p}`,
          lini3Overdue(
            q,
            db.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorPositionId === p),
            today,
          ),
        ]);
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.previousRiskQuarter!)('previousRiskQuarter $name', ({ input, expected }) => {
    const { db } = input as In;
    expect(
      Object.fromEntries(
        db.riskQuarters.map((rq) => [rq.id, previousRiskQuarter(db, rq)?.id ?? null]),
      ),
    ).toEqual(expected);
  });
  it.each(v.isRecurring!)('isRecurring $name', ({ input, expected }) => {
    const { db } = input as In;
    expect(Object.fromEntries(db.riskQuarters.map((rq) => [rq.id, isRecurring(db, rq)]))).toEqual(
      expected,
    );
  });
  it.each(v.evaluateOpening!)('evaluateOpening $name', ({ input, expected }) => {
    const { db: fx, at } = input as In;
    const d = structuredClone(fx);
    const got: Record<string, unknown> = {};
    for (const rq of [...d.riskQuarters]) {
      const before = d.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorLine === 1);
      const prevStatus = before?.status ?? null;
      const opened = evaluateOpening(d, rq, at);
      if (!opened.length) {
        got[rq.id] = null;
        continue;
      }
      const after = d.assessments.find((a) => a.riskQuarterId === rq.id && a.assessorLine === 1)!;
      const live = d.riskQuarters.find((x) => x.id === rq.id)!;
      got[rq.id] = {
        opened: opened.map((r) => ({
          lini3PositionId: r.lini3PositionId,
          openedAt: r.openedAt,
          result: r.result,
          lini1Higher: r.lini1Higher,
          explanationRequired: r.explanationRequired,
          explanationStatus: r.explanationStatus,
          explanationDueOn: r.explanationDueOn,
        })),
        lini1:
          after.status === 'not_assessed' && prevStatus !== 'not_assessed'
            ? {
                create: !before,
                assessorPositionId: after.assessorPositionId,
                scoreBandVersionId: after.scoreBandVersionId,
              }
            : null,
        comparisonStatus: live.comparisonStatus,
        firstOpenedAt: live.firstOpenedAt,
      };
    }
    expect(got).toEqual(expected);
  });
  it.each(v.compareAssessments!)('compareAssessments $name', ({ input, expected }) => {
    const { pair } = input as { pair: { lini1: Assessment | null; lini3: Assessment } };
    expect(compareAssessments(pair.lini1 ?? undefined, pair.lini3)).toEqual(expected);
  });
});
