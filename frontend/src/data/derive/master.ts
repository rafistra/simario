// Pure derivations of the master pages, moved out of the prototype module (B9) so pages do
// not bundle the local store. The fake backend re-exports them.

import type { Position } from '@/domain/types';
import type { DeactivationImpact } from '@/test/fake/api/master';
import type { DB } from '@/test/fake/db';

/** Registers of the current fiscal year that use a template ("Dipakai [N] jabatan", FR-MST-003). */
export function templateUsage(db: DB, templateId: string, fiscalYear: number): number {
  const registerIds = new Set(
    db.risks.filter((r) => r.riskTemplateId === templateId).map((r) => r.registerId),
  );
  return db.registers.filter((r) => registerIds.has(r.id) && r.fiscalYear === fiscalYear).length;
}

export function templateEverUsed(db: DB, templateId: string): boolean {
  return db.risks.some((r) => r.riskTemplateId === templateId);
}

export function stageUsedByRegister(db: DB, stageId: string): boolean {
  return (
    db.risks.some((r) => r.stageId === stageId) ||
    db.declarations.some((d) => d.stageId === stageId)
  );
}

export function activePositionsOfType(db: DB, typeId: string): Position[] {
  return db.positions.filter((p) => p.positionTypeId === typeId && p.active);
}

export function positionDeactivationImpact(
  db: DB,
  positionId: string,
  today: string,
): DeactivationImpact {
  const regs = db.registers.filter((r) => r.positionId === positionId && r.status === 'published');
  return {
    publishedRegisters: regs.map((r) => ({
      fiscalYear: r.fiscalYear,
      activeRisks: db.risks.filter((x) => x.registerId === r.id && x.status === 'active').length,
    })),
    activeOperators: db.delegates.filter(
      (d) =>
        d.positionId === positionId && d.startDate <= today && (!d.endDate || d.endDate >= today),
    ).length,
  };
}
