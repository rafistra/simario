// Register read model — PRD §5 (FR-REG-001 … 013). Which register items a viewer receives is
// decided here, not in the page: holders of the position see drafts and unpublished additions;
// every other reader in scope sees published items only (FR-REG-012) and nothing of a register
// that has never been published.

import {
  checkAction,
  finalisingOfficial,
  holdingsOf,
  type DenyReason,
} from '@/domain/rules/access';
import {
  completeStages,
  registerGaps,
  registerStages,
  type RegisterGap,
} from '@/domain/rules/register';
import type {
  ISODate,
  Position,
  Register,
  RegisterMitigation,
  RegisterRisk,
  RiskTemplate,
  RiskType,
  Stage,
} from '@/domain/types';
import type { DB } from '../db';
import { assertCanRead } from '../local/actor';
import { ApiError } from '../local/call';

export interface RegisterAccess {
  canDraft: boolean;
  canPublish: boolean;
  /** Holds the position (any capacity): sees drafts and additions. */
  isHolder: boolean;
  isOperator: boolean;
  draftDenied: DenyReason | null;
  archived: boolean;
  /** Pejabat (Pokja: Pengisi) who finalises. */
  officialName: string | null;
}

export function registerAccess(
  db: DB,
  userId: string,
  position: Position,
  fiscalYear: number,
  today: string,
): RegisterAccess {
  const archived = db.fiscalYears.find((f) => f.year === fiscalYear)?.status === 'archived';
  const draft = checkAction(db, userId, 2, position.id, today);
  const publish = checkAction(db, userId, 3, position.id, today);
  const holding = holdingsOf(db, userId, today).find((h) => h.positionId === position.id);
  const official = finalisingOfficial(db, position.id, today);
  return {
    canDraft: draft.ok && !archived,
    canPublish: publish.ok && !archived,
    isHolder: !!holding,
    isOperator: holding?.capacity === 'operator',
    draftDenied: draft.ok ? null : draft.reason,
    archived,
    officialName: official?.fullName ?? null,
  };
}

export interface SubsectionModel {
  stage: Stage;
  riskType: RiskType;
  risks: RegisterRisk[];
  /** Mitigations the viewer may see, per risk of this sub-section, in order. */
  mitigations: Record<string, RegisterMitigation[]>;
  /** Active templates not yet chosen (edit mode only). */
  templates: RiskTemplate[];
  declaration: { reason: string } | null;
}

export interface StageModel {
  stage: Stage;
  index: number;
  total: number;
  notRelevant: { reason: string } | null;
  subsections: SubsectionModel[];
}

/** Items a publish would cover: everything still draft or ready. */
export function pendingItems(db: DB, registerId: string) {
  const risks = db.risks.filter(
    (r) => r.registerId === registerId && (r.status === 'draft' || r.status === 'ready'),
  );
  const riskIds = new Set(db.risks.filter((r) => r.registerId === registerId).map((r) => r.id));
  const mitigations = db.mitigations.filter(
    (m) => riskIds.has(m.registerRiskId) && (m.status === 'draft' || m.status === 'ready'),
  );
  return { risks, mitigations };
}

/** Risks that would publish without an active mitigation (flag, not a block). */
export function wouldFlagNoMitigation(db: DB, registerId: string): RegisterRisk[] {
  const { risks } = pendingItems(db, registerId);
  return risks.filter(
    (r) => !db.mitigations.some((m) => m.registerRiskId === r.id && m.status !== 'inactive'),
  );
}

const isPublishedItem = (x: { status: string }) => x.status === 'active' || x.status === 'inactive';

/** Readers never see unpublished items; holders see everything except removed (deleted) drafts. */
const visibleTo = (access: RegisterAccess) => (x: { status: string }) =>
  access.isHolder || isPublishedItem(x);

function buildStages(
  db: DB,
  register: Register | null,
  position: Position,
  access: RegisterAccess,
  editing: boolean,
): StageModel[] {
  const visible = visibleTo(access);
  const stages = register
    ? registerStages(db, register)
    : db.stages
        .filter((s) => s.positionTypeId === position.positionTypeId && s.active)
        .sort((a, b) => a.order - b.order);
  const active = stages.filter((s) => s.active);
  return stages.map((stage) => {
    const stageDecl = register
      ? db.declarations.find(
          (d) =>
            d.registerId === register.id &&
            d.stageId === stage.id &&
            d.kind === 'stage_not_relevant',
        )
      : undefined;
    const subsections = (['kinerja_anggaran', 'ketidakpatuhan', 'kecurangan'] as RiskType[]).map(
      (riskType): SubsectionModel => {
        const risks = register
          ? db.risks
              .filter(
                (r) =>
                  r.registerId === register.id && r.stageId === stage.id && r.riskType === riskType,
              )
              .filter(visible)
              .sort((a, b) => Number(a.isCustom) - Number(b.isCustom) || a.order - b.order)
          : [];
        const mitigations = Object.fromEntries(
          risks.map((r) => [
            r.id,
            db.mitigations
              .filter((m) => m.registerRiskId === r.id)
              .filter(visible)
              .sort((a, b) => a.order - b.order),
          ]),
        );
        const used = new Set(
          risks.filter((r) => r.status !== 'inactive').map((r) => r.riskTemplateId),
        );
        const templates =
          editing && stage.active
            ? db.riskTemplates
                .filter(
                  (t) =>
                    t.stageId === stage.id &&
                    t.riskType === riskType &&
                    t.active &&
                    !used.has(t.id),
                )
                .sort((a, b) => a.order - b.order)
            : [];
        const decl = register
          ? db.declarations.find(
              (d) =>
                d.registerId === register.id && d.stageId === stage.id && d.riskType === riskType,
            )
          : undefined;
        return {
          stage,
          riskType,
          risks,
          mitigations,
          templates,
          declaration: decl ? { reason: decl.reason } : null,
        };
      },
    );
    return {
      stage,
      index: active.indexOf(stage) + 1,
      total: active.length,
      notRelevant: stageDecl ? { reason: stageDecl.reason } : null,
      subsections,
    };
  });
}

export interface RegisterView {
  /** Null when none exists yet, or for a reader while it has never been published. */
  register: Register | null;
  /** A register exists, but this reader sees nothing of it before its first publish. */
  unpublishedForReader: boolean;
  access: RegisterAccess;
  stages: StageModel[];
  /** Every risk the viewer may see (status counts). */
  risks: RegisterRisk[];
  /** Draft and ready items awaiting publish; empty for readers. */
  pending: { risks: RegisterRisk[]; mitigations: RegisterMitigation[] };
  /** Structural publish gaps (§2.6); only for viewers who may draft. */
  gaps: RegisterGap[];
  /** Last fiscal year's register exists (the "Salin dari TA …" banner). */
  previousRegister: boolean;
  stagesDone: { complete: number; total: number };
  /** Pending risks that would publish without an active mitigation; holders only. */
  flagged: RegisterRisk[];
}

/**
 * The register as this viewer may see it (FR-REG-012). Requires read access to the position
 * (permission 1 scope, §1.5).
 */
export function buildRegisterView(
  db: DB,
  userId: string,
  positionId: string,
  fiscalYear: number,
  today: ISODate,
): RegisterView {
  assertCanRead(db, userId, positionId, today, fiscalYear);
  const position = db.positions.find((p) => p.id === positionId);
  if (!position) throw new ApiError('not_found', 'Jabatan tidak ditemukan.');
  const access = registerAccess(db, userId, position, fiscalYear, today);
  const editing = access.canDraft;
  const stored = db.registers.find(
    (r) => r.positionId === positionId && r.fiscalYear === fiscalYear,
  );
  const unpublishedForReader =
    !!stored &&
    !access.isHolder &&
    stored.status !== 'published' &&
    stored.status !== 'archived' &&
    !access.archived;
  const register = stored && !unpublishedForReader ? stored : null;
  const visible = visibleTo(access);
  return {
    register,
    unpublishedForReader,
    access,
    stages: buildStages(db, register, position, access, editing),
    risks: register ? db.risks.filter((r) => r.registerId === register.id).filter(visible) : [],
    pending:
      register && access.isHolder ? pendingItems(db, register.id) : { risks: [], mitigations: [] },
    gaps: register && editing ? registerGaps(db, register.id) : [],
    previousRegister: db.registers.some(
      (r) => r.positionId === positionId && r.fiscalYear === fiscalYear - 1,
    ),
    stagesDone: register
      ? completeStages(db, register.id)
      : {
          complete: 0,
          total: db.stages.filter((s) => s.positionTypeId === position.positionTypeId && s.active)
            .length,
        },
    flagged: register && access.isHolder ? wouldFlagNoMitigation(db, register.id) : [],
  };
}
