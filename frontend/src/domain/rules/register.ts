// Register rules — PRD §5 (FR-REG-*), §2.6 validation, RB-REG-006, INV-7.

import type { DB } from '@/data/db';
import { QUARTER_ROMAN } from '../calendar';
import type { Quarter, Register, RegisterRisk, RiskType, Stage } from '../types';
import { RISK_TYPES, RISK_TYPE_LABEL } from '../types';

/** Stages shown in a register: the type's active stages plus any inactive stage it already uses. */
export function registerStages(db: DB, register: Pick<Register, 'id' | 'positionId'>): Stage[] {
  const position = db.positions.find((p) => p.id === register.positionId)!;
  const used = new Set([
    ...db.risks.filter((r) => r.registerId === register.id).map((r) => r.stageId),
    ...db.declarations.filter((d) => d.registerId === register.id).map((d) => d.stageId),
  ]);
  return db.stages
    .filter((s) => s.positionTypeId === position.positionTypeId && (s.active || used.has(s.id)))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order);
}

/** Risks that count for a sub-section: everything except deleted; inactive still counts (it was published). */
const countsForSection = (r: RegisterRisk) => r.status !== 'inactive' || r.publishedAt !== null;

export interface RegisterGap {
  kind: 'subsection' | 'reason' | 'dataUmum';
  message: string;
  /** DOM anchor of the place to fix (scroll target). */
  anchor: string;
  stageId?: string;
  riskType?: RiskType;
  field?: string;
}

export const subsectionAnchor = (stageId: string, riskType: RiskType) =>
  `sub-${stageId}-${riskType}`;
export const stageAnchor = (stageId: string) => `stage-${stageId}`;
export const dataUmumAnchor = (field: string) => `du-${field}`;

/**
 * Structural gaps that block publishing (§2.6): a risk-type sub-section with neither risks nor a
 * declaration, declarations without a reason, and empty mandatory Data Umum fields. Risks without
 * mitigation are flags, not gaps.
 */
export function registerGaps(db: DB, registerId: string): RegisterGap[] {
  const register = db.registers.find((r) => r.id === registerId)!;
  const gaps: RegisterGap[] = [];
  const du = register.dataUmum;
  const form = db.dataUmumForms.find((f) => f.id === register.dataUmumFormId);
  const missing = (field: string, label: string) =>
    gaps.push({
      kind: 'dataUmum',
      field,
      anchor: dataUmumAnchor(field),
      message: `Data Umum — ${label} wajib diisi sebelum register diterbitkan.`,
    });
  if (!du.kegiatan.some((k) => k.trim())) missing('kegiatan', 'Kegiatan');
  if (du.besarAnggaran === null || du.besarAnggaran <= 0)
    missing('besarAnggaran', 'Besar Anggaran');
  if (!du.target.trim()) missing('target', 'Target');
  for (const f of form?.fields ?? [])
    if (f.mandatory && !du.extra[f.key]?.trim()) missing(f.key, f.label);

  const stages = registerStages(db, register).filter((s) => s.active);
  stages.forEach((stage, i) => {
    const stageDecl = db.declarations.find(
      (d) =>
        d.registerId === registerId && d.stageId === stage.id && d.kind === 'stage_not_relevant',
    );
    if (stageDecl) {
      if (!stageDecl.reason.trim())
        gaps.push({
          kind: 'reason',
          stageId: stage.id,
          anchor: stageAnchor(stage.id),
          message: `Tahap ${i + 1} · ${stage.name} — alasan tahap tidak relevan wajib diisi.`,
        });
      return;
    }
    for (const rt of RISK_TYPES) {
      const decl = db.declarations.find(
        (d) => d.registerId === registerId && d.stageId === stage.id && d.riskType === rt,
      );
      const risks = db.risks.filter(
        (r) =>
          r.registerId === registerId &&
          r.stageId === stage.id &&
          r.riskType === rt &&
          countsForSection(r),
      );
      const anchor = subsectionAnchor(stage.id, rt);
      if (decl && !decl.reason.trim())
        gaps.push({
          kind: 'reason',
          stageId: stage.id,
          riskType: rt,
          anchor,
          message: `Tahap ${i + 1} · ${RISK_TYPE_LABEL[rt]} — alasan “Tidak ada risiko pada jenis ini” wajib diisi.`,
        });
      else if (!decl && risks.length === 0)
        gaps.push({
          kind: 'subsection',
          stageId: stage.id,
          riskType: rt,
          anchor,
          message: `Tahap ${i + 1} · ${RISK_TYPE_LABEL[rt]} — belum ada risiko atau pernyataan “Tidak ada risiko pada jenis ini”.`,
        });
    }
  });
  return gaps;
}

/** A stage is complete when declared not relevant with a reason, or every sub-section is covered. */
export function completeStages(db: DB, registerId: string): { complete: number; total: number } {
  const register = db.registers.find((r) => r.id === registerId)!;
  const stages = registerStages(db, register).filter((s) => s.active);
  const gaps = registerGaps(db, registerId).filter((g) => g.stageId);
  const incomplete = new Set(gaps.map((g) => g.stageId));
  return { complete: stages.filter((s) => !incomplete.has(s.id)).length, total: stages.length };
}

/** Next quarter of the same fiscal year, or null in TW IV ("Nonaktif mulai TA [tahun+1]"). */
export function deactivationQuarter(quarters: Quarter[], current: Quarter): Quarter | null {
  if (current.number === 4) return null;
  return (
    quarters.find((q) => q.fiscalYear === current.fiscalYear && q.number === current.number + 1) ??
    null
  );
}

/** Badge text for a deactivated item (FR-REG-010). */
export function inactiveLabel(
  db: DB,
  risk: Pick<RegisterRisk, 'deactivatedFromQuarterId' | 'registerId'>,
): string {
  if (risk.deactivatedFromQuarterId) {
    const q = db.quarters.find((x) => x.id === risk.deactivatedFromQuarterId)!;
    return `Nonaktif sejak TW ${QUARTER_ROMAN[q.number - 1]}`;
  }
  const register = db.registers.find((r) => r.id === risk.registerId)!;
  return `Nonaktif mulai TA ${register.fiscalYear + 1}`;
}

/**
 * RB-REG-006: a risk is assessed from the quarter it was published in up to, not including,
 * deactivated_from_quarter_id — whatever its current status.
 */
export function assessedInQuarter(db: DB, risk: RegisterRisk, quarter: Quarter): boolean {
  if (!risk.publishedAt) return false;
  const register = db.registers.find((r) => r.id === risk.registerId)!;
  if (register.fiscalYear !== quarter.fiscalYear) return false;
  const publishedDay = risk.publishedAt.slice(0, 10);
  if (publishedDay > quarter.endsOn) return false;
  if (risk.status === 'inactive') {
    if (!risk.deactivatedFromQuarterId) return true; // deactivated in TW IV: assessed through TW IV
    const from = db.quarters.find((q) => q.id === risk.deactivatedFromQuarterId)!;
    return quarter.number < from.number;
  }
  return true;
}
