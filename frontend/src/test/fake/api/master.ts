// Master data — PRD §10 (FR-MST-001 … 010). Every write checks its permission, validates per the
// mockup notes, and appends to the audit trail.

import { sortOptions, validateBands, validateOptions, type BandProblem } from '@/domain/scoreBands';
import type {
  DataUmumField,
  PositionType,
  RiskTemplate,
  RiskType,
  ScoreBand,
  ScoreBandVersion,
  ScoreOption,
  Stage,
} from '@/domain/types';
import type { DB } from '../db';
import { requireActor, type Actor } from '../local/actor';
import { ApiError, call } from '../local/call';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit, writeNotification } from '../local/writers';
import {
  activePositionsOfType,
  positionDeactivationImpact,
  type MasterUsage,
} from '@/data/derive/master';
export { activePositionsOfType, positionDeactivationImpact };

/** Registers of the fiscal year that use a template (the server computes this since B9). */
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

/** GET /api/v1/master-usage for the fake backend. */
export function masterUsageOf(db: DB, fiscalYear: number): MasterUsage {
  const templates: Record<string, number> = {};
  for (const t of db.riskTemplates) {
    const n = templateUsage(db, t.id, fiscalYear);
    if (n) templates[t.id] = n;
  }
  return {
    templates,
    everUsed: [...new Set(db.risks.map((r) => r.riskTemplateId).filter((x): x is string => !!x))],
    stagesUsed: db.stages.filter((s) => stageUsedByRegister(db, s.id)).map((s) => s.id),
  };
}

const audit = (
  d: DB,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
) =>
  writeAudit(d, {
    at: actor.at,
    actorUserId: actor.userId,
    actingAs: actor.actingAs,
    actingPositionId: null,
    action,
    entityType,
    entityId,
    before,
    after,
  });

export type OptionInput = Pick<ScoreOption, 'id' | 'value' | 'label'>;

const withVersion = (options: OptionInput[], versionId: string): ScoreOption[] =>
  sortOptions(options).map((o, i) => ({ ...o, label: o.label.trim(), versionId, order: i + 1 }));

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/* ---------- Derived reads ---------- */

/* ---------- Position types & positions (FR-MST-008, 009) ---------- */

export interface PositionInput {
  positionTypeId: string;
  code: string;
  name: string;
  orgUnitId: string;
  identity: Record<string, string>;
}

function validatePosition(db: DB, input: PositionInput, id?: string) {
  const errors: Partial<Record<keyof PositionInput, string>> = {};
  if (!input.positionTypeId) errors.positionTypeId = 'Jenis jabatan wajib dipilih.';
  if (!input.code.trim()) errors.code = 'Kode jabatan wajib diisi.';
  else if (
    db.positions.some(
      (p) => p.id !== id && norm(p.code) === norm(input.code) && p.orgUnitId === input.orgUnitId,
    )
  )
    errors.code = 'Kode jabatan sudah dipakai.';
  if (!input.name.trim()) errors.name = 'Nama jabatan wajib diisi.';
  if (!input.orgUnitId) errors.orgUnitId = 'Unit kerja wajib dipilih.';
  if (Object.keys(errors).length)
    throw new ApiError('validation', 'Periksa kembali isian jabatan.', errors);
}

export interface DeactivationImpact {
  publishedRegisters: { fiscalYear: number; activeRisks: number }[];
  activeOperators: number;
}

export const masterApi = {
  /* --- position types --- */
  setPositionTypeActive: (typeId: string, active: boolean) =>
    call(() => {
      const actor = requireActor([17]);
      const db = getDb();
      const type = db.positionTypes.find((t) => t.id === typeId)!;
      if (!active) {
        const inUse = activePositionsOfType(db, typeId);
        if (inUse.length)
          throw new ApiError('type_in_use', `Jenis “${type.name}” masih dipakai`, {
            positions: inUse.map((p) => p.id),
            runningRegisters: db.registers.filter(
              (r) => inUse.some((p) => p.id === r.positionId) && r.status !== 'archived',
            ).length,
          });
      }
      mutateDb((d) => {
        d.positionTypes.find((t) => t.id === typeId)!.active = active;
        audit(
          d,
          actor,
          active ? 'aktifkan_jenis_jabatan' : 'nonaktifkan_jenis_jabatan',
          'PositionType',
          typeId,
          { active: !active },
          { active },
        );
      });
    }),

  savePosition: (input: PositionInput, id?: string) =>
    call(() => {
      const actor = requireActor([18]);
      validatePosition(getDb(), input, id);
      let savedId = id ?? '';
      mutateDb((d) => {
        if (id) {
          const p = d.positions.find((x) => x.id === id)!;
          const before = {
            code: p.code,
            name: p.name,
            orgUnitId: p.orgUnitId,
            identity: p.identity,
          };
          Object.assign(p, { ...input, code: input.code.trim(), name: input.name.trim() });
          audit(d, actor, 'ubah_jabatan', 'Position', id, before, input);
        } else {
          savedId = newId('pos');
          d.positions.push({
            id: savedId,
            ...input,
            code: input.code.trim(),
            name: input.name.trim(),
            active: true,
          });
          audit(d, actor, 'tambah_jabatan', 'Position', savedId, null, input);
        }
      });
      return savedId;
    }),

  deactivatePosition: (positionId: string, reason: string) =>
    call(() => {
      const actor = requireActor([18]);
      if (!reason.trim()) throw new ApiError('validation', 'Alasan penonaktifan wajib diisi.');
      mutateDb((d) => {
        const p = d.positions.find((x) => x.id === positionId)!;
        p.active = false;
        p.deactivatedAt = actor.at;
        p.deactivationReason = reason.trim();
        // Operators of a deactivated position end; Pejabat holdings stay for history (FR-MST-009 dialog).
        for (const del of d.delegates)
          if (del.positionId === positionId && !del.endDate) {
            del.endDate = actor.today;
            del.endReason = 'revoked';
            writeNotification(d, {
              userId: del.userId,
              kind: 'operator_revoked',
              text: `Penunjukan Anda sebagai operator untuk ${p.name} berakhir`,
              targetUrl: '/jabatan-saya',
              createdAt: actor.at,
              eventKey: `pos-deactivated:${positionId}:${del.id}`,
            });
          }
        audit(
          d,
          actor,
          'nonaktifkan_jabatan',
          'Position',
          positionId,
          { active: true },
          { active: false, reason: reason.trim() },
        );
      });
    }),

  reactivatePosition: (positionId: string) =>
    call(() => {
      const actor = requireActor([18]);
      mutateDb((d) => {
        const p = d.positions.find((x) => x.id === positionId)!;
        p.active = true;
        p.deactivatedAt = null;
        p.deactivationReason = null;
        audit(
          d,
          actor,
          'aktifkan_jabatan',
          'Position',
          positionId,
          { active: false },
          { active: true },
        );
      });
    }),

  /* --- stages (FR-MST-001) --- */
  renameStage: (stageId: string, name: string) =>
    call(() => {
      const actor = requireActor([15]);
      const db = getDb();
      const stage = db.stages.find((s) => s.id === stageId)!;
      if (!name.trim()) throw new ApiError('validation', 'Nama tahap wajib diisi.');
      if (
        db.stages.some(
          (s) =>
            s.id !== stageId &&
            s.positionTypeId === stage.positionTypeId &&
            norm(s.name) === norm(name),
        )
      )
        throw new ApiError('validation', 'Nama tahap sudah dipakai pada jenis ini.');
      mutateDb((d) => {
        const s = d.stages.find((x) => x.id === stageId)!;
        audit(
          d,
          actor,
          'ubah_nama_tahap',
          'Stage',
          stageId,
          { name: s.name },
          { name: name.trim() },
        );
        s.name = name.trim();
      });
    }),

  addStage: (positionTypeId: string, name: string) =>
    call(() => {
      const actor = requireActor([15]);
      const db = getDb();
      if (!name.trim()) throw new ApiError('validation', 'Nama tahap wajib diisi.');
      if (db.stages.some((s) => s.positionTypeId === positionTypeId && norm(s.name) === norm(name)))
        throw new ApiError('validation', 'Nama tahap sudah dipakai pada jenis ini.');
      const order =
        Math.max(
          0,
          ...db.stages
            .filter((s) => s.positionTypeId === positionTypeId && s.active)
            .map((s) => s.order),
        ) + 1;
      const id = newId('stg');
      mutateDb((d) => {
        d.stages.push({ id, positionTypeId, name: name.trim(), order, active: true });
        audit(d, actor, 'tambah_tahap', 'Stage', id, null, { name: name.trim(), order });
      });
      return id;
    }),

  /** Saves a new order for the active stages of one type immediately (drag or Alt+↑/↓). */
  reorderStages: (positionTypeId: string, orderedIds: string[]) =>
    call(() => {
      const actor = requireActor([15]);
      mutateDb((d) => {
        const before = d.stages
          .filter((s) => s.positionTypeId === positionTypeId && s.active)
          .sort((a, b) => a.order - b.order)
          .map((s) => s.id);
        orderedIds.forEach((id, i) => {
          const s = d.stages.find((x) => x.id === id);
          if (s) s.order = i + 1;
        });
        audit(
          d,
          actor,
          'urutkan_tahap',
          'PositionType',
          positionTypeId,
          { order: before },
          { order: orderedIds },
        );
      });
    }),

  setStageActive: (stageId: string, active: boolean) =>
    call(() => {
      const actor = requireActor([15]);
      mutateDb((d) => {
        const s = d.stages.find((x) => x.id === stageId)!;
        s.active = active;
        if (active) {
          s.order =
            Math.max(
              0,
              ...d.stages
                .filter((x) => x.positionTypeId === s.positionTypeId && x.active && x.id !== s.id)
                .map((x) => x.order),
            ) + 1;
        }
        audit(
          d,
          actor,
          active ? 'aktifkan_tahap' : 'nonaktifkan_tahap',
          'Stage',
          stageId,
          { active: !active },
          { active },
        );
      });
    }),

  deleteStage: (stageId: string) =>
    call(() => {
      const actor = requireActor([15]);
      const db = getDb();
      if (stageUsedByRegister(db, stageId))
        throw new ApiError(
          'stage_in_use',
          'Tahap ini dipakai register sehingga tidak dapat dihapus, hanya dinonaktifkan.',
        );
      if (db.riskTemplates.some((t) => t.stageId === stageId))
        throw new ApiError(
          'stage_has_templates',
          'Tahap ini masih punya template. Hapus atau pindahkan templatenya terlebih dahulu.',
        );
      mutateDb((d) => {
        const before = d.stages.find((s) => s.id === stageId);
        d.stages = d.stages.filter((s) => s.id !== stageId);
        audit(d, actor, 'hapus_tahap', 'Stage', stageId, before, null);
      });
    }),

  /* --- templates (FR-MST-002, 003, 004) --- */
  saveTemplate: (
    input: {
      positionTypeId: string;
      stageId: string;
      riskType: RiskType;
      description: string;
      mitigations: string[];
    },
    id?: string,
    fromProposalId?: string,
  ) =>
    call(() => {
      const actor = requireActor(fromProposalId ? [12, 13] : [12]);
      const db = getDb();
      const description = input.description.trim().replace(/\s+/g, ' ');
      if (!description) throw new ApiError('validation', 'Uraian risiko wajib diisi.');
      if (
        db.riskTemplates.some(
          (t) =>
            t.id !== id &&
            t.stageId === input.stageId &&
            t.riskType === input.riskType &&
            norm(t.description) === norm(description),
        )
      )
        throw new ApiError(
          'validation',
          'Uraian ini sudah ada pada tahap dan jenis risiko yang sama.',
        );
      // Empty mitigation lines are dropped on save; a template without mitigations is allowed.
      const mitigations = input.mitigations.map((m) => m.trim()).filter(Boolean);
      let savedId = id ?? '';
      mutateDb((d) => {
        if (id) {
          const t = d.riskTemplates.find((x) => x.id === id)!;
          const before = {
            description: t.description,
            mitigations: d.mitigationTemplates
              .filter((m) => m.riskTemplateId === id)
              .sort((a, b) => a.order - b.order)
              .map((m) => m.description),
          };
          t.description = description;
          t.updatedAt = actor.today;
          d.mitigationTemplates = d.mitigationTemplates.filter((m) => m.riskTemplateId !== id);
          mitigations.forEach((text, i) =>
            d.mitigationTemplates.push({
              id: newId('mtpl'),
              code: `${t.code}-M${i + 1}`,
              riskTemplateId: id,
              description: text,
              order: i + 1,
              active: true,
            }),
          );
          audit(d, actor, 'ubah_template', 'RiskTemplate', id, before, {
            description,
            mitigations,
          });
        } else {
          savedId = newId('tpl');
          const order =
            Math.max(
              0,
              ...d.riskTemplates
                .filter((t) => t.stageId === input.stageId && t.riskType === input.riskType)
                .map((t) => t.order),
            ) + 1;
          const code = `${savedId.toUpperCase().slice(0, 12)}`;
          d.riskTemplates.push({
            id: savedId,
            code,
            positionTypeId: input.positionTypeId,
            stageId: input.stageId,
            riskType: input.riskType,
            description,
            order,
            active: true,
            updatedAt: actor.today,
          });
          mitigations.forEach((text, i) =>
            d.mitigationTemplates.push({
              id: newId('mtpl'),
              code: `${code}-M${i + 1}`,
              riskTemplateId: savedId,
              description: text,
              order: i + 1,
              active: true,
            }),
          );
          audit(d, actor, 'tambah_template', 'RiskTemplate', savedId, null, {
            description,
            mitigations,
          });
        }
        if (fromProposalId) {
          const p = d.proposals.find((x) => x.id === fromProposalId)!;
          p.status = 'accepted';
          audit(
            d,
            actor,
            'terima_usulan',
            'RiskProposal',
            p.id,
            { status: 'pending' },
            { status: 'accepted', templateId: savedId },
          );
          writeNotification(d, {
            userId: p.proposerUserId,
            kind: 'proposal_accepted',
            text: `Usulan risiko “${p.description}” dijadikan template`,
            targetUrl: '/',
            createdAt: actor.at,
            eventKey: `proposal-accepted:${p.id}`,
          });
        }
      });
      return savedId;
    }),

  setTemplateActive: (templateId: string, active: boolean) =>
    call(() => {
      const actor = requireActor([12]);
      mutateDb((d) => {
        const t = d.riskTemplates.find((x) => x.id === templateId)!;
        t.active = active;
        t.updatedAt = actor.today;
        audit(
          d,
          actor,
          active ? 'aktifkan_template' : 'nonaktifkan_template',
          'RiskTemplate',
          templateId,
          { active: !active },
          { active },
        );
      });
    }),

  deleteTemplate: (templateId: string) =>
    call(() => {
      const actor = requireActor([12]);
      if (templateEverUsed(getDb(), templateId))
        throw new ApiError(
          'template_used',
          'Template yang pernah dipakai register tidak dapat dihapus, hanya dinonaktifkan.',
        );
      mutateDb((d) => {
        const before = d.riskTemplates.find((t) => t.id === templateId);
        d.riskTemplates = d.riskTemplates.filter((t) => t.id !== templateId);
        d.mitigationTemplates = d.mitigationTemplates.filter(
          (m) => m.riskTemplateId !== templateId,
        );
        audit(d, actor, 'hapus_template', 'RiskTemplate', templateId, before, null);
      });
    }),

  /* --- proposals (FR-MST-005) --- */
  rejectProposal: (proposalId: string, reason: string) =>
    call(() => {
      const actor = requireActor([13]);
      if (!reason.trim()) throw new ApiError('validation', 'Alasan penolakan wajib diisi.');
      mutateDb((d) => {
        const p = d.proposals.find((x) => x.id === proposalId)!;
        p.status = 'rejected';
        p.rejectionReason = reason.trim();
        audit(
          d,
          actor,
          'tolak_usulan',
          'RiskProposal',
          p.id,
          { status: 'pending' },
          { status: 'rejected', reason: reason.trim() },
        );
        writeNotification(d, {
          userId: p.proposerUserId,
          kind: 'proposal_rejected',
          text: `Usulan risiko “${p.description}” ditolak: ${reason.trim()}`,
          targetUrl: '/',
          createdAt: actor.at,
          eventKey: `proposal-rejected:${p.id}`,
        });
      });
    }),

  /* --- Data Umum forms (FR-MST-006) --- */
  saveDataUmumForm: (
    positionTypeId: string,
    defaultObjective: string,
    fields: DataUmumField[],
    objectiveEnabled = false,
  ) =>
    call(() => {
      const actor = requireActor([16]);
      const errors: Record<number, string> = {};
      const seen = new Set(['tujuan', 'kegiatan', 'besar anggaran', 'target']);
      fields.forEach((f, i) => {
        const key = norm(f.label);
        if (!key) errors[i] = 'Label isian wajib diisi.';
        else if (seen.has(key)) errors[i] = 'Label isian sudah dipakai.';
        seen.add(key);
        if (f.kind === 'list' && (f.options ?? []).filter((o) => o.trim()).length < 2)
          errors[i] = 'Tambahkan minimal dua pilihan.';
      });
      if (Object.keys(errors).length)
        throw new ApiError('validation', 'Periksa kembali isian tambahan.', errors);
      let version = 0;
      mutateDb((d) => {
        const current = d.dataUmumForms.filter((f) => f.positionTypeId === positionTypeId);
        version = Math.max(0, ...current.map((f) => f.version)) + 1;
        for (const f of current) f.active = false;
        const id = `du-${positionTypeId}-v${version}`;
        d.dataUmumForms.push({
          id,
          positionTypeId,
          version,
          objectiveEnabled,
          defaultObjective: defaultObjective.trim(),
          active: true,
          createdAt: actor.today,
          fields: fields.map((f) => ({
            ...f,
            label: f.label.trim(),
            key: f.key || norm(f.label).replace(/\W+/g, '_'),
          })),
        });
        audit(
          d,
          actor,
          'simpan_formulir_data_umum',
          'DataUmumForm',
          id,
          { version: version - 1 },
          { version, fields: fields.length },
        );
      });
      return version;
    }),

  /* --- score bands (FR-MST-007) --- */
  createBandDraft: (effectiveFrom: string) =>
    call(() => {
      const actor = requireActor([14]);
      const db = getDb();
      if (db.scoreBandVersions.some((v) => v.status === 'draft'))
        throw new ApiError(
          'draft_exists',
          'Sudah ada draf versi. Lanjutkan atau buang draf tersebut terlebih dahulu.',
        );
      if (effectiveFrom < actor.today)
        throw new ApiError('validation', 'Tanggal berlaku tidak boleh sebelum hari ini.');
      const active = db.scoreBandVersions.find((v) => v.status === 'active')!;
      const number = Math.max(...db.scoreBandVersions.map((v) => v.number)) + 1;
      const id = `sbv-${number}`;
      mutateDb((d) => {
        d.scoreBandVersions.push({ id, number, effectiveFrom, status: 'draft' });
        for (const b of d.scoreBands.filter((x) => x.versionId === active.id))
          d.scoreBands.push({ ...b, versionId: id });
        d.scoreOptions.push(
          ...d.scoreOptions
            .filter((o) => o.versionId === active.id)
            .map((o) => ({ ...o, id: newId('so'), versionId: id })),
        );
        audit(d, actor, 'buat_draf_skala', 'ScoreBandVersion', id, null, {
          number,
          effectiveFrom,
          copiedFrom: active.number,
        });
      });
      return id;
    }),

  /**
   * Saves a draft. Gaps/overlaps (INV-3) refuse saving; a valid draft becomes `scheduled` and is
   * activated by the scheduler from its effective date (first quarter opening on/after it).
   */
  saveBandVersion: (
    versionId: string,
    patch: {
      effectiveFrom: string;
      bands: Pick<
        ScoreBand,
        'lowerExclusive' | 'upperInclusive' | 'predicate' | 'order' | 'guidance'
      >[];
      options: OptionInput[];
    },
  ) =>
    call(() => {
      const actor = requireActor([14]);
      const current = getDb().scoreBandVersions.find((x) => x.id === versionId);
      if (current?.status !== 'draft')
        throw new ApiError('validation', 'Hanya draf versi yang dapat disimpan.');
      const problems: BandProblem[] = validateBands(patch.bands);
      if (patch.effectiveFrom < actor.today)
        throw new ApiError('validation', 'Tanggal berlaku tidak boleh sebelum hari ini.');
      if (problems.length)
        throw new ApiError('bands_invalid', 'Rentang tidak dapat disimpan', problems);
      const optionProblems = validateOptions(patch.options, patch.bands);
      if (optionProblems.length)
        throw new ApiError(
          'options_invalid',
          'Pilihan penilaian tidak dapat disimpan',
          optionProblems,
        );
      mutateDb((d) => {
        const v = d.scoreBandVersions.find((x) => x.id === versionId)!;
        v.effectiveFrom = patch.effectiveFrom;
        v.status = 'scheduled';
        d.scoreBands = d.scoreBands.filter((b) => b.versionId !== versionId);
        for (const b of patch.bands) d.scoreBands.push({ ...b, versionId });
        d.scoreOptions = d.scoreOptions.filter((o) => o.versionId !== versionId);
        const saved = withVersion(patch.options, versionId);
        d.scoreOptions.push(...saved);
        audit(
          d,
          actor,
          'simpan_versi_skala',
          'ScoreBandVersion',
          versionId,
          { status: 'draft' },
          {
            status: 'scheduled',
            effectiveFrom: patch.effectiveFrom,
            bands: patch.bands,
            options: saved.map(({ id, value, label, order }) => ({ id, value, label, order })),
          },
        );
      });
    }),

  /** Keeps draft edits without validation (autosave of the table and guidance). */
  updateBandDraft: (
    versionId: string,
    bands: ScoreBand[],
    effectiveFrom: string,
    options: OptionInput[],
  ) =>
    call(() => {
      requireActor([14]);
      mutateDb((d) => {
        const v = d.scoreBandVersions.find((x) => x.id === versionId)!;
        if (v.status !== 'draft') return;
        v.effectiveFrom = effectiveFrom;
        d.scoreBands = d.scoreBands.filter((b) => b.versionId !== versionId);
        for (const b of bands) d.scoreBands.push({ ...b, versionId });
        d.scoreOptions = d.scoreOptions.filter((o) => o.versionId !== versionId);
        d.scoreOptions.push(...withVersion(options, versionId));
      });
    }),

  discardBandDraft: (versionId: string) =>
    call(() => {
      const actor = requireActor([14]);
      mutateDb((d) => {
        const v = d.scoreBandVersions.find((x) => x.id === versionId);
        if (!v || (v.status !== 'draft' && v.status !== 'scheduled')) return;
        d.scoreBandVersions = d.scoreBandVersions.filter((x) => x.id !== versionId);
        d.scoreBands = d.scoreBands.filter((b) => b.versionId !== versionId);
        d.scoreOptions = d.scoreOptions.filter((o) => o.versionId !== versionId);
        audit(
          d,
          actor,
          'buang_draf_skala',
          'ScoreBandVersion',
          versionId,
          { number: v.number },
          null,
        );
      });
    }),

  /** Guidance text of the active version (shown as help on the assessment page). */
  updateActiveGuidance: (predicate: ScoreBand['predicate'], guidance: string) =>
    call(() => {
      const actor = requireActor([14]);
      mutateDb((d) => {
        const active = d.scoreBandVersions.find((v) => v.status === 'active')!;
        const b = d.scoreBands.find((x) => x.versionId === active.id && x.predicate === predicate)!;
        audit(
          d,
          actor,
          'ubah_panduan_skala',
          'ScoreBand',
          `${active.id}:${predicate}`,
          { guidance: b.guidance },
          { guidance },
        );
        b.guidance = guidance;
      });
    }),

  /** Statement text of the active version (PRD v2.8); values change only through a new version. */
  updateOptionLabel: (optionId: string, label: string) =>
    call(() => {
      const actor = requireActor([14]);
      const db = getDb();
      const option = db.scoreOptions.find((o) => o.id === optionId);
      const version = db.scoreBandVersions.find((v) => v.id === option?.versionId);
      if (!option || version?.status !== 'active')
        throw new ApiError('validation', 'Kalimat hanya dapat diubah langsung pada versi aktif.');
      // validateOptions flags the later of two duplicates, so the edited option goes last.
      const siblings = [
        ...db.scoreOptions.filter((o) => o.versionId === option.versionId && o.id !== optionId),
        { ...option, label },
      ];
      const problems = validateOptions(
        siblings,
        db.scoreBands.filter((b) => b.versionId === option.versionId),
      ).filter((p) => p.optionId === optionId);
      if (problems.length)
        throw new ApiError('options_invalid', 'Kalimat tidak dapat disimpan', problems);
      mutateDb((d) => {
        const o = d.scoreOptions.find((x) => x.id === optionId)!;
        audit(
          d,
          actor,
          'ubah_kalimat_penilaian',
          'ScoreOption',
          optionId,
          { label: o.label },
          { label: label.trim() },
        );
        o.label = label.trim();
      });
    }),
};

export type { PositionType, RiskTemplate, ScoreBandVersion, Stage };
