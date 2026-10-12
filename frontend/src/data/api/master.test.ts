import { act } from '@testing-library/react';
import { produce } from 'immer';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { activateScoreBands } from '../local/scheduler';
import { getDb, useDb } from '../local/store';
import { masterApi, templateUsage } from './master';

function as(userId: string) {
  act(() => useSession.getState().signIn(userId));
}

beforeEach(() => {
  useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
  useClock.getState().setNow('2027-10-12T09:00');
  useDb.getState().reset();
  as('usr-nur');
});

describe('permissions are enforced in the repository', () => {
  it('refuses master-data writes to a Lini 1 user', async () => {
    as('usr-andi');
    await expect(masterApi.renameStage('stg-PPK-T1', 'Perencanaan')).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('positions and types (FR-MST-008, 009)', () => {
  it('refuses to deactivate a type that active positions use', async () => {
    as('usr-admin');
    await expect(masterApi.setPositionTypeActive('pt-pokja', false)).rejects.toMatchObject({
      code: 'type_in_use',
      details: { positions: ['pos-pokja-03'] },
    });
  });

  it('rejects a duplicate code within the work unit', async () => {
    await expect(
      masterApi.savePosition({
        positionTypeId: 'pt-ppk',
        code: 'ppka1',
        name: 'PPK A-9',
        orgUnitId: 'ou-ddkb',
        identity: {},
      }),
    ).rejects.toMatchObject({ details: { code: 'Kode jabatan sudah dipakai.' } });
    const id = await masterApi.savePosition({
      positionTypeId: 'pt-ppk',
      code: 'PPKA3',
      name: 'PPK A-3',
      orgUnitId: 'ou-ddkb',
      identity: {},
    });
    expect(getDb().positions.find((p) => p.id === id)?.active).toBe(true);
  });

  it('deactivates a position with a reason, ends its Operators, and audits it', async () => {
    await expect(masterApi.deactivatePosition('pos-ppk-a2', ' ')).rejects.toThrow(
      'Alasan penonaktifan wajib diisi.',
    );
    await masterApi.deactivatePosition('pos-ppk-a2', 'Digabung ke PPK A-1.');
    const db = getDb();
    expect(db.positions.find((p) => p.id === 'pos-ppk-a2')!.active).toBe(false);
    expect(db.delegates.find((d) => d.id === 'del-dimas-a2')!.endReason).toBe('revoked');
    expect(db.audit.at(-1)).toMatchObject({
      action: 'nonaktifkan_jabatan',
      entityId: 'pos-ppk-a2',
    });
    expect(
      db.notifications.some((n) => n.userId === 'usr-dimas' && n.kind === 'operator_revoked'),
    ).toBe(true);
  });
});

describe('stages (FR-MST-001)', () => {
  it('keeps names unique per type and never deletes a used stage', async () => {
    await expect(masterApi.renameStage('stg-PPK-T2', 'Perencanaan Pengadaan')).rejects.toThrow(
      'Nama tahap sudah dipakai pada jenis ini.',
    );
    await expect(masterApi.deleteStage('stg-PPK-LEGACY-PL')).rejects.toMatchObject({
      code: 'stage_in_use',
    });
    const id = await masterApi.addStage('pt-ppk', 'Uji Coba Tahap');
    await masterApi.deleteStage(id);
    expect(getDb().stages.some((s) => s.id === id)).toBe(false);
  });

  it('saves a new order immediately', async () => {
    await masterApi.reorderStages('pt-pokja', ['stg-POKJA-T3', 'stg-POKJA-T1', 'stg-POKJA-T2']);
    const order = getDb()
      .stages.filter((s) => s.positionTypeId === 'pt-pokja')
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id);
    expect(order).toEqual(['stg-POKJA-T3', 'stg-POKJA-T1', 'stg-POKJA-T2']);
  });
});

describe('templates and proposals (FR-MST-003 … 005)', () => {
  it('counts usage per current fiscal year and refuses deleting a used template', async () => {
    expect(templateUsage(getDb(), 'tpl-PPK-T1-FR-03', 2027)).toBe(1);
    await expect(masterApi.deleteTemplate('tpl-PPK-T1-FR-03')).rejects.toMatchObject({
      code: 'template_used',
    });
  });

  it('edits wording without touching registers (RB-MST-001)', async () => {
    await masterApi.saveTemplate(
      {
        positionTypeId: 'pt-ppk',
        stageId: 'stg-PPK-T1',
        riskType: 'kecurangan',
        description: 'Pemecahan kontrak pengadaan.',
        mitigations: ['Satu', '', 'Dua'],
      },
      'tpl-PPK-T1-FR-03',
    );
    const db = getDb();
    expect(db.riskTemplates.find((t) => t.id === 'tpl-PPK-T1-FR-03')!.description).toBe(
      'Pemecahan kontrak pengadaan.',
    );
    expect(
      db.mitigationTemplates
        .filter((m) => m.riskTemplateId === 'tpl-PPK-T1-FR-03')
        .map((m) => m.description),
    ).toEqual(['Satu', 'Dua']);
    expect(db.risks.find((r) => r.id === 'rr-a1-pemecahan')!.descriptionSnapshot).toBe(
      'Pemecahan kontrak.',
    );
  });

  it('accepts a proposal as a template and rejects only with a reason', async () => {
    await expect(masterApi.rejectProposal('prop-2', '')).rejects.toThrow(
      'Alasan penolakan wajib diisi.',
    );
    await masterApi.rejectProposal('prop-2', 'Sudah tercakup template KPA.');
    await masterApi.saveTemplate(
      {
        positionTypeId: 'pt-ppk',
        stageId: 'stg-PPK-T1',
        riskType: 'kinerja_anggaran',
        description: 'Keterlambatan revisi DIPA menghambat jadwal pengadaan.',
        mitigations: [],
      },
      undefined,
      'prop-1',
    );
    const db = getDb();
    expect(db.proposals.map((p) => p.status)).toEqual(['accepted', 'rejected']);
    expect(
      db.notifications.filter((n) => n.userId === 'usr-rafi' && n.kind.startsWith('proposal')),
    ).toHaveLength(2);
  });
});

describe('score bands (FR-MST-007, INV-3)', () => {
  it('refuses to save the draft with a 1,9–2,0 gap', async () => {
    const bands = getDb().scoreBands.filter((b) => b.versionId === 'sbv-2');
    await expect(
      masterApi.saveBandVersion('sbv-2', { effectiveFrom: '2028-01-01', bands }),
    ).rejects.toMatchObject({
      code: 'bands_invalid',
      details: [{ kind: 'gap', from: 1.9, to: 2.0 }],
    });
  });

  it('schedules a valid version and activates it on its effective date only', async () => {
    const bands = getDb()
      .scoreBands.filter((b) => b.versionId === 'sbv-2')
      .map((b) => (b.predicate === 'cukup' ? { ...b, lowerExclusive: 1.9 } : b));
    await masterApi.saveBandVersion('sbv-2', { effectiveFrom: '2028-01-01', bands });
    const saved = getDb();
    expect(saved.scoreBandVersions.find((v) => v.id === 'sbv-2')!.status).toBe('scheduled');
    const before = produce(saved, (d) => activateScoreBands(d, '2027-12-31T23:59'));
    expect(before.scoreBandVersions.find((v) => v.status === 'active')!.id).toBe('sbv-1');
    const after = produce(saved, (d) => activateScoreBands(d, '2028-01-01T00:00'));
    expect(after.scoreBandVersions.filter((v) => v.status === 'active').map((v) => v.id)).toEqual([
      'sbv-2',
    ]);
    // Quarters already open keep their version.
    expect(after.quarters.find((q) => q.id === 'q-2027-2')!.scoreBandVersionId).toBe('sbv-1');
  });

  it('fixes a quarter band version when its first window opens', () => {
    const db = getDb();
    const tw3 = produce(db, (d) => activateScoreBands(d, '2027-07-01T00:00'));
    expect(tw3.quarters.find((q) => q.id === 'q-2027-3')!.scoreBandVersionId).toBe('sbv-1');
    expect(tw3.quarters.find((q) => q.id === 'q-2027-4')!.scoreBandVersionId).toBeNull();
  });
});

describe('Data Umum forms (FR-MST-006)', () => {
  it('validates labels and list options, then saves a new version', async () => {
    await expect(
      masterApi.saveDataUmumForm('pt-kpa', 'Tujuan', [
        { key: '', label: 'Target', kind: 'text', mandatory: false },
        { key: '', label: 'Sumber Dana', kind: 'list', mandatory: true, options: ['Rupiah Murni'] },
      ]),
    ).rejects.toMatchObject({
      details: { 0: 'Label isian sudah dipakai.', 1: 'Tambahkan minimal dua pilihan.' },
    });
    const version = await masterApi.saveDataUmumForm('pt-kpa', 'Tujuan baru.', [
      {
        key: '',
        label: 'Sumber Dana',
        kind: 'list',
        mandatory: true,
        options: ['Rupiah Murni', 'PNBP'],
      },
    ]);
    expect(version).toBe(2);
    const forms = getDb().dataUmumForms.filter((f) => f.positionTypeId === 'pt-kpa');
    expect(forms.filter((f) => f.active).map((f) => f.version)).toEqual([2]);
    // Registers keep the version they started with.
    expect(getDb().registers.find((r) => r.id === 'reg-kpa-a-2026')!.dataUmumFormId).toBe(
      'du-pt-kpa-v1',
    );
  });

  it('keeps Tujuan optional and off by default; a saved version can switch it on', async () => {
    const forms = () => getDb().dataUmumForms.filter((f) => f.active);
    expect(forms().every((f) => !f.objectiveEnabled)).toBe(true);
    await masterApi.saveDataUmumForm('pt-kpa', '', [], true);
    const kpa = forms().find((f) => f.positionTypeId === 'pt-kpa')!;
    expect(kpa.objectiveEnabled).toBe(true);
    expect(kpa.defaultObjective).toBe('');
  });
});
