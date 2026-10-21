import type { DB } from '@/test/fake/db';

// Every collection of the rule database (the object type makes the list exhaustive).
const KEYS: Record<keyof DB, true> = {
  orgUnits: true,
  positionTypes: true,
  positions: true,
  users: true,
  occupancies: true,
  delegates: true,
  roles: true,
  rolePermissions: true,
  userRoles: true,
  assignments: true,
  fiscalYears: true,
  quarters: true,
  quarterAssessors: true,
  stages: true,
  dataUmumForms: true,
  riskTemplates: true,
  mitigationTemplates: true,
  proposals: true,
  scoreBandVersions: true,
  scoreBands: true,
  scoreOptions: true,
  registers: true,
  declarations: true,
  risks: true,
  mitigations: true,
  comments: true,
  subscriptions: true,
  threadViews: true,
  riskQuarters: true,
  assessments: true,
  results: true,
  attachments: true,
  snapshots: true,
  notifications: true,
  audit: true,
  preferences: true,
};

/** A database with every collection empty; CollectionGate overlays the loaded collections. */
export function emptyDb(): DB {
  return Object.fromEntries(Object.keys(KEYS).map((k) => [k, []])) as unknown as DB;
}
