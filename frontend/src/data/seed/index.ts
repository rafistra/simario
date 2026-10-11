import { buildSheetPayload, snapshotNumber } from '@/domain/rules/sheetPayload';
import type { PrintSnapshot } from '@/domain/types';
import type { DB } from '../db';
import { audit, notifications } from './activity';
import { assessments, results, riskQuarters } from './assessments';
import { attachments, comments, subscriptions, threadViews } from './board';
import {
  assignments,
  delegates,
  occupancies,
  orgUnits,
  positions,
  positionTypes,
  rolePermissions,
  roles,
  userRoles,
  users,
} from './org';
import {
  dataUmumForms,
  fiscalYears,
  mitigationTemplates,
  quarterAssessors,
  quarters,
  riskTemplates,
  scoreBands,
  scoreBandVersions,
  stages,
} from './reference';
import { declarations, mitigations, proposals, registers, risks } from './registers';

export { staffDirectory } from './org';

/** A fresh, deep-copied seed database (callers may mutate it). */
export function buildSeed(): DB {
  const db: DB = structuredClone({
    orgUnits,
    positionTypes,
    positions,
    users,
    occupancies,
    delegates,
    roles,
    rolePermissions,
    userRoles,
    assignments,
    fiscalYears,
    quarters,
    quarterAssessors,
    stages,
    dataUmumForms,
    riskTemplates,
    mitigationTemplates,
    proposals,
    scoreBandVersions,
    scoreBands,
    registers,
    declarations,
    risks,
    mitigations,
    comments,
    subscriptions,
    threadViews,
    riskQuarters,
    assessments,
    results,
    attachments,
    snapshots: [],
    notifications,
    audit,
    preferences: [],
  });
  seedSnapshots(db);
  return db;
}

/**
 * Sheet snapshots (FR-LBR-006, 009): PPK A-1 TW IV 2026 frozen as Version 1 after its cycle closed,
 * and a provisional print of TW I 2027 made by Andi before the first automatic version.
 */
function seedSnapshots(db: DB) {
  const a1 = 'pos-ppk-a1';
  const add = (
    kind: PrintSnapshot['kind'],
    quarterId: string,
    at: string,
    trigger: PrintSnapshot['trigger'],
    userId: string | null,
  ) => {
    const q = db.quarters.find((x) => x.id === quarterId)!;
    db.snapshots.push({
      id: `snap-${db.snapshots.length + 1}`,
      number: snapshotNumber(db, kind, a1, q),
      positionId: a1,
      quarterId,
      kind,
      version: trigger === 'print' ? null : 1,
      trigger,
      isProvisional: trigger === 'print',
      supersededById: null,
      payload: buildSheetPayload(db, a1, q, at),
      createdByUserId: userId,
      createdAt: at,
    });
  };
  add('komunikasi', 'q-2026-4', '2027-01-14T00:00', 'auto_freeze', null);
  add('mutu', 'q-2026-4', '2027-01-14T00:00', 'auto_freeze', null);
  add('komunikasi', 'q-2027-1', '2027-04-03T10:00', 'print', 'usr-andi');
}
