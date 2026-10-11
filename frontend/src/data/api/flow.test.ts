// Tahap 10 scenario: the full TW I 2027 cycle for PPK A-1, switching personas and the clock,
// from score entry to a printed Lembar Komunikasi.

import { act } from '@testing-library/react';
import { buildSheetPayload, mutuFromPayload } from '@/domain/rules/sheetPayload';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { runScheduledTasks } from '../local/scheduler';
import { getDb, useDb } from '../local/store';
import { assessmentApi } from './assessment';
import { sheetApi } from './sheets';
import { threadApi } from './thread';

const as = (id: string) => act(() => useSession.getState().signIn(id));
const at = (t: string) => {
  act(() => useClock.getState().setNow(t));
  runScheduledTasks(t);
};
const A1 = 'pos-ppk-a1';
const TW1 = 'q-2027-1';
const rq = (risk: string) => `rq-${risk}-${TW1}`;
const risks = () =>
  getDb()
    .riskQuarters.filter((x) => x.quarterId === TW1 && x.registerRiskId.startsWith('rr-a1-'))
    .map((x) => x.id);

it('runs TW I end to end without blocking anyone', async () => {
  useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
  act(() => useClock.getState().setNow('2027-03-18T09:00'));
  useDb.getState().reset('2027-03-18T09:00');

  // 18 Mar — Rafi records a Langkah and drafts every score; Andi finalises.
  as('usr-rafi');
  await threadApi.post({
    riskId: 'rr-a1-dipa',
    mitigationId: null,
    body: 'Revisi DIPA diajukan.',
    isStep: true,
    files: [],
    mentionUserIds: [],
  });
  const scores: Record<string, number | 'nr'> = {
    'rr-a1-penyerapan': 2.4,
    'rr-a1-dipa': 3.2,
    'rr-a1-rpd': 'nr',
    'rr-a1-pemecahan': 2.6,
    'rr-a1-pembayaran': 3.1,
    'rr-a1-material': 3.1,
    'rr-a1-penyuapan': 1.9,
  };
  for (const [risk, s] of Object.entries(scores)) {
    if (s === 'nr') {
      await assessmentApi.saveCell(rq(risk), A1, { notRelevant: true });
      await assessmentApi.saveCell(rq(risk), A1, {
        notRelevantReason: 'Belum ada penarikan dana kegiatan.',
      });
    } else await assessmentApi.saveCell(rq(risk), A1, { score: s });
  }
  await assessmentApi.markReady(A1, TW1, A1);
  as('usr-andi');
  at('2027-03-25T16:00');
  expect((await assessmentApi.finalise(A1, TW1, A1)).toFinalise).toBe(7);

  // 1–2 Apr — both directorates assess blind and finalise.
  at('2027-04-01T10:00');
  for (const [who, pos] of [
    ['usr-hendra', 'pos-kepatuhan'],
    ['usr-maya', 'pos-pai'],
  ] as const) {
    as(who);
    for (const id of risks())
      await assessmentApi.saveCell(id, pos, {
        score: pos === 'pos-pai' && id.includes('penyerapan') ? 1.8 : 2.6,
      });
    await assessmentApi.finalise(A1, TW1, pos);
  }
  // Every comparison opened on the last finalise.
  expect(
    getDb()
      .riskQuarters.filter((x) => risks().includes(x.id))
      .every((x) => x.comparisonStatus === 'open'),
  ).toBe(true);

  // Andi explains every mandatory mismatch.
  as('usr-andi');
  const due = getDb().results.filter(
    (r) => risks().includes(r.riskQuarterId) && r.explanationRequired,
  );
  for (const r of due)
    await assessmentApi.saveExplanation(r.id, {
      reason: 'Kendala jadwal.',
      plan: 'Percepatan paket.',
    });
  expect(
    await assessmentApi.sendExplanations(
      A1,
      due.map((r) => r.id),
    ),
  ).toBe(due.length);

  // Next scheduler run freezes Version 1; printing makes a numbered, non-provisional copy.
  at('2027-04-03T09:00');
  const v1 = getDb().snapshots.find(
    (s) =>
      s.positionId === A1 &&
      s.quarterId === TW1 &&
      s.trigger === 'auto_freeze' &&
      s.kind === 'komunikasi',
  );
  expect(v1?.version).toBe(1);
  const [id] = await sheetApi.print(A1, 2027, 1, ['komunikasi']);
  const snap = getDb().snapshots.find((s) => s.id === id)!;
  expect(snap).toMatchObject({ isProvisional: false, version: 1, trigger: 'print' });
  const p = buildSheetPayload(
    getDb(),
    A1,
    getDb().quarters.find((q) => q.id === TW1)!,
    '2027-04-03T09:00',
  );
  expect(p.risks.find((r) => r.riskId === 'rr-a1-dipa')!.steps).toHaveLength(1);
  expect(mutuFromPayload(p).tidakSesuai).toBeGreaterThan(0);
});
