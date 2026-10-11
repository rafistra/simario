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
  return structuredClone({
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
}
