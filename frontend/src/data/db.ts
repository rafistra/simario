// The whole prototype database: one array per entity (PRD §2.8.1). Persisted collection by
// collection to localStorage under `simario:v1:<collection>`.

import type {
  Assessment,
  Attachment,
  AuditLog,
  Comment,
  ComparisonResult,
  DataUmumForm,
  FiscalYear,
  MitigationTemplate,
  MonitoringAssignment,
  Notification,
  OrgUnit,
  Position,
  PositionDelegate,
  PositionOccupancy,
  PositionType,
  PrintSnapshot,
  Quarter,
  QuarterAssessor,
  Register,
  RegisterMitigation,
  RegisterRisk,
  RegisterStageDeclaration,
  RiskProposal,
  RiskQuarter,
  RiskTemplate,
  Role,
  RolePermission,
  ScoreBand,
  ScoreBandVersion,
  Stage,
  ThreadSubscription,
  ThreadView,
  User,
  UserPreference,
  UserRole,
} from '@/domain/types';

export interface DB {
  orgUnits: OrgUnit[];
  positionTypes: PositionType[];
  positions: Position[];
  users: User[];
  occupancies: PositionOccupancy[];
  delegates: PositionDelegate[];
  roles: Role[];
  rolePermissions: RolePermission[];
  userRoles: UserRole[];
  assignments: MonitoringAssignment[];
  fiscalYears: FiscalYear[];
  quarters: Quarter[];
  quarterAssessors: QuarterAssessor[];
  stages: Stage[];
  dataUmumForms: DataUmumForm[];
  riskTemplates: RiskTemplate[];
  mitigationTemplates: MitigationTemplate[];
  proposals: RiskProposal[];
  scoreBandVersions: ScoreBandVersion[];
  scoreBands: ScoreBand[];
  registers: Register[];
  declarations: RegisterStageDeclaration[];
  risks: RegisterRisk[];
  mitigations: RegisterMitigation[];
  comments: Comment[];
  subscriptions: ThreadSubscription[];
  threadViews: ThreadView[];
  riskQuarters: RiskQuarter[];
  assessments: Assessment[];
  results: ComparisonResult[];
  attachments: Attachment[];
  snapshots: PrintSnapshot[];
  notifications: Notification[];
  audit: AuditLog[];
  preferences: UserPreference[];
}

export type Collection = keyof DB;

export const COLLECTIONS: Collection[] = [
  'orgUnits',
  'positionTypes',
  'positions',
  'users',
  'occupancies',
  'delegates',
  'roles',
  'rolePermissions',
  'userRoles',
  'assignments',
  'fiscalYears',
  'quarters',
  'quarterAssessors',
  'stages',
  'dataUmumForms',
  'riskTemplates',
  'mitigationTemplates',
  'proposals',
  'scoreBandVersions',
  'scoreBands',
  'registers',
  'declarations',
  'risks',
  'mitigations',
  'comments',
  'subscriptions',
  'threadViews',
  'riskQuarters',
  'assessments',
  'results',
  'attachments',
  'snapshots',
  'notifications',
  'audit',
  'preferences',
];

/** Bump when the seed or entity shapes change: stored data is then re-seeded. */
export const SCHEMA_VERSION = 5;

export const STORAGE_PREFIX = 'simario:v1:';

export function emptyDb(): DB {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as DB;
}
