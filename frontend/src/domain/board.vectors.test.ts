import boardVectors from '@vectors/board.json';
import visibilityVectors from '@vectors/visibility.json';
import type { DB } from '@/test/fake/db';
import { loadVectors } from '@/test/vectors';
import {
  canEditComment,
  expectedLini3,
  fileProblem,
  isQuiet,
  lastActivity,
  latestOpened,
  openedResults,
  postingQuarter,
  relatedQuarters,
  storageUsed,
  threadParticipants,
} from './rules/board';
import {
  canSeeAssessment,
  canSeeAttachment,
  isLateDirectorate,
  openedLini3,
  viewerFor,
} from './rules/visibility';

// Shared with backend/tests/domain/test_board_vectors.py (spec §4.9).
const board = loadVectors(boardVectors as Parameters<typeof loadVectors>[0]);
const vis = loadVectors(visibilityVectors as Parameters<typeof loadVectors>[0]);

type In = { db: DB; userId: string; today: string; at: string };
const opened = (db: DB, rqId: string, at: string) => openedLini3(openedResults(db, rqId, at), rqId);

describe('shared vectors: visibility', () => {
  it.each(vis.viewerFor!)('viewerFor $name', ({ input, expected }) => {
    const { db, userId, today } = input as In;
    expect(viewerFor(db, userId, today)).toEqual(expected);
  });
  it.each(vis.canSeeAssessment!)('canSeeAssessment $name', ({ input, expected }) => {
    const { db, userId, today, at } = input as In;
    const v = viewerFor(db, userId, today);
    const got = Object.fromEntries(
      db.assessments.map((a) => {
        const rq = db.riskQuarters.find((x) => x.id === a.riskQuarterId)!;
        return [
          a.id,
          canSeeAssessment(v, a, opened(db, rq.id, at), expectedLini3(db, rq.quarterId)),
        ];
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(vis.isLateDirectorate!)('isLateDirectorate $name', ({ input, expected }) => {
    const { db, userId, today, at } = input as In;
    const v = viewerFor(db, userId, today);
    const got = Object.fromEntries(
      db.riskQuarters.map((rq) => [
        rq.id,
        isLateDirectorate(v, opened(db, rq.id, at), expectedLini3(db, rq.quarterId)),
      ]),
    );
    expect(got).toEqual(expected);
  });
  it.each(vis.canSeeAttachment!)('canSeeAttachment $name', ({ input, expected }) => {
    const { db, userId, today } = input as In;
    const v = viewerFor(db, userId, today);
    expect(Object.fromEntries(db.attachments.map((a) => [a.id, canSeeAttachment(v, a)]))).toEqual(
      expected,
    );
  });
});

describe('shared vectors: board', () => {
  it.each(board.postingQuarter!)('postingQuarter $name', ({ input, expected }) => {
    const { db, fiscalYear, today } = input as { db: DB; fiscalYear: number; today: string };
    expect(postingQuarter(db, fiscalYear, today)?.id ?? null).toEqual(expected);
  });
  it.each(board.openedResults!)('openedResults', ({ input, expected }) => {
    const { db, at } = input as In;
    const got = Object.fromEntries(
      db.riskQuarters.map((rq) => [rq.id, openedResults(db, rq.id, at).map((r) => r.id)]),
    );
    expect(got).toEqual(expected);
  });
  it.each(board.expectedLini3!)('expectedLini3', ({ input, expected }) => {
    const { db } = input as In;
    expect(Object.fromEntries(db.quarters.map((q) => [q.id, expectedLini3(db, q.id)]))).toEqual(
      expected,
    );
  });
  it.each(board.isQuiet!)('isQuiet', ({ input, expected }) => {
    const { db, today } = input as In;
    const q = postingQuarter(db, 2027, today);
    expect(Object.fromEntries(db.risks.map((r) => [r.id, isQuiet(db, r, q)]))).toEqual(expected);
  });
  it.each(board.lastActivity!)('lastActivity', ({ input, expected }) => {
    const { db } = input as In;
    expect(Object.fromEntries(db.risks.map((r) => [r.id, lastActivity(db, r.id)]))).toEqual(
      expected,
    );
  });
  it.each(board.relatedQuarters!)('relatedQuarters', ({ input, expected }) => {
    const { db, today, at } = input as In;
    const q = postingQuarter(db, 2027, today)!;
    const got = Object.fromEntries(
      db.risks.map((r) => [r.id, relatedQuarters(db, r, q, at).map((x) => x.id)]),
    );
    expect(got).toEqual(expected);
  });
  it.each(board.latestOpened!)('latestOpened $name', ({ input, expected }) => {
    const { db, userId, today, at } = input as In;
    const v = viewerFor(db, userId, today);
    const got = Object.fromEntries(
      db.risks.map((r) => {
        const lo = latestOpened(db, v, r, at);
        return [
          r.id,
          lo && {
            quarterId: lo.quarter.id,
            hidden: lo.hidden,
            chips: lo.chips,
            tidakSesuai: lo.tidakSesuai,
            recurring: lo.recurring,
          },
        ];
      }),
    );
    expect(JSON.parse(JSON.stringify(got))).toEqual(expected);
  });
  it.each(board.threadParticipants!)('threadParticipants', ({ input, expected }) => {
    const { db, positionId, today } = input as In & { positionId: string };
    const got = Object.fromEntries(
      Object.keys(expected as object).map((qid) => [
        qid,
        threadParticipants(db, positionId, qid, today).map((p) => [
          p.userId,
          p.holding.positionId,
          p.holding.line,
        ]),
      ]),
    );
    expect(got).toEqual(expected);
  });
  it.each(board.storageUsed!)('storageUsed', ({ input, expected }) => {
    const { db, fiscalYear } = input as { db: DB; fiscalYear: number };
    expect(
      Object.fromEntries(db.positions.map((p) => [p.id, storageUsed(db, p.id, fiscalYear)])),
    ).toEqual(expected);
  });
  it.each(board.fileProblem!)('fileProblem $name', ({ input, expected }) => {
    const { name, size } = input as { name: string; size: number };
    expect(fileProblem(name, size)).toEqual(expected);
  });
  it.each(board.canEditComment!)('canEditComment $name', ({ input, expected }) => {
    const { db, commentId, userId, at } = input as In & { commentId: string };
    expect(
      canEditComment(
        db.comments.find((c) => c.id === commentId)!,
        userId,
        at,
      ),
    ).toBe(expected);
  });
});
