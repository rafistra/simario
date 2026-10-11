// View model for the register page: who may do what, and which items each viewer sees.

import type { DB } from '@/data/db';
import {
  checkAction,
  finalisingOfficial,
  holdingsOf,
  type DenyReason,
} from '@/domain/rules/access';
import { registerStages } from '@/domain/rules/register';
import type {
  Position,
  Register,
  RegisterMitigation,
  RegisterRisk,
  RiskTemplate,
  RiskType,
  Stage,
} from '@/domain/types';

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

/** Readers never see unpublished additions; holders see everything except removed items. */
export function visibleRisk(r: RegisterRisk, access: RegisterAccess): boolean {
  return access.isHolder || r.status === 'active' || r.status === 'inactive';
}

export function visibleMitigation(m: RegisterMitigation, access: RegisterAccess): boolean {
  return access.isHolder || m.status === 'active' || m.status === 'inactive';
}

export function buildStages(
  db: DB,
  register: Register | undefined,
  position: Position,
  access: RegisterAccess,
  editing: boolean,
): StageModel[] {
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
      (riskType) => {
        const risks = register
          ? db.risks
              .filter(
                (r) =>
                  r.registerId === register.id && r.stageId === stage.id && r.riskType === riskType,
              )
              .filter((r) => visibleRisk(r, access))
              .sort((a, b) => Number(a.isCustom) - Number(b.isCustom) || a.order - b.order)
          : [];
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
