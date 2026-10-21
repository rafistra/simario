import vectors from '@vectors/access.json';
import type { DB } from '@/data/db';
import { loadVectors } from '@/test/vectors';
import {
  assignedLini2,
  canReadPosition,
  checkAction,
  effectiveRoleIds,
  finalisingOfficial,
  hasPermission,
  holdingsOf,
  lini1PositionsInScope,
  participationHolding,
  permissionScopes,
  positionLine,
} from './access';

// Shared with backend/tests/domain/test_access_vectors.py (spec §4.9).
type In = Record<string, never> & {
  db: DB;
  userId: string;
  today: string;
  code: number;
  fiscalYear: number | null;
  lini1PositionId: string;
  quarterId: string;
  actingPositionId: string;
  positionId: string;
};

const RUN: Record<string, (i: In) => unknown> = {
  holdingsOf: (i) => holdingsOf(i.db, i.userId, i.today),
  effectiveRoleIds: (i) => effectiveRoleIds(i.db, i.userId, i.today),
  permissionScopes: (i) =>
    [...permissionScopes(i.db, i.userId, i.today).entries()].sort((a, b) => a[0] - b[0]),
  hasPermission: (i) => hasPermission(i.db, i.userId, i.code, i.today),
  lini1PositionsInScope: (i) =>
    lini1PositionsInScope(i.db, i.userId, i.today, i.code, i.fiscalYear ?? undefined),
  canReadPosition: (i) =>
    canReadPosition(i.db, i.userId, i.lini1PositionId, i.today, i.fiscalYear ?? undefined),
  participationHolding: (i) =>
    participationHolding(i.db, i.userId, i.lini1PositionId, i.quarterId, i.today),
  checkAction: (i) => checkAction(i.db, i.userId, i.code, i.actingPositionId, i.today),
  finalisingOfficial: (i) => finalisingOfficial(i.db, i.positionId, i.today)?.id ?? null,
  positionLine: (i) => positionLine(i.db, i.positionId),
  assignedLini2: (i) => assignedLini2(i.db, i.lini1PositionId, i.quarterId),
};

const rules = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

describe.each(Object.entries(rules))('shared vectors: %s', (rule, cases) => {
  it.each(cases)('$name', ({ input, expected }) => {
    expect(RUN[rule]!(input as In)).toEqual(expected);
  });
});
