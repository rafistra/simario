import { act } from '@testing-library/react';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import type { ApiError } from '../local/call';
import { getDb, useDb } from '../local/store';
import { buildAssessment } from './assessment';
import { boardApi, buildBoard, buildThread } from './board';
import { buildHistory } from './history';
import { registerApi } from './register';
import { buildRegisterView } from './registerView';
import { buildSheetView, sheetApi } from './sheets';

const AT = '2027-04-06T09:00';
const TODAY = AT.slice(0, 10);
const A1 = 'pos-ppk-a1';
const A2 = 'pos-ppk-a2';
const POKJA = 'pos-pokja-03';
/** Pejabat PPK A-2 with scope Sendiri: PPK A-1 lies outside it. */
const OUTSIDER = 'usr-bambang';

function as(userId: string) {
  act(() => useSession.getState().signIn(userId));
}

/** The ApiError code a read model throws, or null when it returns. */
function codeOf(read: () => unknown): string | null {
  try {
    read();
    return null;
  } catch (e) {
    return (e as ApiError).code;
  }
}

const readModels = (userId: string, positionId = A1, year = 2027) => {
  const db = getDb();
  return {
    board: () => buildBoard(db, userId, positionId, year, AT),
    assessment: () => buildAssessment(db, userId, positionId, year, 1, AT),
    history: () => buildHistory(db, userId, positionId, year, AT),
    sheets: () => buildSheetView(db, userId, positionId, year, 1, null, AT),
    register: () => buildRegisterView(db, userId, positionId, year, TODAY),
  };
};

beforeEach(() => {
  useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
  useClock.getState().setNow(AT);
  useDb.getState().reset();
});

describe('read access in the read models (permission 1 scope, §1.5)', () => {
  it('refuses every read model of a position outside the viewer’s scope', () => {
    for (const [name, read] of Object.entries(readModels(OUTSIDER)))
      expect(codeOf(read), name).toBe('forbidden');
    expect(codeOf(() => buildThread(getDb(), OUTSIDER, 'rr-a1-penyerapan', AT))).toBe('forbidden');
  });

  it.each([
    ['usr-rafi', 'Operator of the position'],
    ['usr-dewi', 'scope Unit'],
    ['usr-siti', 'Lini 2 assigned this year'],
    ['usr-hendra', 'Lini 3, scope Semua'],
  ])('lets %s (%s) read every view', (userId) => {
    for (const [name, read] of Object.entries(readModels(userId)))
      expect(codeOf(read), name).toBeNull();
    expect(codeOf(() => buildThread(getDb(), userId, 'rr-a1-penyerapan', AT))).toBeNull();
  });

  it('scopes Lini 2 to the fiscal years of its monitoring assignment', () => {
    // Siti coordinates PPK A-2 in TA 2027 only.
    expect(codeOf(readModels('usr-siti', A2, 2027).board)).toBeNull();
    expect(codeOf(readModels('usr-siti', A2, 2026).board)).toBe('forbidden');
  });

  it('applies the same check behind the repository calls', async () => {
    as(OUTSIDER);
    await expect(boardApi.board(A1, 2027)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(registerApi.view({ positionId: A1, fiscalYear: 2027 })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('refuses printing outside scope without creating a snapshot', async () => {
    const before = getDb().snapshots.length;
    as(OUTSIDER);
    await expect(sheetApi.print(A1, 2027, 1, ['komunikasi'])).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(getDb().snapshots).toHaveLength(before);
  });

  it('treats a snapshot number outside scope as unknown', async () => {
    const number = getDb().snapshots.find((s) => s.positionId === A1)!.number;
    as(OUTSIDER);
    await expect(sheetApi.findByNumber(number)).rejects.toMatchObject({ code: 'not_found' });
    as('usr-andi');
    await expect(sheetApi.findByNumber(number)).resolves.toMatchObject({ positionId: A1 });
  });
});

describe('register visibility per viewer (FR-REG-012)', () => {
  const riskIds = (userId: string, positionId = A1) => {
    const view = buildRegisterView(getDb(), userId, positionId, 2027, TODAY);
    return {
      view,
      all: view.risks.map((r) => r.id),
      inStages: view.stages.flatMap((s) => s.subsections.flatMap((x) => x.risks.map((r) => r.id))),
    };
  };

  it('withholds unpublished additions from readers but not from holders', () => {
    const reader = riskIds('usr-dewi');
    expect(reader.all).not.toContain('rr-a1-berulang');
    expect(reader.inStages).not.toContain('rr-a1-berulang');
    expect(reader.view.pending.risks).toHaveLength(0);
    expect(reader.view.gaps).toHaveLength(0);
    expect(reader.view.access.isHolder).toBe(false);

    const holder = riskIds('usr-rafi');
    expect(holder.all).toContain('rr-a1-berulang');
    expect(holder.inStages).toContain('rr-a1-berulang');
    expect(holder.view.pending.risks.map((r) => r.id)).toContain('rr-a1-berulang');
  });

  it('withholds a draft mitigation under a published risk from readers', async () => {
    as('usr-rafi');
    await registerApi.addCustomMitigation('rr-a1-penyerapan', 'Rapat koordinasi penyerapan.');
    const draft = getDb().mitigations.find(
      (m) => m.registerRiskId === 'rr-a1-penyerapan' && m.status === 'draft',
    )!;
    const mitigationsOf = (userId: string) =>
      buildRegisterView(getDb(), userId, A1, 2027, TODAY)
        .stages.flatMap((s) => s.subsections)
        .find((x) => x.risks.some((r) => r.id === 'rr-a1-penyerapan'))!
        .mitigations['rr-a1-penyerapan']!.map((m) => m.id);
    expect(mitigationsOf('usr-dewi')).not.toContain(draft.id);
    expect(mitigationsOf('usr-andi')).toContain(draft.id);
  });

  it('shows readers nothing of a register that was never published', () => {
    // Pokja Pemilihan 03 · TA 2027 is still a draft; Siti coordinates it.
    const reader = riskIds('usr-siti', POKJA);
    expect(reader.view.unpublishedForReader).toBe(true);
    expect(reader.view.register).toBeNull();
    expect(reader.all).toHaveLength(0);
    expect(reader.inStages).toHaveLength(0);

    // A Pokja member who is not the Pengisi still holds the position and sees the draft.
    const member = riskIds('usr-ratna', POKJA);
    expect(member.view.unpublishedForReader).toBe(false);
    expect(member.all).toContain('rr-pokja-kak');
  });
});
