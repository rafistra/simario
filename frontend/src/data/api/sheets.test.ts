import { act } from '@testing-library/react';
import { buildSheetPayload, maskPayloadFor, mutuFromPayload } from '@/domain/rules/sheetPayload';
import { lembarMutu } from '@/domain/rules/sheets';
import { viewerFor } from '@/domain/rules/visibility';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { runScheduledTasks } from '../local/scheduler';
import { getDb, useDb } from '../local/store';
import { assessmentApi } from './assessment';
import { buildSheetView, sheetApi } from './sheets';

const AT = '2027-04-06T09:00';
const q1 = () => getDb().quarters.find((q) => q.id === 'q-2027-1')!;

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow(AT);
    useDb.getState().reset();
    useSession.getState().signIn('usr-andi');
  });
});

describe('sheet payload (FR-LBR-001 … 004, VIS-7)', () => {
  it('is viewer-neutral: no assessor value before its result opens', () => {
    const p = buildSheetPayload(getDb(), 'pos-ppk-a1', q1(), '2027-04-01T12:00');
    expect(p.risks.every((r) => !r.l1.opened && r.l1.score === null)).toBe(true);
    const later = buildSheetPayload(getDb(), 'pos-ppk-a1', q1(), AT);
    expect(later.risks.find((r) => r.riskId === 'rr-a1-penyerapan')!.l1.score).toBe(3);
  });

  it('Lembar Mutu from the payload matches the live summary', () => {
    const db = getDb();
    const p = buildSheetPayload(db, 'pos-ppk-a1', q1(), AT);
    const live = lembarMutu(db, viewerFor(db, 'usr-andi', '2027-04-06'), 'pos-ppk-a1', q1(), AT);
    expect(mutuFromPayload(p).rows.map((r) => r.cells.map((c) => c.predicate))).toEqual(
      live.rows.map((r) => r.cells.map((c) => c.predicate)),
    );
  });

  it('masks risks for a late directorate and recomputes totals (FR-LBR-010)', () => {
    const at = '2027-04-04T09:00';
    const p = buildSheetPayload(getDb(), 'pos-ppk-a1', q1(), at);
    const { payload, masked } = maskPayloadFor(p, ['pos-pai']);
    expect(masked.length).toBe(3);
    const r = payload.risks.find((x) => x.riskId === masked[0])!;
    expect(r.l1.opened).toBe(false);
    expect(r.lini3.find((x) => x.positionId === 'pos-kepatuhan')!.opened).toBe(false);
    expect(mutuFromPayload(payload).sesuai + mutuFromPayload(payload).tidakSesuai).toBeLessThan(
      mutuFromPayload(p).sesuai + mutuFromPayload(p).tidakSesuai,
    );
  });
});

describe('snapshots (FR-LBR-006, 009, 010, INV-22)', () => {
  it('printing the live view creates a numbered provisional snapshot', async () => {
    const [id] = await sheetApi.print('pos-ppk-a1', 2027, 1, ['komunikasi']);
    const s = getDb().snapshots.find((x) => x.id === id)!;
    expect(s).toMatchObject({
      number: 'SIMARIO/LK/2027/TW1/DDKB-PPKA1/002',
      trigger: 'print',
      isProvisional: true,
      version: null,
    });
    expect(await sheetApi.findByNumber('simario/lk/2027/tw1/ddkb-ppka1/002')).toMatchObject({
      id,
      tw: 1,
    });
  });

  it('freezes Version 1 automatically and supersedes it when a late explanation is sent', async () => {
    // 20 Apr: every TW I comparison opened; pending explanations are past their deadline + 7 days.
    act(() => useClock.getState().setNow('2027-04-21T09:00'));
    runScheduledTasks('2027-04-21T09:00');
    const v1 = getDb().snapshots.find(
      (s) => s.quarterId === 'q-2027-1' && s.kind === 'komunikasi' && s.version === 1,
    )!;
    expect(v1).toMatchObject({
      trigger: 'auto_freeze',
      isProvisional: false,
      supersededById: null,
    });
    runScheduledTasks('2027-04-21T10:00');
    expect(
      getDb().snapshots.filter(
        (s) =>
          s.positionId === 'pos-ppk-a1' &&
          s.quarterId === 'q-2027-1' &&
          s.trigger === 'auto_freeze',
      ),
    ).toHaveLength(2);

    const r = getDb().results.find(
      (x) => x.riskQuarterId === 'rq-rr-a1-penyerapan-q-2027-1' && x.lini3PositionId === 'pos-pai',
    )!;
    await assessmentApi.saveExplanation(r.id, {
      reason: 'Dashboard belum dipakai.',
      plan: 'Rapat mingguan.',
    });
    await assessmentApi.sendExplanations('pos-ppk-a1', [r.id]);
    runScheduledTasks('2027-04-21T11:00');
    const v2 = getDb().snapshots.find(
      (s) => s.quarterId === 'q-2027-1' && s.kind === 'komunikasi' && s.version === 2,
    )!;
    expect(v2).toBeDefined();
    expect(getDb().snapshots.find((s) => s.id === v1.id)!.supersededById).toBe(v2.id);
    // The frozen copy does not change (INV-22).
    expect(JSON.stringify(getDb().snapshots.find((s) => s.id === v1.id)!.payload)).toBe(
      JSON.stringify(v1.payload),
    );
  });

  it('opens a frozen copy read-only exactly as stored', () => {
    const snap = getDb().snapshots.find((s) => s.quarterId === 'q-2026-4' && s.kind === 'mutu')!;
    const view = buildSheetView(getDb(), 'usr-andi', 'pos-ppk-a1', 2026, 4, snap.id, AT);
    expect(view.snapshot).toMatchObject({ version: 1, trigger: 'auto_freeze' });
    expect(view.payload).toEqual(snap.payload);
  });

  it('refuses a sixth photo and lets only that line choose', async () => {
    await expect(
      sheetApi.setPhotos('pos-ppk-a1', 'q-2027-1', 'A', ['a', 'b', 'c', 'd', 'e', 'f']),
    ).rejects.toMatchObject({ message: 'Maksimal 5 foto per bagian' });
    await expect(sheetApi.setPhotos('pos-ppk-a1', 'q-2027-1', 'B', [])).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});
