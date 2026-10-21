import { act } from '@testing-library/react';
import pilihan from '@seed/pilihan_penilaian.json';
import { comparisonStatusAt, isRecurring } from '@/domain/rules/assessment';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { runScheduledTasks } from '../local/scheduler';
import { getDb, useDb } from '../local/store';
import { assessmentApi, buildAssessment, buildQueue } from './assessment';

function as(userId: string) {
  act(() => useSession.getState().signIn(userId));
}
const at = (t: string) => useClock.getState().setNow(t);
const A1 = 'pos-ppk-a1';
const KEP = 'pos-kepatuhan';
const PAI = 'pos-pai';
const TW1 = 'q-2027-1';
const rq = (risk: string, q = TW1) => `rq-${risk}-${q}`;
const label = (v: number) => pilihan.options.find((o) => o.value === v)!.label;
const assessment = (risk: string, pos: string) =>
  getDb().assessments.find((a) => a.riskQuarterId === rq(risk) && a.assessorPositionId === pos);

beforeEach(() => {
  useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
});

/** The TW I 2027 scenario from 18 Mar 2027 (CLAUDE.md Tahap 6). */
describe('TW I cycle from 18 Mar 2027', () => {
  beforeEach(() => {
    at('2027-03-18T09:00');
    useDb.getState().reset('2027-03-18T09:00');
  });

  it('starts with nothing finalised and nothing opened', () => {
    expect(getDb().assessments.filter((a) => a.riskQuarterId.endsWith(TW1))).toEqual([]);
    expect(getDb().results.filter((r) => r.riskQuarterId.endsWith(TW1))).toEqual([]);
  });

  it('Operator drafts, Pejabat finalises scored rows only, with no_evidence and lateness', async () => {
    as('usr-rafi');
    await assessmentApi.saveCell(rq('rr-a1-penyerapan'), A1, { score: 3 });
    await assessmentApi.saveCell(rq('rr-a1-dipa'), A1, { score: 4 });
    await expect(
      assessmentApi.saveCell(rq('rr-a1-pemecahan'), A1, { score: 4.3 }),
    ).rejects.toMatchObject({ message: 'Pilihan penilaian tidak dikenal.' });
    await assessmentApi.markReady(A1, TW1, A1);
    expect(assessment('rr-a1-penyerapan', A1)!.status).toBe('ready');
    await expect(assessmentApi.finalise(A1, TW1, A1)).rejects.toMatchObject({ code: 'forbidden' });
    expect(
      getDb().notifications.some(
        (n) => n.userId === 'usr-andi' && n.text.includes('siap untuk Anda tuntaskan'),
      ),
    ).toBe(true);

    as('usr-andi');
    at('2027-03-29T10:00'); // after the 26 Mar deadline, within tolerance
    const summary = await assessmentApi.finalise(A1, TW1, A1);
    expect(summary.toFinalise).toBe(2);
    expect(summary.unscored).toBeGreaterThan(0);
    expect(summary.noEvidence).toHaveLength(2);
    const a = assessment('rr-a1-penyerapan', A1)!;
    expect(a).toMatchObject({
      status: 'final',
      predicate: 'cukup',
      lateness: 'terlambat',
      flags: ['no_evidence'],
    });
    // Unscored rows stay fillable.
    await assessmentApi.saveCell(rq('rr-a1-pemecahan'), A1, { score: 3 });
    await assessmentApi.reopen(a.id);
    expect(assessment('rr-a1-penyerapan', A1)!.status).toBe('draft');
  });

  it('accepts only option values of the quarter version (PRD v2.8)', async () => {
    as('usr-rafi');
    await expect(
      assessmentApi.saveCell(rq('rr-a1-penyerapan'), A1, { score: 2.5 }),
    ).rejects.toMatchObject({ message: 'Pilihan penilaian tidak dikenal.' });
    const before = buildAssessment(getDb(), 'usr-rafi', A1, 2027, 1, '2027-03-18T10:00');
    await assessmentApi.saveCell(rq('rr-a1-penyerapan'), A1, { score: 0 });
    const view = buildAssessment(getDb(), 'usr-rafi', A1, 2027, 1, '2027-03-18T10:00');
    const own = view.rows.find((r) => r.risk.id === 'rr-a1-penyerapan')!.cells.find((c) => c.own)!;
    expect(own.selectedValue).toBe(0);
    expect(own.assessment?.optionLabel).toBe(label(0));
    expect(own.assessment?.predicate).toBe('kurang');
    expect('score' in own.assessment!).toBe(false);
    expect(view.progress.unscored).toBe(before.progress.unscored - 1);
    expect(view.options.map((o) => o.value)).toEqual([0, 1, 2, 3, 4]);
  });

  it('"Belum relevan" needs a reason before finalising', async () => {
    as('usr-andi');
    await assessmentApi.saveCell(rq('rr-a1-rpd'), A1, { notRelevant: true });
    await expect(assessmentApi.finalise(A1, TW1, A1)).rejects.toMatchObject({ code: 'gaps' });
    await assessmentApi.saveCell(rq('rr-a1-rpd'), A1, {
      notRelevantReason: 'Belum ada penarikan dana kegiatan.',
    });
    await assessmentApi.finalise(A1, TW1, A1);
    expect(assessment('rr-a1-rpd', A1)!.status).toBe('final');
  });

  it('opens fully when all finalise, partially at the Lini 3 deadline, and VIS-1 keeps others blind', async () => {
    as('usr-andi');
    await assessmentApi.saveCell(rq('rr-a1-penyerapan'), A1, { score: 3 });
    await assessmentApi.saveCell(rq('rr-a1-pemecahan'), A1, { score: 3 });
    await assessmentApi.finalise(A1, TW1, A1);

    at('2027-04-01T10:00');
    as('usr-hendra');
    await assessmentApi.saveCell(rq('rr-a1-penyerapan'), KEP, { score: 3, note: 'Sesuai RPD.' });
    await assessmentApi.saveCell(rq('rr-a1-pemecahan'), KEP, { score: 2 });
    // Hendra cannot see Lini 1 before opening (VIS-1).
    const blind = buildAssessment(getDb(), 'usr-hendra', A1, 2027, 1, '2027-04-01T10:00');
    expect(blind.rows.every((r) => !r.cells[0]!.visible)).toBe(true);
    await assessmentApi.finalise(A1, TW1, KEP);
    expect(getDb().results.filter((r) => r.riskQuarterId === rq('rr-a1-penyerapan'))).toHaveLength(
      0,
    );

    as('usr-maya');
    await assessmentApi.saveCell(rq('rr-a1-penyerapan'), PAI, { score: 2 });
    await assessmentApi.finalise(A1, TW1, PAI);
    // Penyerapan: L1, KEP and PAI final → opens fully, PAI Tidak Sesuai with a mandatory explanation.
    const results = getDb().results.filter((r) => r.riskQuarterId === rq('rr-a1-penyerapan'));
    expect(results.map((r) => [r.lini3PositionId, r.result]).sort()).toEqual([
      [KEP, 'sesuai'],
      [PAI, 'tidak_sesuai'],
    ]);
    expect(results.find((r) => r.lini3PositionId === PAI)).toMatchObject({
      explanationRequired: true,
      explanationDueOn: '2027-04-08',
    });
    expect(
      getDb().notifications.some(
        (n) => n.userId === 'usr-andi' && n.kind === 'explanation_required',
      ),
    ).toBe(true);

    // Pemecahan: PAI has not finalised; at the Lini 3 deadline (2 Apr) KEP opens partially.
    at('2027-04-03T00:10');
    runScheduledTasks();
    const rqP = getDb().riskQuarters.find((x) => x.id === rq('rr-a1-pemecahan'))!;
    expect(comparisonStatusAt(getDb(), rqP, '2027-04-03T00:10')).toBe('partial');
    // VIS-9: Maya (PAI, not finalised) sees no Lini 1 or KEP for that risk.
    const late = buildAssessment(getDb(), 'usr-maya', A1, 2027, 1, '2027-04-03T00:10');
    const row = late.rows.find((r) => r.risk.id === 'rr-a1-pemecahan')!;
    expect(row.cells.filter((c) => !c.own).every((c) => !c.visible)).toBe(true);
    expect(row.summary).toBe('waiting');
    // Lini 1 is frozen once anything opened.
    as('usr-andi');
    await expect(assessmentApi.reopen(assessment('rr-a1-pemecahan', A1)!.id)).rejects.toMatchObject(
      { code: 'frozen' },
    );
  });

  it('closes an unfinalised Lini 1 as "Tidak dinilai Lini 1" when the comparison opens', async () => {
    at('2027-04-01T10:00');
    as('usr-hendra');
    await assessmentApi.saveCell(rq('rr-a1-dipa'), KEP, { score: 4 });
    await assessmentApi.finalise(A1, TW1, KEP);
    at('2027-04-03T08:00');
    runScheduledTasks();
    expect(assessment('rr-a1-dipa', A1)!.status).toBe('not_assessed');
    expect(getDb().results.find((r) => r.riskQuarterId === rq('rr-a1-dipa'))!.result).toBe(
      'incomparable',
    );
  });
});

describe('explanations and recurrence (default data, 6 Apr 2027)', () => {
  beforeEach(() => {
    at('2027-04-06T09:00');
    useDb.getState().reset();
  });

  it('Pejabat sends; the text is then immutable and Lini 2 is notified', async () => {
    const r = getDb().results.find(
      (x) => x.riskQuarterId === rq('rr-a1-penyerapan') && x.lini3PositionId === PAI,
    )!;
    as('usr-rafi');
    await expect(assessmentApi.sendExplanations(A1, [r.id])).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(assessmentApi.markExplanationsReady(A1, [r.id])).rejects.toMatchObject({
      code: 'gaps',
    });
    await assessmentApi.saveExplanation(r.id, {
      reason: 'Dashboard belum dipakai.',
      plan: 'Rapat mingguan mulai April.',
    });
    await assessmentApi.markExplanationsReady(A1, [r.id]);
    as('usr-andi');
    expect(await assessmentApi.sendExplanations(A1, [r.id])).toBe(1);
    const sent = getDb().results.find((x) => x.id === r.id)!;
    expect(sent).toMatchObject({
      explanationStatus: 'sent',
      explanationSentByUserId: 'usr-andi',
      explanationLateness: null,
    });
    await expect(assessmentApi.saveExplanation(r.id, { reason: 'x' })).rejects.toMatchObject({
      code: 'sent',
    });
    expect(
      getDb().notifications.some((n) => n.userId === 'usr-siti' && n.kind === 'explanation_sent'),
    ).toBe(true);
  });

  it("never exposes another assessor's number", () => {
    const view = buildAssessment(getDb(), 'usr-andi', A1, 2027, 1, '2027-04-06T09:00');
    for (const row of view.rows)
      for (const c of row.cells.filter((x) => !x.own)) {
        expect(c.selectedValue).toBeNull();
        if (c.assessment) expect('score' in c.assessment).toBe(false);
      }
  });

  it('marks Pemecahan kontrak as recurring across fiscal years (FR-NIL-011)', () => {
    const rqP = getDb().riskQuarters.find((x) => x.id === rq('rr-a1-pemecahan'))!;
    expect(isRecurring(getDb(), rqP)).toBe(true);
  });

  it('the Lini 3 queue lists unpublished registers and counts the directorate’s progress', () => {
    const view = buildQueue(getDb(), 'usr-maya', TW1, '2027-04-06T09:00');
    expect(view.directorate?.id).toBe(PAI);
    const kpa = view.rows.find((r) => r.positionId === 'pos-kpa-satker-a')!;
    expect(kpa.status).toBe('belum_terbit');
    const pjp = view.rows.find((r) => r.positionId === 'pos-pjp-satker-b')!;
    expect(pjp).toMatchObject({ status: 'belum', assessed: 0, total: 3, overdue: true });
  });

  it('logs every blind view by the Superadmin', async () => {
    as('usr-admin');
    const before = buildAssessment(getDb(), 'usr-admin', A1, 2027, 2, '2027-04-06T09:00');
    expect(before.blind.allowed).toBe(true);
    await assessmentApi.logBlindView(A1, 'q-2027-2');
    expect(getDb().audit.at(-1)).toMatchObject({
      action: 'lihat_penilaian_sebelum_dibuka',
      actorUserId: 'usr-admin',
    });
    const after = buildAssessment(getDb(), 'usr-admin', A1, 2027, 2, '2027-04-06T09:00', true);
    const row = after.rows.find((r) => r.risk.id === 'rr-a1-pemecahan')!;
    expect(row.cells.find((c) => c.positionId === KEP)!.assessment?.optionLabel).toBe(label(2));
  });
});
