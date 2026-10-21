// Pure derivations of the master pages, moved out of the prototype module (B9) so pages do
// not bundle the local store. The fake backend re-exports them.

import type { Position } from '@/domain/types';
import type { DeactivationImpact } from '@/test/fake/api/master';
import type { DB } from '@/test/fake/db';

/** Usage hints of the master pages, from GET /api/v1/master-usage (B9). */
export interface MasterUsage {
  /** Registers of the fiscal year per template id (non-zero only). */
  templates: Record<string, number>;
  everUsed: string[];
  stagesUsed: string[];
}

/** Registers of the current fiscal year that use a template ("Dipakai [N] jabatan", FR-MST-003). */
export const templateUsage = (u: MasterUsage, templateId: string): number =>
  u.templates[templateId] ?? 0;

export const templateEverUsed = (u: MasterUsage, templateId: string): boolean =>
  u.everUsed.includes(templateId);

export const stageUsedByRegister = (u: MasterUsage, stageId: string): boolean =>
  u.stagesUsed.includes(stageId);

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
