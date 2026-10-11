import { act } from '@testing-library/react';
import { holdingsOf } from '@/domain/rules/access';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { runScheduledTasks } from '../local/scheduler';
import { getDb, useDb } from '../local/store';
import { adminApi } from './admin';
import { archiveStatus, calendarApi } from './calendar';
import { importApi } from './importer';
import { buildAudit, buildMetrics } from './insights';

const AT = '2027-04-06T09:00';
const as = (id: string) => act(() => useSession.getState().signIn(id));

beforeEach(() => {
  act(() => {
    useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
    useClock.getState().setNow(AT);
    useDb.getState().reset();
  });
  as('usr-admin');
});

const occOf = (userId: string, pos: string) =>
  getDb().occupancies.find((o) => o.userId === userId && o.positionId === pos && !o.endDate);

describe('users and holdings (FR-ADM-004/005)', () => {
  it('refuses appointing to an occupied single-Pejabat position', async () => {
    await expect(
      adminApi.assignPosition({
        userId: 'usr-dewi',
        positionId: 'pos-ppk-a1',
        decreeNo: 'X',
        decreeDate: '2027-04-01',
        decreeFile: null,
        startDate: '2027-04-01',
        isFiller: false,
      }),
    ).rejects.toMatchObject({
      message: 'Jabatan ini sudah memiliki Pejabat. Gunakan Alih Pejabat.',
    });
  });

  it('Alih Pejabat ends the outgoing Operators immediately', async () => {
    const out = occOf('usr-andi', 'pos-ppk-a1')!;
    const r = await adminApi.replaceOfficial({
      positionId: 'pos-ppk-a1',
      outgoingOccupancyId: out.id,
      incomingUserId: 'usr-bambang',
      effectiveDate: '2027-04-06',
      decreeNo: 'KEP-50',
      decreeDate: '2027-04-05',
      decreeFile: 'sk.pdf',
    });
    expect(r.operatorsEnded).toBe(1);
    const today = '2027-04-06';
    expect(holdingsOf(getDb(), 'usr-rafi', today).some((h) => h.positionId === 'pos-ppk-a1')).toBe(
      false,
    );
    expect(holdingsOf(getDb(), 'usr-andi', today).some((h) => h.positionId === 'pos-ppk-a1')).toBe(
      false,
    );
    expect(
      holdingsOf(getDb(), 'usr-bambang', today).find((h) => h.positionId === 'pos-ppk-a1')
        ?.isFiller,
    ).toBe(true);
    expect(
      getDb().notifications.some((n) => n.userId === 'usr-rafi' && n.kind === 'operator_revoked'),
    ).toBe(true);
    await expect(
      adminApi.replaceOfficial({
        positionId: 'pos-ppk-a1',
        outgoingOccupancyId: occOf('usr-bambang', 'pos-ppk-a1')!.id,
        incomingUserId: 'usr-dewi',
        effectiveDate: '2027-05-01',
        decreeNo: 'K',
        decreeDate: '2027-04-01',
        decreeFile: null,
      }),
    ).rejects.toMatchObject({ message: 'Tanggal efektif tidak boleh melewati hari ini.' });
  });

  it('refuses deactivating the Pengisi of a Pokja with other members', async () => {
    await expect(adminApi.deactivateUser('usr-dimas')).rejects.toMatchObject({ code: 'filler' });
  });

  it('keeps at least one manager of roles (INV-5)', async () => {
    await expect(adminApi.deactivateUser('usr-admin')).rejects.toMatchObject({ code: 'inv5' });
  });
});

describe('roles (FR-ADM-001/002)', () => {
  it('locks Superadmin, guards permission 10 and in-use roles', async () => {
    await expect(adminApi.setPermission('role-sad', 1, false, null)).rejects.toMatchObject({
      code: 'locked',
    });
    await expect(adminApi.setPermission('role-pmt', 10, true, 'semua')).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(adminApi.deleteRole('role-pmr')).rejects.toMatchObject({ code: 'in_use' });
    const id = await adminApi.addRole('Pembaca Audit');
    await adminApi.setPermission(id, 23, true, 'unit');
    expect(getDb().rolePermissions.find((p) => p.roleId === id && p.permission === 23)?.scope).toBe(
      'unit',
    );
  });
});

describe('assignments (INV-14)', () => {
  it('refuses a second lead for an overlapping quarter', async () => {
    await expect(
      adminApi.addAssignments({
        targets: ['pos-ppk-a2'],
        lead: 'pos-pj-pemantauan',
        supports: [],
        fromQuarterId: 'q-2027-4',
        toQuarterId: 'q-2027-4',
        decreeNo: 'K',
      }),
    ).rejects.toMatchObject({
      message: 'PPK A-2 sudah memiliki penanggung jawab pada TW IV TA 2027.',
    });
  });
});

describe('Operators (FR-ADM-010)', () => {
  it('Andi appoints Galih, who can then sign in as Operator', async () => {
    as('usr-andi');
    const galih = await adminApi.appointOperator({
      positionId: 'pos-ppk-a1',
      nip: '199812012024011001',
      letterNo: 'ND-77',
      letterDate: '2027-04-06',
      letterFile: 'nd.pdf',
      endDate: null,
    });
    const u = getDb().users.find((x) => x.id === galih)!;
    expect(u).toMatchObject({ fullName: 'Galih Pratama', createdVia: 'delegation', active: true });
    expect(holdingsOf(getDb(), galih, '2027-04-06')[0]).toMatchObject({
      positionId: 'pos-ppk-a1',
      capacity: 'operator',
    });
    expect(
      getDb().notifications.some(
        (n) =>
          n.userId === galih &&
          n.text.startsWith('Anda ditunjuk sebagai operator untuk PPK A-1 oleh Andi Wirawan'),
      ),
    ).toBe(true);
    as('usr-rafi');
    await expect(
      adminApi.appointOperator({
        positionId: 'pos-ppk-a1',
        nip: '199910172024012002',
        letterNo: 'x',
        letterDate: '2027-04-06',
        letterFile: 'x.pdf',
        endDate: null,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('fiscal years and archive (FR-ADM-007, §2.5)', () => {
  it('creates a year with default quarters and validates INV-9', async () => {
    await calendarApi.createFiscalYear(2028);
    const q = getDb().quarters.find((x) => x.id === 'q-2028-1')!;
    expect(q).toMatchObject({
      startsOn: '2028-01-01',
      lini1OpensOn: '2028-03-01',
      lini3Deadline: '2028-04-07',
    });
    await expect(
      calendarApi.updateQuarter('q-2028-1', { lini3Deadline: '2028-03-01' }),
    ).rejects.toMatchObject({ code: 'inv9' });
  });

  it('archives at the hard limit: not assessed, not sent, read-only', () => {
    act(() => useClock.getState().setNow('2028-02-20T09:00'));
    const st = archiveStatus(getDb(), 2027, '2028-02-20');
    expect(st.baseHardLimit).toBe('2028-02-13');
    runScheduledTasks('2028-02-20T09:00');
    const db = getDb();
    expect(db.fiscalYears.find((f) => f.year === 2027)).toMatchObject({
      status: 'archived',
      archivedBy: 'hard_limit',
    });
    expect(db.results.some((r) => r.explanationStatus === 'not_sent')).toBe(true);
    expect(
      db.assessments.some(
        (a) => a.riskQuarterId === 'rq-rr-a1-penyerapan-q-2027-2' && a.status === 'not_assessed',
      ),
    ).toBe(true);
    expect(db.snapshots.some((s) => s.trigger === 'archive')).toBe(true);
  });

  it('excludes a Lini 3 position only before it finalised anything', async () => {
    await expect(
      calendarApi.excludeAssessor('q-2027-1', 'pos-pai', 'Kosong'),
    ).rejects.toMatchObject({ code: 'validation' });
    await calendarApi.excludeAssessor('q-2027-2', 'pos-pai', 'Jabatan kosong sementara');
    expect(
      getDb().quarterAssessors.find((x) => x.quarterId === 'q-2027-2' && x.positionId === 'pos-pai')
        ?.excluded,
    ).toBe(true);
  });
});

describe('bulk import (FR-ADM-013)', () => {
  it('reports errors per row and writes nothing until clean', async () => {
    const bad =
      'kode_unit,kode_jabatan,nama_jabatan,jenis_jabatan\nDDKB,PPKA1,PPK A-1 Lagi,PPK\nXX,PPKA9,PPK A-9,PPK';
    const dry = await importApi.dryRun('jabatan', bad);
    expect(dry.errors.map((e) => [e.row, e.column])).toEqual([
      [2, 'kode_jabatan'],
      [3, 'kode_unit'],
    ]);
    await expect(importApi.apply('jabatan', bad)).rejects.toMatchObject({
      message: 'Perbaiki 2 baris bermasalah terlebih dahulu',
    });
    const count = getDb().positions.length;
    await importApi.apply(
      'jabatan',
      'kode_unit,kode_jabatan,nama_jabatan,jenis_jabatan\nDDKB,PPKA3,PPK A-3,PPK',
    );
    expect(getDb().positions.length).toBe(count + 1);
    expect((await importApi.history())[0]).toMatchObject({ kind: 'jabatan', rows: 1 });
  });
});

describe('metrics and audit (FR-ADM-011, 008, VIS-8)', () => {
  it('reports "Data belum cukup" instead of a misleading zero', () => {
    const m = buildMetrics(getDb(), 2027, AT);
    expect(m.find((x) => x.objective === 8)!.value).toBeNull();
    expect(m.find((x) => x.objective === 1)!.value).toBeGreaterThan(0.5);
  });

  it('redacts blind scores in audit values', async () => {
    as('usr-hendra');
    const { assessmentApi } = await import('./assessment');
    await assessmentApi.saveCell('rq-rr-a1-dipa-q-2027-2', 'pos-kepatuhan', { score: 2.2 });
    const rows = buildAudit(getDb(), 'usr-admin', { action: 'simpan_draf_penilaian' }, AT, false);
    expect(JSON.stringify(rows[0]!.after)).toContain('[disamarkan]');
    const original = buildAudit(
      getDb(),
      'usr-admin',
      { action: 'simpan_draf_penilaian' },
      AT,
      true,
    );
    expect(JSON.stringify(original[0]!.after)).toContain('2.2');
  });
});
