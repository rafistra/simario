// Domain entities — PRD §2.8.1, camelCased. Dates are 'YYYY-MM-DD'; datetimes 'YYYY-MM-DDTHH:mm'
// in Indonesian local time (WITA) as used by the simulated clock.

export type ISODate = string;
export type ISODateTime = string;

export type Line = 1 | 2 | 3;
export type Capacity = 'pejabat' | 'operator';
export type Predicate = 'kurang' | 'cukup' | 'terkendali';
export type RiskType = 'kinerja_anggaran' | 'ketidakpatuhan' | 'kecurangan';

export const PREDICATE_LABEL: Record<Predicate, string> = {
  kurang: 'Kurang Terkendali',
  cukup: 'Cukup Terkendali',
  terkendali: 'Terkendali',
};

export const PREDICATE_RANK: Record<Predicate, number> = { kurang: 0, cukup: 1, terkendali: 2 };

export const RISK_TYPES: RiskType[] = ['kinerja_anggaran', 'ketidakpatuhan', 'kecurangan'];

export const RISK_TYPE_LABEL: Record<RiskType, string> = {
  kinerja_anggaran: 'Kinerja Anggaran',
  ketidakpatuhan: 'Ketidakpatuhan',
  kecurangan: 'Kecurangan',
};

/* ---------- Organisation, identity, access ---------- */

export interface OrgUnit {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface IdentityField {
  key: string;
  label: string;
  kind: 'text' | 'date';
}

export interface PositionType {
  id: string;
  code: string;
  name: string;
  line: Line;
  defaultRoleId: string;
  allowsMultipleOfficials: boolean;
  identitySchema: IdentityField[];
  hasTemplates: boolean;
  isBuiltin: boolean;
  active: boolean;
}

export interface Position {
  id: string;
  code: string;
  name: string;
  orgUnitId: string;
  positionTypeId: string;
  identity: Record<string, string>;
  active: boolean;
  deactivatedAt?: ISODateTime | null;
  deactivationReason?: string | null;
}

export interface User {
  id: string;
  nip: string;
  email: string;
  fullName: string;
  isLocalAccount: boolean;
  mustChangePassword: boolean;
  /** Prototype only: local-account password (test value from the seed). Never shown in the UI. */
  password?: string;
  createdVia: 'admin' | 'delegation';
  active: boolean;
  /** Work unit shown in user settings. */
  orgUnitId?: string;
}

/** Pejabat holding. */
export interface PositionOccupancy {
  id: string;
  positionId: string;
  userId: string;
  isFiller: boolean;
  startDate: ISODate;
  endDate: ISODate | null;
  decreeNo: string;
  decreeDate: ISODate;
  decreeFile: string | null;
}

export type DelegateEndReason =
  'revoked' | 'expired' | 'official_changed' | 'filler_changed' | 'promoted' | 'user_deactivated';

/** Operator holding. */
export interface PositionDelegate {
  id: string;
  positionId: string;
  userId: string;
  appointedByOccupancyId: string;
  letterNo: string;
  letterDate: ISODate;
  letterFile: string;
  startDate: ISODate;
  endDate: ISODate | null;
  endReason: DelegateEndReason | null;
}

export type Scope = 'sendiri' | 'unit' | 'semua';

export interface Role {
  id: string;
  code: string;
  name: string;
  isLocked: boolean;
}

export interface RolePermission {
  roleId: string;
  permission: number;
  scope: Scope | null;
}

export interface UserRole {
  userId: string;
  roleId: string;
  source: 'manual' | 'position';
}

export interface MonitoringSupport {
  positionId: string;
  domain: 'budget_performance' | 'procurement';
}

export interface MonitoringAssignment {
  id: string;
  targetPositionId: string;
  leadPositionId: string;
  supports: MonitoringSupport[];
  quarterFromId: string;
  quarterToId: string;
  decreeNo: string;
}

/* ---------- Calendar ---------- */

export interface FiscalYear {
  year: number;
  status: 'open' | 'closing' | 'archived';
  toleranceDays: number;
  archiveGraceDays: number;
  archivedAt: ISODateTime | null;
  archivedBy: 'hard_limit' | 'manual' | null;
}

export interface Quarter {
  id: string;
  fiscalYear: number;
  number: 1 | 2 | 3 | 4;
  startsOn: ISODate;
  endsOn: ISODate;
  lini1OpensOn: ISODate;
  lini1Deadline: ISODate;
  lini3OpensOn: ISODate;
  lini3Deadline: ISODate;
  explanationWorkdays: number;
  scoreBandVersionId: string | null;
}

export interface QuarterAssessor {
  quarterId: string;
  positionId: string;
  excluded: boolean;
  exclusionReason: string | null;
  excludedByUserId: string | null;
}

/* ---------- Reference data ---------- */

export interface Stage {
  id: string;
  positionTypeId: string;
  name: string;
  order: number;
  active: boolean;
}

export interface DataUmumField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'currency' | 'date' | 'list';
  mandatory: boolean;
  /** Choices for kind 'list'. */
  options?: string[];
}

export interface DataUmumForm {
  id: string;
  positionTypeId: string;
  version: number;
  fields: DataUmumField[];
  defaultObjective: string;
  active: boolean;
  createdAt?: ISODate;
}

export interface RiskTemplate {
  id: string;
  /** Stable code from docs/seed/template_risiko_rapim.json, e.g. PPK-T4-FR-03. */
  code: string;
  positionTypeId: string;
  stageId: string;
  riskType: RiskType;
  description: string;
  order: number;
  active: boolean;
  /** Last edit date shown in the template list. */
  updatedAt?: ISODate;
}

export interface MitigationTemplate {
  id: string;
  code: string;
  riskTemplateId: string;
  description: string;
  order: number;
  active: boolean;
}

export interface RiskProposal {
  id: string;
  sourceRegisterRiskId: string;
  description: string;
  proposerUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  rejectionReason: string | null;
  createdAt: ISODateTime;
}

export interface ScoreBandVersion {
  id: string;
  number: number;
  effectiveFrom: ISODate;
  /** draft = being edited; scheduled = saved, waiting for effective_from; active = exactly one (INV-3). */
  status: 'active' | 'draft' | 'scheduled' | 'retired';
}

export interface ScoreBand {
  versionId: string;
  /** null = 0 is included (closed lower bound of the first band). */
  lowerExclusive: number | null;
  upperInclusive: number;
  predicate: Predicate;
  order: number;
  guidance: string;
}

/* ---------- Register ---------- */

export type RegisterStatus = 'draft' | 'ready' | 'published' | 'archived';

export interface DataUmumValues {
  tujuan: string;
  kegiatan: string[];
  besarAnggaran: number | null;
  target: string;
  extra: Record<string, string>;
}

export interface Register {
  id: string;
  positionId: string;
  fiscalYear: number;
  status: RegisterStatus;
  dataUmum: DataUmumValues;
  dataUmumFormId: string;
  copiedFromRegisterId: string | null;
  publishedAt: ISODateTime | null;
  publishedByUserId: string | null;
  /** Last autosave ("Draf tersimpan HH.MM"). */
  updatedAt?: ISODateTime | null;
  updatedByUserId?: string | null;
  readyAt?: ISODateTime | null;
  readyByUserId?: string | null;
}

export interface RegisterStageDeclaration {
  id: string;
  registerId: string;
  stageId: string;
  riskType: RiskType | null;
  kind: 'stage_not_relevant' | 'no_risk_in_type';
  reason: string;
}

export type ItemStatus = 'draft' | 'ready' | 'active' | 'inactive';
export type RiskFlag = 'no_mitigation' | 'template_inactive';

export interface RegisterRisk {
  id: string;
  registerId: string;
  stageId: string;
  riskType: RiskType;
  riskTemplateId: string | null;
  descriptionSnapshot: string;
  isCustom: boolean;
  status: ItemStatus;
  publishedAt: ISODateTime | null;
  deactivatedAt: ISODateTime | null;
  deactivatedFromQuarterId: string | null;
  deactivationReason: string | null;
  previousYearRiskId: string | null;
  lineageId: string;
  flags: RiskFlag[];
  order: number;
  createdAt?: ISODateTime | null;
  createdByUserId?: string | null;
  readyAt?: ISODateTime | null;
}

export interface RegisterMitigation {
  id: string;
  registerRiskId: string;
  mitigationTemplateId: string | null;
  descriptionSnapshot: string;
  isCustom: boolean;
  order: number;
  status: ItemStatus;
  deactivationReason: string | null;
  publishedAt?: ISODateTime | null;
  createdAt?: ISODateTime | null;
  createdByUserId?: string | null;
  readyAt?: ISODateTime | null;
}

/* ---------- Board ---------- */

export interface Comment {
  id: string;
  registerRiskId: string;
  registerMitigationId: string | null;
  authorUserId: string;
  authorLine: Line;
  actingAs: Capacity;
  actingPositionId: string;
  quarterId: string;
  body: string;
  isStep: boolean;
  createdAt: ISODateTime;
  editedAt: ISODateTime | null;
  withdrawnAt: ISODateTime | null;
  withdrawnByUserId: string | null;
  mentionUserIds: string[];
}

export interface ThreadSubscription {
  userId: string;
  registerRiskId: string;
  muted: boolean;
}

export interface ThreadView {
  userId: string;
  registerRiskId: string;
  lastSeenAt: ISODateTime;
}

/* ---------- Assessment ---------- */

export type ComparisonStatus = 'waiting' | 'partial' | 'open';

export interface RiskQuarter {
  id: string;
  registerRiskId: string;
  quarterId: string;
  comparisonStatus: ComparisonStatus;
  firstOpenedAt: ISODateTime | null;
  recurring: boolean;
}

export type Lateness = 'terlambat' | 'sangat_terlambat' | null;

export interface Assessment {
  id: string;
  riskQuarterId: string;
  assessorPositionId: string;
  assessorLine: 1 | 3;
  status: 'draft' | 'ready' | 'final' | 'not_assessed';
  score: number | null;
  predicate: Predicate | null;
  notRelevant: boolean;
  notRelevantReason: string | null;
  note: string | null;
  scoreBandVersionId: string | null;
  finalisedByUserId: string | null;
  finalisedAt: ISODateTime | null;
  lateness: Lateness;
  flags: 'no_evidence'[];
  updatedAt: ISODateTime;
}

export type ExplanationStatus =
  'not_required' | 'optional' | 'pending' | 'ready' | 'sent' | 'not_sent';

export interface ComparisonResult {
  id: string;
  riskQuarterId: string;
  lini3PositionId: string;
  openedAt: ISODateTime;
  result: 'sesuai' | 'tidak_sesuai' | 'incomparable';
  lini1Higher: boolean;
  explanationRequired: boolean;
  explanationStatus: ExplanationStatus;
  explanationDueOn: ISODate | null;
  explanationReason: string | null;
  explanationPlan: string | null;
  explanationSentAt: ISODateTime | null;
  explanationSentByUserId: string | null;
  explanationLateness: Lateness;
}

/* ---------- Files, notification, audit ---------- */

export interface Attachment {
  id: string;
  ownerKind: 'comment' | 'assessment';
  ownerId: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: 'pending' | 'clean' | 'quarantined';
  isConfidential: boolean;
  uploadedById: string;
  uploadedAt: ISODateTime;
  /** IndexedDB key for small images; absent → placeholder. */
  blobKey?: string;
}

export interface PrintSnapshot {
  id: string;
  number: string;
  positionId: string;
  quarterId: string;
  kind: 'komunikasi' | 'mutu';
  version: number | null;
  trigger: 'print' | 'auto_freeze' | 'archive';
  isProvisional: boolean;
  supersededById: string | null;
  payload: unknown;
  createdByUserId: string | null;
  createdAt: ISODateTime;
}

export interface Notification {
  id: string;
  userId: string;
  kind: string;
  text: string;
  targetUrl: string;
  readAt: ISODateTime | null;
  createdAt: ISODateTime;
  /** Idempotency key: the same event never notifies twice. */
  eventKey: string;
}

export interface AuditLog {
  id: string;
  at: ISODateTime;
  actorUserId: string | null;
  actingAs: Capacity | 'superadmin' | 'pengelola' | 'sistem' | null;
  actingPositionId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

export interface UserPreference {
  userId: string;
  key: string;
  value: unknown;
}
