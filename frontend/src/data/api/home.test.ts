import { act } from '@testing-library/react';
import { lembarMutu } from '@/domain/rules/sheets';
import { viewerFor } from '@/domain/rules/visibility';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { runScheduledTasks } from '../local/scheduler';
import { getDb, useDb } from '../local/store';
import { buildHistory } from './history';
import { buildHome, buildPositionList } from './home';

const AT = '2027-04-06T09:00';

function reset(at = AT, asOf = false) {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow(at);
    useDb.getState().reset(asOf ? at : undefined);
  });
}

describe('Lembar Mutu (FR-LBR-004, VIS-7)', () => {
  beforeEach(() => reset());

  it('averages opened results only and excludes "Belum relevan"', () => {
    const db = getDb();
    const q = db.quarters.find((x) => x.id === 'q-2027-1')!;
    const m = lembarMutu(db, viewerFor(db, 'usr-andi', '2027-04-06'), 'pos-ppk-a1', q, AT);
    const ka = m.rows.find((r) => r.riskType === 'kinerja_anggaran')!;
    // L1 = (3 + 4 + 4) / 3 → Terkendali dengan Baik — Deviasi RPD "Belum relevan" excluded.
    expect(ka.cells[0]).toMatchObject({ predicate: 'terkendali', count: 3 });
    expect(ka.cells[0]).not.toHaveProperty('average');
    expect(m.tidakSesuai).toBeGreaterThan(0);
    expect(m.berulang).toBe(1);
  });

  it('shows nothing about risks a late directorate is still blind on (VIS-9)', () => {
    const db = getDb();
    const q = db.quarters.find((x) => x.id === 'q-2027-1')!;
    const late = lembarMutu(
      db,
      viewerFor(db, 'usr-maya', '2027-04-04'),
      'pos-ppk-a1',
      q,
      '2027-04-04T09:00',
    );
    const onTime = lembarMutu(
      db,
      viewerFor(db, 'usr-andi', '2027-04-04'),
      'pos-ppk-a1',
      q,
      '2027-04-04T09:00',
    );
    expect(late.sesuai + late.tidakSesuai).toBeLessThan(onTime.sesuai + onTime.tidakSesuai);
  });
});

describe('Riwayat (FR-RWY)', () => {
  beforeEach(() => reset());

  it('marks inactive quarters with "—" and links lineage across years', () => {
    const view = buildHistory(getDb(), 'usr-andi', 'pos-ppk-a1', 2027, AT);
    const rpd = view.rows.find((r) => r.risk.id === 'rr-a1-rpd')!;
    expect(rpd.inactiveLabel).toBe('Nonaktif sejak TW II');
    expect(rpd.cells[1]!.state).toBe('none');
    const pemecahan = view.rows.find((r) => r.risk.id === 'rr-a1-pemecahan')!;
    expect(pemecahan.recurring).toBe(true);
    expect(pemecahan.otherYears.map((o) => o.fiscalYear)).toEqual([2026]);
    expect(pemecahan.otherYears[0]!.cells.every((c) => c.state === 'open')).toBe(true);
    expect(pemecahan.cells[1]!.state).toBe('waiting');
  });
});

describe('Beranda (FR-BRD-010)', () => {
  it('Lini 1 in January owes last year TW IV and sees TW I opening later', () => {
    reset('2027-01-11T09:00', true);
    const home = buildHome(getDb(), 'usr-andi', 'pos-ppk-a1', '2027-01-11T09:00');
    expect(home.lini1!.obligations.map((o) => o.quarter.id)).toEqual([]);
    expect(home.lini1!.upcoming?.quarter.id).toBe('q-2027-1');
    expect(home.lini1!.lastQuarter?.mutu.quarter.id).toBe('q-2026-4');
  });

  it('Lini 1 after opening sees explanations due; Operators get no "draf siap" line', () => {
    reset();
    const andi = buildHome(getDb(), 'usr-andi', 'pos-ppk-a1', AT);
    expect(
      andi.lini1!.actions.some((a) => a.text.includes('hasil Tidak Sesuai menunggu penjelasan')),
    ).toBe(true);
    expect(andi.lini1!.actions.some((a) => a.text.includes('siap dari operator'))).toBe(true);
    const rafi = buildHome(getDb(), 'usr-rafi', 'pos-ppk-a1', AT);
    expect(rafi.lini1!.actions.some((a) => a.text.includes('siap dari operator'))).toBe(false);
  });

  it('Lini 2 lists coordinated positions sorted by quiet risks; Lini 3 sees attention counts', () => {
    reset();
    const siti = buildHome(getDb(), 'usr-siti', null, AT);
    expect(siti.lini2!.rows[0]!.positionId).toBe('pos-ppk-a1');
    const hendra = buildHome(getDb(), 'usr-hendra', null, AT);
    expect(hendra.lini3!.attention).toMatchObject({ berulang: 1 });
    expect(hendra.lini3!.obligations[0]!.quarter.id).toBe('q-2027-2');
  });

  it('Superadmin sees configuration health; PMD without holding sees the welcome', () => {
    reset();
    const admin = buildHome(getDb(), 'usr-admin', null, AT);
    expect(admin.health!.find((h) => h.label === 'Jabatan tanpa Pejabat')!.count).toBe(2);
    expect(admin.pmd).toBeUndefined();
    const nur = buildHome(getDb(), 'usr-nur', null, AT);
    expect(nur.pmd).toBeDefined();
    expect(nur.health).toBeUndefined();
  });

  it('the position directory follows the Unit scope', () => {
    reset();
    const dewi = buildPositionList(getDb(), 'usr-dewi', AT);
    expect(dewi.map((r) => r.positionId).sort()).toEqual(['pos-ppk-a1', 'pos-ppk-a2']);
  });
});

describe('reminders (FR-NTF-005, 009)', () => {
  it('notifies Lini 1 at H-7 once, idempotently', () => {
    reset('2027-03-19T08:00', true);
    act(() => useSession.getState().signIn('usr-andi'));
    runScheduledTasks('2027-03-19T08:00');
    runScheduledTasks('2027-03-19T09:00');
    const h7 = getDb().notifications.filter(
      (n) =>
        n.userId === 'usr-andi' &&
        n.kind === 'deadline' &&
        n.text.startsWith('Penilaian TW I PPK A-1: tenggat 26 Mar 2027'),
    );
    expect(h7).toHaveLength(1);
  });

  it('reminds H-1 before a mandatory explanation deadline', () => {
    reset('2027-04-08T08:00');
    runScheduledTasks('2027-04-08T08:00');
    expect(
      getDb().notifications.some(
        (n) =>
          n.userId === 'usr-andi' &&
          n.kind === 'explanation_required' &&
          n.text.includes('9 Apr 2027') &&
          n.createdAt === '2027-04-08T08:00',
      ),
    ).toBe(true);
  });
});
