// Register — PRD §5 (FR-REG-001 … 013). Content actions require a holding on the register's
// position (INV-25): drafting = permission 2 (Pokja: Pengisi or Operator, INV-24); publishing and
// deactivating = permission 3, Pejabat only (INV-12). Every change is audited.

import { quarterContaining } from '@/domain/calendar';
import { assignedLini2, checkAction, holdingsOf, type DenyReason } from '@/domain/rules/access';
import { deactivationQuarter, registerGaps, type RegisterGap } from '@/domain/rules/register';
import type { DataUmumValues, Register, RiskType } from '@/domain/types';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { ApiError, call } from '../local/call';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit, writeNotification } from '../local/writers';
import { buildRegisterView, pendingItems, wouldFlagNoMitigation } from './registerView';

const DENY: Record<DenyReason, string> = {
  permission: 'Anda tidak memiliki izin untuk tindakan ini.',
  holding: 'Tindakan ini hanya untuk pemegang jabatan ini.',
  official: 'Tindakan akhir dilakukan oleh Pejabat.',
  filler: 'Hanya Pengisi dan Operator yang ditunjuknya yang dapat menyusun register ini.',
};

interface ContentActor {
  userId: string;
  at: string;
  today: string;
  capacity: 'pejabat' | 'operator';
  positionId: string;
}

function requireContent(code: number, positionId: string): ContentActor {
  const userId = useSession.getState().userId;
  if (!userId) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  const at = now();
  const today = at.slice(0, 10);
  const res = checkAction(getDb(), userId, code, positionId, today);
  if (!res.ok) throw new ApiError('forbidden', DENY[res.reason]);
  return { userId, at, today, capacity: res.holding.capacity, positionId };
}

const audit = (
  d: DB,
  a: ContentActor,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
) =>
  writeAudit(d, {
    at: a.at,
    actorUserId: a.userId,
    actingAs: a.capacity,
    actingPositionId: a.positionId,
    action,
    entityType,
    entityId,
    before,
    after,
  });

/** Seed items carry no publishedAt on mitigations; active/inactive status means published. */
const isPublished = (x: { status: string; publishedAt?: string | null }) =>
  !!x.publishedAt || x.status === 'active' || x.status === 'inactive';

function assertWritable(db: DB, fiscalYear: number) {
  if (db.fiscalYears.find((f) => f.year === fiscalYear)?.status === 'archived')
    throw new ApiError(
      'archived',
      'Tahun anggaran ini sudah diarsipkan. Register hanya dapat dibaca.',
    );
}

const registerOf = (db: DB, positionId: string, fiscalYear: number) =>
  db.registers.find((r) => r.positionId === positionId && r.fiscalYear === fiscalYear);

/** Creates the register on first edit (INV-1: one per position per fiscal year). */
function ensureRegister(d: DB, positionId: string, fiscalYear: number, a: ContentActor): Register {
  const existing = registerOf(d, positionId, fiscalYear);
  if (existing) return existing;
  const position = d.positions.find((p) => p.id === positionId)!;
  const form = d.dataUmumForms.find(
    (f) => f.positionTypeId === position.positionTypeId && f.active,
  )!;
  const reg: Register = {
    id: newId('reg'),
    positionId,
    fiscalYear,
    status: 'draft',
    dataUmum: {
      tujuan: form.objectiveEnabled ? form.defaultObjective : '',
      kegiatan: [],
      besarAnggaran: null,
      target: '',
      extra: {},
    },
    dataUmumFormId: form.id,
    copiedFromRegisterId: null,
    publishedAt: null,
    publishedByUserId: null,
    updatedAt: a.at,
    updatedByUserId: a.userId,
  };
  d.registers.push(reg);
  audit(d, a, 'buat_register', 'Register', reg.id, null, { fiscalYear });
  return d.registers.find((r) => r.id === reg.id)!;
}

/** Any edit marks the autosave time; an edit after "Siap" returns the register to Draf (FR-REG-006). */
function touch(reg: Register, a: ContentActor) {
  reg.updatedAt = a.at;
  reg.updatedByUserId = a.userId;
  if (reg.status === 'ready') {
    reg.status = 'draft';
    reg.readyAt = null;
    reg.readyByUserId = null;
  }
}

/** Edits to a published register affect additions only: a ready addition returns to draft. */
function touchItem(item: { status: string; readyAt?: string | null }) {
  if (item.status === 'ready') {
    item.status = 'draft';
    item.readyAt = null;
  }
}

function itemStatusFor(reg: Register): 'draft' {
  void reg;
  return 'draft';
}

function recomputeNoMitigation(d: DB, riskId: string) {
  const risk = d.risks.find((r) => r.id === riskId)!;
  if (!risk.publishedAt) return;
  const active = d.mitigations.filter((m) => m.registerRiskId === riskId && m.status === 'active');
  const has = risk.flags.includes('no_mitigation');
  if (active.length === 0 && !has) risk.flags.push('no_mitigation');
  if (active.length > 0 && has) risk.flags = risk.flags.filter((f) => f !== 'no_mitigation');
}

/** Removing a "tidak ada risiko" declaration when a risk is added to its sub-section (FR-REG-008). */
function clearDeclarationFor(d: DB, registerId: string, stageId: string, riskType: RiskType) {
  d.declarations = d.declarations.filter(
    (x) => !(x.registerId === registerId && x.stageId === stageId && x.riskType === riskType),
  );
}

function assertStageOpen(d: DB, registerId: string, stageId: string) {
  if (
    d.declarations.some(
      (x) =>
        x.registerId === registerId && x.stageId === stageId && x.kind === 'stage_not_relevant',
    )
  )
    throw new ApiError(
      'stage_not_relevant',
      'Tahap ini dinyatakan tidak relevan. Batalkan pernyataan tahap terlebih dahulu.',
    );
}

export interface RegisterKey {
  positionId: string;
  fiscalYear: number;
}

export interface CopySummary {
  risks: number;
  mitigations: number;
  inactiveTemplates: number;
  skippedStages: { name: string; risks: number }[];
  fromYear: number;
}

export interface PublishSummary {
  risks: number;
  mitigations: number;
  flagged: { id: string; description: string }[];
  proposals: number;
}

export const registerApi = {
  /** FR-REG-012: the register as the signed-in viewer may see it (read access per §1.5). */
  view: (key: RegisterKey) =>
    call(() => {
      const userId = useSession.getState().userId;
      if (!userId)
        throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
      return buildRegisterView(getDb(), userId, key.positionId, key.fiscalYear, now().slice(0, 10));
    }),

  toggleTemplateRisk: (key: RegisterKey, templateId: string, selected: boolean) =>
    call(() => {
      const a = requireContent(2, key.positionId);
      assertWritable(getDb(), key.fiscalYear);
      mutateDb((d) => {
        const reg = ensureRegister(d, key.positionId, key.fiscalYear, a);
        const tpl = d.riskTemplates.find((t) => t.id === templateId)!;
        const existing = d.risks.find(
          (r) =>
            r.registerId === reg.id && r.riskTemplateId === templateId && r.status !== 'inactive',
        );
        if (selected && !existing) {
          assertStageOpen(d, reg.id, tpl.stageId);
          clearDeclarationFor(d, reg.id, tpl.stageId, tpl.riskType);
          const id = newId('rr');
          // Template mitigations are NOT pre-ticked (FR-REG-003).
          d.risks.push({
            id,
            registerId: reg.id,
            stageId: tpl.stageId,
            riskType: tpl.riskType,
            riskTemplateId: tpl.id,
            descriptionSnapshot: tpl.description,
            isCustom: false,
            status: itemStatusFor(reg),
            publishedAt: null,
            deactivatedAt: null,
            deactivatedFromQuarterId: null,
            deactivationReason: null,
            previousYearRiskId: null,
            lineageId: `lin-${id}`,
            flags: [],
            order: tpl.order,
            createdAt: a.at,
            createdByUserId: a.userId,
          });
          audit(d, a, 'pilih_risiko', 'RegisterRisk', id, null, { template: tpl.code });
        } else if (!selected && existing) {
          if (existing.publishedAt)
            throw new ApiError(
              'published',
              'Risiko yang sudah diterbitkan tidak dapat dihapus. Gunakan Nonaktifkan.',
            );
          d.risks = d.risks.filter((r) => r.id !== existing.id);
          d.mitigations = d.mitigations.filter((m) => m.registerRiskId !== existing.id);
          audit(
            d,
            a,
            'hapus_risiko_draf',
            'RegisterRisk',
            existing.id,
            { description: existing.descriptionSnapshot },
            null,
          );
        }
        touch(reg, a);
      });
    }),

  addCustomRisk: (key: RegisterKey, stageId: string, riskType: RiskType, description: string) =>
    call(() => {
      const a = requireContent(2, key.positionId);
      assertWritable(getDb(), key.fiscalYear);
      const text = description.trim().replace(/\s+/g, ' ');
      if (!text) throw new ApiError('validation', 'Uraian risiko wajib diisi.');
      let id = '';
      mutateDb((d) => {
        const reg = ensureRegister(d, key.positionId, key.fiscalYear, a);
        assertStageOpen(d, reg.id, stageId);
        clearDeclarationFor(d, reg.id, stageId, riskType);
        id = newId('rr');
        d.risks.push({
          id,
          registerId: reg.id,
          stageId,
          riskType,
          riskTemplateId: null,
          descriptionSnapshot: text,
          isCustom: true,
          status: 'draft',
          publishedAt: null,
          deactivatedAt: null,
          deactivatedFromQuarterId: null,
          deactivationReason: null,
          previousYearRiskId: null,
          lineageId: `lin-${id}`,
          flags: [],
          order: 999,
          createdAt: a.at,
          createdByUserId: a.userId,
        });
        audit(d, a, 'tambah_risiko_sendiri', 'RegisterRisk', id, null, { description: text });
        touch(reg, a);
      });
      return id;
    }),

  deleteRisk: (riskId: string) =>
    call(() => {
      const db = getDb();
      const risk = db.risks.find((r) => r.id === riskId)!;
      const reg = db.registers.find((r) => r.id === risk.registerId)!;
      const a = requireContent(2, reg.positionId);
      assertWritable(db, reg.fiscalYear);
      if (risk.publishedAt)
        throw new ApiError(
          'published',
          'Risiko yang sudah diterbitkan tidak dapat dihapus. Gunakan Nonaktifkan.',
        );
      mutateDb((d) => {
        d.risks = d.risks.filter((r) => r.id !== riskId);
        d.mitigations = d.mitigations.filter((m) => m.registerRiskId !== riskId);
        audit(
          d,
          a,
          'hapus_risiko_draf',
          'RegisterRisk',
          riskId,
          { description: risk.descriptionSnapshot },
          null,
        );
        touch(
          d.registers.find((r) => r.id === reg.id)!,
          a,
        );
      });
    }),

  toggleTemplateMitigation: (riskId: string, mitigationTemplateId: string, selected: boolean) =>
    call(() => {
      const db = getDb();
      const risk = db.risks.find((r) => r.id === riskId)!;
      const reg = db.registers.find((r) => r.id === risk.registerId)!;
      const a = requireContent(2, reg.positionId);
      assertWritable(db, reg.fiscalYear);
      mutateDb((d) => {
        const existing = d.mitigations.find(
          (m) =>
            m.registerRiskId === riskId &&
            m.mitigationTemplateId === mitigationTemplateId &&
            m.status !== 'inactive',
        );
        if (selected && !existing) {
          const tpl = d.mitigationTemplates.find((m) => m.id === mitigationTemplateId)!;
          const id = newId('rm');
          d.mitigations.push({
            id,
            registerRiskId: riskId,
            mitigationTemplateId,
            descriptionSnapshot: tpl.description,
            isCustom: false,
            order: tpl.order,
            status: 'draft',
            deactivationReason: null,
            createdAt: a.at,
            createdByUserId: a.userId,
          });
          audit(d, a, 'pilih_mitigasi', 'RegisterMitigation', id, null, {
            description: tpl.description,
          });
        } else if (!selected && existing) {
          if (isPublished(existing))
            throw new ApiError(
              'published',
              'Mitigasi yang sudah diterbitkan tidak dapat dihapus. Gunakan Nonaktifkan.',
            );
          d.mitigations = d.mitigations.filter((m) => m.id !== existing.id);
          audit(
            d,
            a,
            'hapus_mitigasi_draf',
            'RegisterMitigation',
            existing.id,
            { description: existing.descriptionSnapshot },
            null,
          );
        }
        const r = d.risks.find((x) => x.id === riskId)!;
        if (!r.publishedAt) touchItem(r);
        touch(
          d.registers.find((x) => x.id === reg.id)!,
          a,
        );
      });
    }),

  addCustomMitigation: (riskId: string, text: string) =>
    call(() => {
      const db = getDb();
      const risk = db.risks.find((r) => r.id === riskId)!;
      const reg = db.registers.find((r) => r.id === risk.registerId)!;
      const a = requireContent(2, reg.positionId);
      assertWritable(db, reg.fiscalYear);
      const description = text.trim().replace(/\s+/g, ' ');
      if (!description) throw new ApiError('validation', 'Uraian mitigasi wajib diisi.');
      mutateDb((d) => {
        const id = newId('rm');
        const order =
          Math.max(
            0,
            ...d.mitigations.filter((m) => m.registerRiskId === riskId).map((m) => m.order),
          ) + 1;
        d.mitigations.push({
          id,
          registerRiskId: riskId,
          mitigationTemplateId: null,
          descriptionSnapshot: description,
          isCustom: true,
          order,
          status: 'draft',
          deactivationReason: null,
          createdAt: a.at,
          createdByUserId: a.userId,
        });
        audit(d, a, 'tambah_mitigasi_sendiri', 'RegisterMitigation', id, null, { description });
        touch(
          d.registers.find((x) => x.id === reg.id)!,
          a,
        );
      });
    }),

  deleteMitigation: (mitigationId: string) =>
    call(() => {
      const db = getDb();
      const m = db.mitigations.find((x) => x.id === mitigationId)!;
      const risk = db.risks.find((r) => r.id === m.registerRiskId)!;
      const reg = db.registers.find((r) => r.id === risk.registerId)!;
      const a = requireContent(2, reg.positionId);
      assertWritable(db, reg.fiscalYear);
      if (isPublished(m))
        throw new ApiError(
          'published',
          'Mitigasi yang sudah diterbitkan tidak dapat dihapus. Gunakan Nonaktifkan.',
        );
      mutateDb((d) => {
        d.mitigations = d.mitigations.filter((x) => x.id !== mitigationId);
        audit(
          d,
          a,
          'hapus_mitigasi_draf',
          'RegisterMitigation',
          mitigationId,
          { description: m.descriptionSnapshot },
          null,
        );
        touch(
          d.registers.find((x) => x.id === reg.id)!,
          a,
        );
      });
    }),

  /**
   * "Tidak ada risiko pada jenis ini" (riskType) or "Tahap ini tidak relevan tahun ini" (riskType null).
   * Mutually exclusive with risks: draft risks are removed only with `force` (after confirmation);
   * published risks make the declaration impossible.
   */
  setDeclaration: (
    key: RegisterKey,
    stageId: string,
    riskType: RiskType | null,
    on: boolean,
    force = false,
  ) =>
    call(() => {
      const a = requireContent(2, key.positionId);
      assertWritable(getDb(), key.fiscalYear);
      const reg0 = registerOf(getDb(), key.positionId, key.fiscalYear);
      const affected = reg0
        ? getDb().risks.filter(
            (r) =>
              r.registerId === reg0.id &&
              r.stageId === stageId &&
              (riskType === null || r.riskType === riskType),
          )
        : [];
      if (on && affected.some((r) => r.publishedAt))
        throw new ApiError(
          'has_published',
          'Bagian ini memuat risiko yang sudah diterbitkan. Nonaktifkan risiko tersebut alih-alih menyatakan tidak ada risiko.',
        );
      if (on && affected.length > 0 && !force)
        throw new ApiError(
          'has_drafts',
          `${affected.length} risiko terpilih akan dihapus dari bagian ini.`,
          { count: affected.length },
        );
      mutateDb((d) => {
        const reg = ensureRegister(d, key.positionId, key.fiscalYear, a);
        const match = (x: { registerId: string; stageId: string; riskType: RiskType | null }) =>
          x.registerId === reg.id && x.stageId === stageId && x.riskType === riskType;
        if (on) {
          const ids = new Set(affected.map((r) => r.id));
          d.risks = d.risks.filter((r) => !ids.has(r.id));
          d.mitigations = d.mitigations.filter((m) => !ids.has(m.registerRiskId));
          if (riskType === null)
            d.declarations = d.declarations.filter(
              (x) => !(x.registerId === reg.id && x.stageId === stageId),
            );
          if (!d.declarations.some(match))
            d.declarations.push({
              id: newId('decl'),
              registerId: reg.id,
              stageId,
              riskType,
              kind: riskType ? 'no_risk_in_type' : 'stage_not_relevant',
              reason: '',
            });
        } else {
          d.declarations = d.declarations.filter((x) => !match(x));
        }
        audit(
          d,
          a,
          on ? 'nyatakan' : 'batalkan_pernyataan',
          'RegisterStageDeclaration',
          `${reg.id}:${stageId}:${riskType ?? 'tahap'}`,
          null,
          { on, removedRisks: affected.length },
        );
        touch(reg, a);
      });
    }),

  setDeclarationReason: (
    key: RegisterKey,
    stageId: string,
    riskType: RiskType | null,
    reason: string,
  ) =>
    call(() => {
      const a = requireContent(2, key.positionId);
      assertWritable(getDb(), key.fiscalYear);
      mutateDb((d) => {
        const reg = registerOf(d, key.positionId, key.fiscalYear)!;
        const decl = d.declarations.find(
          (x) => x.registerId === reg.id && x.stageId === stageId && x.riskType === riskType,
        );
        if (!decl || decl.reason === reason) return;
        audit(
          d,
          a,
          'ubah_alasan_pernyataan',
          'RegisterStageDeclaration',
          decl.id,
          { reason: decl.reason },
          { reason },
        );
        decl.reason = reason;
        touch(reg, a);
      });
    }),

  /** Data Umum stays editable for Lini 1 after publishing; changes are audited (FR-REG-001). */
  updateDataUmum: (key: RegisterKey, patch: Partial<DataUmumValues>) =>
    call(() => {
      const a = requireContent(2, key.positionId);
      assertWritable(getDb(), key.fiscalYear);
      mutateDb((d) => {
        const reg = ensureRegister(d, key.positionId, key.fiscalYear, a);
        const before = Object.fromEntries(
          Object.keys(patch).map((k) => [k, reg.dataUmum[k as keyof DataUmumValues]]),
        );
        reg.dataUmum = {
          ...reg.dataUmum,
          ...patch,
          extra: { ...reg.dataUmum.extra, ...(patch.extra ?? {}) },
        };
        audit(d, a, 'ubah_data_umum', 'Register', reg.id, before, patch);
        touch(reg, a);
      });
    }),

  /** Operator hands over: draft → ready; the Pejabat is notified (FR-REG-006, FR-NTF-001). */
  markReady: (key: RegisterKey) =>
    call(() => {
      const a = requireContent(2, key.positionId);
      const db = getDb();
      assertWritable(db, key.fiscalYear);
      const reg0 = registerOf(db, key.positionId, key.fiscalYear);
      if (!reg0) throw new ApiError('empty', 'Register masih kosong.');
      const published = reg0.status === 'published';
      const { risks, mitigations } = pendingItems(db, reg0.id);
      if (published && risks.length + mitigations.length === 0)
        throw new ApiError('nothing', 'Tidak ada tambahan yang perlu ditandai siap.');
      mutateDb((d) => {
        const reg = d.registers.find((r) => r.id === reg0.id)!;
        for (const r of d.risks)
          if (r.registerId === reg.id && r.status === 'draft')
            Object.assign(r, { status: 'ready', readyAt: a.at });
        const ids = new Set(d.risks.filter((r) => r.registerId === reg.id).map((r) => r.id));
        for (const m of d.mitigations)
          if (ids.has(m.registerRiskId) && m.status === 'draft')
            Object.assign(m, { status: 'ready', readyAt: a.at });
        if (!published)
          Object.assign(reg, { status: 'ready', readyAt: a.at, readyByUserId: a.userId });
        reg.updatedAt = a.at;
        reg.updatedByUserId = a.userId;
        const position = d.positions.find((p) => p.id === reg.positionId)!;
        const actor = d.users.find((u) => u.id === a.userId)!;
        for (const o of d.occupancies.filter(
          (x) => x.positionId === reg.positionId && x.isFiller && !x.endDate,
        )) {
          writeNotification(d, {
            userId: o.userId,
            kind: 'ready',
            text: `${actor.fullName} menandai ${published ? 'register tambahan' : 'register'} ${position.name} siap untuk Anda tuntaskan`,
            targetUrl: `/jabatan/${reg.positionId}/register/${reg.fiscalYear}`,
            createdAt: a.at,
            eventKey: `register-ready:${reg.id}:${a.at}`,
          });
        }
        audit(
          d,
          a,
          published ? 'tandai_siap_tambahan' : 'tandai_siap_register',
          'Register',
          reg.id,
          { status: reg0.status },
          { status: reg.status },
        );
      });
    }),

  /**
   * Publish (FR-REG-007) or publish additions (FR-REG-008). Structural gaps block with a list;
   * no_mitigation is a flag. Wording locks (INV-7), custom risks become proposals, risks enter the
   * board and the current quarter's assessment (RB-REG-006), Lini 2 is notified (FR-NTF-002).
   */
  publish: (key: RegisterKey) =>
    call<PublishSummary>(() => {
      const a = requireContent(3, key.positionId);
      const db = getDb();
      assertWritable(db, key.fiscalYear);
      const reg0 = registerOf(db, key.positionId, key.fiscalYear);
      if (!reg0) throw new ApiError('empty', 'Register masih kosong.');
      const gaps: RegisterGap[] = registerGaps(db, reg0.id);
      if (gaps.length)
        throw new ApiError(
          'gaps',
          `Register belum dapat diterbitkan: ${gaps.length} hal perlu dilengkapi`,
          gaps,
        );
      const { risks, mitigations } = pendingItems(db, reg0.id);
      if (reg0.status === 'published' && risks.length + mitigations.length === 0)
        throw new ApiError('nothing', 'Tidak ada tambahan yang perlu diterbitkan.');
      const flagged = wouldFlagNoMitigation(db, reg0.id).map((r) => ({
        id: r.id,
        description: r.descriptionSnapshot,
      }));
      const customs = risks.filter((r) => r.isCustom);
      const quarter = quarterContaining(db.quarters, a.today);
      mutateDb((d) => {
        const reg = d.registers.find((r) => r.id === reg0.id)!;
        const riskIds = new Set(risks.map((r) => r.id));
        for (const r of d.risks)
          if (riskIds.has(r.id))
            Object.assign(r, { status: 'active', publishedAt: a.at, readyAt: null });
        const mitIds = new Set(mitigations.map((m) => m.id));
        for (const m of d.mitigations)
          if (mitIds.has(m.id))
            Object.assign(m, { status: 'active', publishedAt: a.at, readyAt: null });
        for (const id of new Set([...riskIds, ...mitigations.map((m) => m.registerRiskId)]))
          recomputeNoMitigation(d, id);
        for (const r of customs)
          d.proposals.push({
            id: newId('prop'),
            sourceRegisterRiskId: r.id,
            description: r.descriptionSnapshot,
            proposerUserId: r.createdByUserId ?? a.userId,
            status: 'pending',
            rejectionReason: null,
            createdAt: a.at,
          });
        if (quarter && quarter.fiscalYear === reg.fiscalYear)
          for (const id of riskIds)
            if (
              !d.riskQuarters.some((rq) => rq.registerRiskId === id && rq.quarterId === quarter.id)
            )
              d.riskQuarters.push({
                id: `rq-${id}-${quarter.id}`,
                registerRiskId: id,
                quarterId: quarter.id,
                comparisonStatus: 'waiting',
                firstOpenedAt: null,
                recurring: false,
              });
        const first = reg.status !== 'published';
        Object.assign(reg, {
          status: 'published',
          publishedAt: first ? a.at : reg.publishedAt,
          publishedByUserId: first ? a.userId : reg.publishedByUserId,
          readyAt: null,
          readyByUserId: null,
          updatedAt: a.at,
          updatedByUserId: a.userId,
        });
        // FR-NTF-002: holders of the assigned Lini 2 lead and support positions.
        const position = d.positions.find((p) => p.id === reg.positionId)!;
        const lini2 = quarter ? assignedLini2(d, reg.positionId, quarter.id) : [];
        const recipients = new Set(
          d.users
            .filter((u) => holdingsOf(d, u.id, a.today).some((h) => lini2.includes(h.positionId)))
            .map((u) => u.id),
        );
        for (const userId of recipients)
          writeNotification(d, {
            userId,
            kind: 'register_published',
            text: `${position.name} menerbitkan ${riskIds.size} risiko TA ${reg.fiscalYear}`,
            targetUrl: `/jabatan/${reg.positionId}/register/${reg.fiscalYear}`,
            createdAt: a.at,
            eventKey: `register-published:${reg.id}:${a.at}`,
          });
        audit(
          d,
          a,
          first ? 'terbitkan_register' : 'terbitkan_tambahan',
          'Register',
          reg.id,
          { status: reg0.status },
          { status: 'published', risks: riskIds.size, mitigations: mitIds.size },
        );
      });
      return {
        risks: risks.length,
        mitigations: mitigations.length,
        flagged,
        proposals: customs.length,
      };
    }),

  /** FR-REG-010: Pejabat only, reason required; assessed until the next quarter (TW IV: rest of year). */
  deactivateRisk: (riskId: string, reason: string) =>
    call(() => {
      const db = getDb();
      const risk = db.risks.find((r) => r.id === riskId)!;
      const reg = db.registers.find((r) => r.id === risk.registerId)!;
      const a = requireContent(3, reg.positionId);
      assertWritable(db, reg.fiscalYear);
      if (!reason.trim()) throw new ApiError('validation', 'Alasan penonaktifan wajib diisi.');
      const current = quarterContaining(db.quarters, a.today);
      const from =
        current && current.fiscalYear === reg.fiscalYear
          ? deactivationQuarter(db.quarters, current)
          : null;
      mutateDb((d) => {
        const r = d.risks.find((x) => x.id === riskId)!;
        Object.assign(r, {
          status: 'inactive',
          deactivatedAt: a.at,
          deactivatedFromQuarterId: from?.id ?? null,
          deactivationReason: reason.trim(),
        });
        audit(
          d,
          a,
          'nonaktifkan_risiko',
          'RegisterRisk',
          riskId,
          { status: 'active' },
          { status: 'inactive', fromQuarter: from?.id ?? null, reason: reason.trim() },
        );
      });
    }),

  deactivateMitigation: (mitigationId: string, reason: string) =>
    call(() => {
      const db = getDb();
      const m = db.mitigations.find((x) => x.id === mitigationId)!;
      const risk = db.risks.find((r) => r.id === m.registerRiskId)!;
      const reg = db.registers.find((r) => r.id === risk.registerId)!;
      const a = requireContent(3, reg.positionId);
      assertWritable(db, reg.fiscalYear);
      if (!reason.trim()) throw new ApiError('validation', 'Alasan penonaktifan wajib diisi.');
      mutateDb((d) => {
        const x = d.mitigations.find((y) => y.id === mitigationId)!;
        Object.assign(x, { status: 'inactive', deactivationReason: reason.trim() });
        recomputeNoMitigation(d, risk.id);
        audit(
          d,
          a,
          'nonaktifkan_mitigasi',
          'RegisterMitigation',
          mitigationId,
          { status: 'active' },
          { status: 'inactive', reason: reason.trim() },
        );
      });
    }),

  /** FR-REG-009: only when the current register has no risks. Nothing is published. */
  copyFromPrevious: (key: RegisterKey) =>
    call<CopySummary>(() => {
      const a = requireContent(2, key.positionId);
      const db = getDb();
      assertWritable(db, key.fiscalYear);
      const prev = registerOf(db, key.positionId, key.fiscalYear - 1);
      if (!prev)
        throw new ApiError(
          'no_previous',
          `Tidak ada register TA ${key.fiscalYear - 1} untuk disalin.`,
        );
      const current = registerOf(db, key.positionId, key.fiscalYear);
      if (current && db.risks.some((r) => r.registerId === current.id))
        throw new ApiError(
          'not_empty',
          'Register sudah berisi risiko; salin hanya untuk register kosong.',
        );
      const source = db.risks.filter((r) => r.registerId === prev.id && r.status === 'active');
      const stageActive = (id: string) => db.stages.find((s) => s.id === id)?.active ?? false;
      const skipped = new Map<string, number>();
      for (const r of source)
        if (!stageActive(r.stageId)) {
          const name = db.stages.find((s) => s.id === r.stageId)!.name;
          skipped.set(name, (skipped.get(name) ?? 0) + 1);
        }
      const summary: CopySummary = {
        risks: 0,
        mitigations: 0,
        inactiveTemplates: 0,
        skippedStages: [...skipped].map(([name, risks]) => ({ name, risks })),
        fromYear: prev.fiscalYear,
      };
      mutateDb((d) => {
        const reg = ensureRegister(d, key.positionId, key.fiscalYear, a);
        reg.dataUmum = { ...prev.dataUmum, besarAnggaran: null, target: '' };
        reg.copiedFromRegisterId = prev.id;
        for (const decl of d.declarations.filter(
          (x) => x.registerId === prev.id && stageActive(x.stageId),
        ))
          d.declarations.push({ ...decl, id: newId('decl'), registerId: reg.id });
        for (const r of source.filter((x) => stageActive(x.stageId))) {
          const id = newId('rr');
          const tpl = r.riskTemplateId
            ? d.riskTemplates.find((t) => t.id === r.riskTemplateId)
            : undefined;
          const inactiveTpl = tpl ? !tpl.active : false;
          if (inactiveTpl) summary.inactiveTemplates++;
          d.risks.push({
            ...r,
            id,
            registerId: reg.id,
            status: 'draft',
            publishedAt: null,
            deactivatedAt: null,
            deactivatedFromQuarterId: null,
            deactivationReason: null,
            previousYearRiskId: r.id,
            lineageId: r.lineageId,
            flags: inactiveTpl ? ['template_inactive'] : [],
            createdAt: a.at,
            createdByUserId: a.userId,
            readyAt: null,
          });
          summary.risks++;
          for (const m of d.mitigations.filter(
            (x) => x.registerRiskId === r.id && x.status === 'active',
          )) {
            d.mitigations.push({
              ...m,
              id: newId('rm'),
              registerRiskId: id,
              status: 'draft',
              publishedAt: null,
              createdAt: a.at,
              createdByUserId: a.userId,
              readyAt: null,
            });
            summary.mitigations++;
          }
        }
        audit(d, a, 'salin_register', 'Register', reg.id, null, summary);
        touch(reg, a);
      });
      return summary;
    }),
};
