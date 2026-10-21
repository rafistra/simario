import { act } from '@testing-library/react';
import { inactiveLabel, registerGaps } from '@/domain/rules/register';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { getDb, useDb } from '../local/store';
import { registerApi, type RegisterKey } from './register';

function as(userId: string) {
  act(() => useSession.getState().signIn(userId));
}

const A1: RegisterKey = { positionId: 'pos-ppk-a1', fiscalYear: 2027 };
const KPA: RegisterKey = { positionId: 'pos-kpa-satker-a', fiscalYear: 2027 };
const POKJA: RegisterKey = { positionId: 'pos-pokja-03', fiscalYear: 2027 };
const kpaRegister = () =>
  getDb().registers.find((r) => r.positionId === KPA.positionId && r.fiscalYear === 2027);

beforeEach(() => {
  useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
  useClock.getState().setNow('2027-04-06T09:00');
  useDb.getState().reset();
});

describe('who may draft and publish (INV-12, INV-24, INV-25)', () => {
  it('refuses drafting to a Pokja member who is not the Pengisi', async () => {
    as('usr-ratna');
    await expect(
      registerApi.toggleTemplateRisk(POKJA, 'tpl-POKJA-T1-KA-01', true),
    ).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Hanya Pengisi dan Operator yang ditunjuknya yang dapat menyusun register ini.',
    });
  });

  it('lets the Operator draft but not publish', async () => {
    as('usr-rafi');
    await expect(registerApi.publish(A1)).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Tindakan akhir dilakukan oleh Pejabat.',
    });
  });

  it('refuses edits in an archived fiscal year', async () => {
    as('usr-andi');
    await expect(
      registerApi.updateDataUmum({ positionId: 'pos-ppk-a1', fiscalYear: 2026 }, { target: 'x' }),
    ).rejects.toMatchObject({ code: 'archived' });
  });
});

describe('drafting (FR-REG-002 … 006, 009)', () => {
  it('copies the previous year as drafts without publishing anything', async () => {
    as('usr-hadi');
    const summary = await registerApi.copyFromPrevious(KPA);
    expect(summary.fromYear).toBe(2026);
    expect(summary.risks).toBeGreaterThan(0);
    const reg = kpaRegister()!;
    expect(reg.status).toBe('draft');
    expect(reg.dataUmum.besarAnggaran).toBeNull();
    const risks = getDb().risks.filter((r) => r.registerId === reg.id);
    expect(risks).toHaveLength(summary.risks);
    expect(risks.every((r) => r.status === 'draft' && r.publishedAt === null)).toBe(true);
    await expect(registerApi.copyFromPrevious(KPA)).rejects.toMatchObject({ code: 'not_empty' });
  });

  it('does not pre-tick template mitigations', async () => {
    as('usr-hadi');
    await registerApi.toggleTemplateRisk(KPA, 'tpl-KPA-T1-KA-01', true);
    const risk = getDb().risks.find(
      (r) => r.riskTemplateId === 'tpl-KPA-T1-KA-01' && r.registerId === kpaRegister()!.id,
    )!;
    expect(getDb().mitigations.filter((m) => m.registerRiskId === risk.id)).toHaveLength(0);
  });

  it('asks before a declaration removes selected draft risks', async () => {
    as('usr-hadi');
    await registerApi.toggleTemplateRisk(KPA, 'tpl-KPA-T1-KA-01', true);
    await expect(
      registerApi.setDeclaration(KPA, 'stg-KPA-T1', 'kinerja_anggaran', true),
    ).rejects.toMatchObject({ code: 'has_drafts', details: { count: 1 } });
    await registerApi.setDeclaration(KPA, 'stg-KPA-T1', 'kinerja_anggaran', true, true);
    const reg = kpaRegister()!;
    expect(getDb().risks.filter((r) => r.registerId === reg.id)).toHaveLength(0);
    expect(
      getDb().declarations.some((d) => d.registerId === reg.id && d.kind === 'no_risk_in_type'),
    ).toBe(true);
  });

  it('returns a ready register to draft on the next edit', async () => {
    as('usr-rafi');
    const before = getDb().notifications.length;
    await registerApi.toggleTemplateMitigation(
      'rr-a1-material',
      getDb().mitigationTemplates.find(
        (m) =>
          m.riskTemplateId === getDb().risks.find((r) => r.id === 'rr-a1-material')!.riskTemplateId,
      )!.id,
      true,
    );
    await registerApi.markReady(A1);
    const notes = getDb().notifications.slice(before);
    expect(
      notes.some((n) => n.userId === 'usr-andi' && n.text.includes('siap untuk Anda tuntaskan')),
    ).toBe(true);
    expect(
      getDb()
        .mitigations.filter((m) => m.registerRiskId === 'rr-a1-material')
        .every((m) => m.status !== 'draft'),
    ).toBe(true);
  });
});

describe('publishing (FR-REG-007, 008)', () => {
  it('blocks with a numbered list of gaps', async () => {
    as('usr-hadi');
    await registerApi.toggleTemplateRisk(KPA, 'tpl-KPA-T1-KA-01', true);
    const err = await registerApi.publish(KPA).catch((e) => e);
    expect(err.code).toBe('gaps');
    expect(err.message).toMatch(/^Register belum dapat diterbitkan: \d+ hal perlu dilengkapi$/);
    const gaps = err.details as { message: string }[];
    expect(
      gaps.some(
        (g) => g.message === 'Data Umum — Kegiatan wajib diisi sebelum register diterbitkan.',
      ),
    ).toBe(true);
    expect(gaps.some((g) => g.message.includes('belum ada risiko atau pernyataan'))).toBe(true);
    // Tujuan is optional (off by default) and never a gap.
    expect(kpaRegister()!.dataUmum.tujuan).toBe('');
    expect(gaps.some((g) => g.message.includes('Tujuan'))).toBe(false);
    expect(kpaRegister()!.status).toBe('draft');
  });

  it('publishes additions: risk quarter rows, proposals and Lini 2 notifications', async () => {
    as('usr-andi');
    const reg = getDb().registers.find((r) => r.id === 'reg-ppk-a1-2027')!;
    expect(registerGaps(getDb(), reg.id)).toEqual([]);
    const pending = getDb().risks.filter(
      (r) => r.registerId === reg.id && (r.status === 'ready' || r.status === 'draft'),
    );
    const before = getDb().notifications.length;
    const summary = await registerApi.publish(A1);
    expect(summary.risks).toBe(pending.length);
    const db = getDb();
    for (const r of pending) {
      expect(db.risks.find((x) => x.id === r.id)!.status).toBe('active');
      expect(
        db.riskQuarters.some((rq) => rq.registerRiskId === r.id && rq.quarterId === 'q-2027-2'),
      ).toBe(true);
    }
    expect(db.notifications.slice(before).some((n) => n.kind === 'register_published')).toBe(true);
    await expect(registerApi.publish(A1)).rejects.toMatchObject({ code: 'nothing' });
  });
});

describe('deactivation (FR-REG-010, RB-REG-006)', () => {
  it('requires a reason and stops assessment from the next quarter', async () => {
    as('usr-andi');
    await expect(registerApi.deactivateRisk('rr-a1-pembayaran', '  ')).rejects.toMatchObject({
      message: 'Alasan penonaktifan wajib diisi.',
    });
    await registerApi.deactivateRisk('rr-a1-pembayaran', 'Sudah dipantau melalui SPAN.');
    const r = getDb().risks.find((x) => x.id === 'rr-a1-pembayaran')!;
    expect(r.status).toBe('inactive');
    expect(r.deactivatedFromQuarterId).toBe('q-2027-3');
    expect(inactiveLabel(getDb(), r)).toBe('Nonaktif sejak TW III');
  });

  it('in TW IV the risk stays assessed for the rest of the year', async () => {
    useClock.getState().setNow('2027-11-02T09:00');
    as('usr-andi');
    await registerApi.deactivateRisk('rr-a1-pembayaran', 'Paket selesai.');
    const r = getDb().risks.find((x) => x.id === 'rr-a1-pembayaran')!;
    expect(r.deactivatedFromQuarterId).toBeNull();
    expect(inactiveLabel(getDb(), r)).toBe('Nonaktif mulai TA 2028');
  });

  it('is for the Pejabat only', async () => {
    as('usr-rafi');
    await expect(registerApi.deactivateRisk('rr-a1-pembayaran', 'x')).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});
