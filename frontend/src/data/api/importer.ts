// Bulk import — FR-ADM-013. Upload → dry run with a row/column/message report → "Terapkan"
// commits every row in one transaction only when there are no errors.

import { hasPermission } from '@/domain/rules/access';
import type { MonitoringSupport } from '@/domain/types';
import type { DB } from '../db';
import { requireActor, type Actor } from '../local/actor';
import { ApiError, call } from '../local/call';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit } from '../local/writers';
import { applyAssignment } from './admin';

export type ImportKind = 'jabatan' | 'pejabat' | 'penugasan';

export const IMPORT_PERMISSION: Record<ImportKind, number> = {
  jabatan: 18,
  pejabat: 21,
  penugasan: 20,
};
export const IMPORT_LABEL: Record<ImportKind, string> = {
  jabatan: 'Jabatan',
  pejabat: 'Penetapan Pejabat',
  penugasan: 'Penugasan Pemantauan',
};

export interface ImportError {
  row: number;
  column: string;
  message: string;
}

export interface DryRun {
  kind: ImportKind;
  rows: number;
  valid: number;
  errors: ImportError[];
}

/** Minimal RFC 4180 parser (quotes, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) out.push(row);
  return out;
}

export function csvTemplate(db: DB, kind: ImportKind): string {
  if (kind === 'jabatan') {
    const keys = [
      ...new Set(
        db.positionTypes.flatMap((t) => t.identitySchema.map((f) => `identitas.${f.key}`)),
      ),
    ];
    return [
      ['kode_unit', 'kode_jabatan', 'nama_jabatan', 'jenis_jabatan', ...keys].join(','),
      [
        'DDKB',
        'PPKA3',
        'PPK A-3',
        'PPK',
        ...keys.map((k) => (k.endsWith('nama_jabatan_ppk') ? 'Pejabat Pembuat Komitmen A-3' : '')),
      ].join(','),
    ].join('\n');
  }
  if (kind === 'pejabat')
    return 'nip,nama_lengkap,email,kode_unit,kode_jabatan,nomor_sk,tanggal_sk,tanggal_mulai,pengisi\n199812012024011001,Galih Pratama,galih.pratama@ikn.go.id,DSPD,PPKB2,KEP-40/OIKN/2027,2027-04-01,2027-04-01,ya';
  return 'kode_unit_lini1,kode_jabatan_lini1,kode_unit_pj,kode_jabatan_pj,pendukung,tw_mulai,tw_selesai,nomor_sk\nDSPD,PPKB2,DPDN,PJPM-DPDN,BKBA/UPPM-BKBA:kinerja_anggaran;BUPBJ/UPPM-UKPBJ:pbj,2027-2,2027-4,KEP-41/OIKN/2027';
}

interface Plan {
  dry: DryRun;
  apply: (d: DB, a: Actor) => void;
}

const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function plan(db: DB, kind: ImportKind, text: string, today: string): Plan {
  const table = parseCsv(text.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), ''));
  const header = (table[0] ?? []).map((h) => h.trim());
  const rows = table.slice(1);
  const errors: ImportError[] = [];
  const err = (row: number, column: string, message: string) =>
    errors.push({ row, column, message });
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? '').trim();
  const unitByCode = (code: string) =>
    db.orgUnits.find((u) => u.code.toLowerCase() === code.toLowerCase());
  const posByCode = (unit: string, code: string) => {
    const u = unitByCode(unit);
    return u
      ? db.positions.find(
          (p) => p.orgUnitId === u.id && p.code.toLowerCase() === code.toLowerCase(),
        )
      : undefined;
  };
  const required: Record<ImportKind, string[]> = {
    jabatan: ['kode_unit', 'kode_jabatan', 'nama_jabatan', 'jenis_jabatan'],
    pejabat: [
      'nip',
      'nama_lengkap',
      'email',
      'kode_unit',
      'kode_jabatan',
      'nomor_sk',
      'tanggal_sk',
      'tanggal_mulai',
      'pengisi',
    ],
    penugasan: [
      'kode_unit_lini1',
      'kode_jabatan_lini1',
      'kode_unit_pj',
      'kode_jabatan_pj',
      'pendukung',
      'tw_mulai',
      'tw_selesai',
      'nomor_sk',
    ],
  };
  for (const h of required[kind])
    if (!header.includes(h)) err(1, h, 'Kolom wajib tidak ada pada baris judul.');
  const ops: ((d: DB, a: Actor) => void)[] = [];
  if (errors.length) return { dry: { kind, rows: rows.length, valid: 0, errors }, apply: () => {} };

  rows.forEach((r, i) => {
    const n = i + 2;
    const before = errors.length;
    if (kind === 'jabatan') {
      const unit = unitByCode(col(r, 'kode_unit'));
      const type = db.positionTypes.find(
        (t) =>
          t.code.toLowerCase() === col(r, 'jenis_jabatan').toLowerCase() ||
          t.name.toLowerCase() === col(r, 'jenis_jabatan').toLowerCase(),
      );
      if (!unit) err(n, 'kode_unit', `Unit kerja "${col(r, 'kode_unit')}" tidak dikenal.`);
      if (!type)
        err(n, 'jenis_jabatan', `Jenis jabatan "${col(r, 'jenis_jabatan')}" tidak dikenal.`);
      if (!col(r, 'kode_jabatan')) err(n, 'kode_jabatan', 'Kode jabatan wajib diisi.');
      if (!col(r, 'nama_jabatan')) err(n, 'nama_jabatan', 'Nama jabatan wajib diisi.');
      if (unit && posByCode(unit.code, col(r, 'kode_jabatan')))
        err(n, 'kode_jabatan', 'Kode jabatan sudah dipakai di unit kerja ini (INV-2).');
      if (
        rows
          .slice(0, i)
          .some(
            (o) =>
              col(o, 'kode_unit') === col(r, 'kode_unit') &&
              col(o, 'kode_jabatan') === col(r, 'kode_jabatan'),
          )
      )
        err(n, 'kode_jabatan', 'Kode jabatan ganda di berkas ini.');
      if (errors.length === before && unit && type) {
        const identity = Object.fromEntries(
          type.identitySchema
            .map((f) => [f.key, col(r, `identitas.${f.key}`)])
            .filter(([, v]) => v),
        );
        ops.push((d) =>
          d.positions.push({
            id: newId('pos'),
            code: col(r, 'kode_jabatan'),
            name: col(r, 'nama_jabatan'),
            orgUnitId: unit.id,
            positionTypeId: type.id,
            identity,
            active: true,
          }),
        );
      }
    } else if (kind === 'pejabat') {
      const nip = col(r, 'nip');
      const pos = posByCode(col(r, 'kode_unit'), col(r, 'kode_jabatan'));
      if (!/^\d{18}$/.test(nip)) err(n, 'nip', 'NIP harus 18 digit.');
      if (!pos)
        err(
          n,
          'kode_jabatan',
          `Jabatan ${col(r, 'kode_unit')}/${col(r, 'kode_jabatan')} tidak dikenal.`,
        );
      for (const f of ['tanggal_sk', 'tanggal_mulai'])
        if (!isoDate(col(r, f))) err(n, f, 'Format tanggal YYYY-MM-DD.');
      if (isoDate(col(r, 'tanggal_mulai')) && col(r, 'tanggal_mulai') > today)
        err(n, 'tanggal_mulai', 'Tanggal mulai tidak boleh di masa depan.');
      if (!col(r, 'nomor_sk')) err(n, 'nomor_sk', 'Nomor SK wajib diisi.');
      const filler = col(r, 'pengisi').toLowerCase();
      if (!['ya', 'tidak'].includes(filler)) err(n, 'pengisi', 'Isi "ya" atau "tidak".');
      if (pos) {
        const type = db.positionTypes.find((t) => t.id === pos.positionTypeId)!;
        const current = db.occupancies.filter(
          (o) =>
            o.positionId === pos.id && o.startDate <= today && (!o.endDate || o.endDate >= today),
        );
        const user = db.users.find((u) => u.nip === nip);
        if (!type.allowsMultipleOfficials && current.length)
          err(n, 'kode_jabatan', 'Jabatan ini sudah memiliki Pejabat. Gunakan Alih Pejabat.');
        if (type.allowsMultipleOfficials && filler === 'ya' && current.some((o) => o.isFiller))
          err(n, 'pengisi', 'Pokja ini sudah memiliki Pengisi.');
        if (user && current.some((o) => o.userId === user.id))
          err(n, 'nip', 'Pengguna ini sudah Pejabat jabatan ini (INV-13).');
        if (
          type.allowsMultipleOfficials &&
          filler === 'ya' &&
          rows
            .slice(0, i)
            .some(
              (o) =>
                posByCode(col(o, 'kode_unit'), col(o, 'kode_jabatan'))?.id === pos.id &&
                col(o, 'pengisi').toLowerCase() === 'ya',
            )
        )
          err(n, 'pengisi', 'Lebih dari satu Pengisi untuk Pokja yang sama.');
      }
      if (errors.length === before && pos) {
        ops.push((d, a) => {
          let user = d.users.find((u) => u.nip === nip);
          if (!user) {
            user = {
              id: newId('usr'),
              nip,
              email: col(r, 'email'),
              fullName: col(r, 'nama_lengkap'),
              isLocalAccount: false,
              mustChangePassword: false,
              createdVia: 'admin',
              active: true,
              orgUnitId: pos.orgUnitId,
            };
            d.users.push(user);
          }
          // Decree file may follow: the holding carries "SK belum diunggah".
          applyAssignment(
            d,
            {
              userId: user.id,
              positionId: pos.id,
              decreeNo: col(r, 'nomor_sk'),
              decreeDate: col(r, 'tanggal_sk'),
              decreeFile: null,
              startDate: col(r, 'tanggal_mulai'),
              isFiller: filler === 'ya',
            },
            a,
          );
        });
      }
    } else {
      const target = posByCode(col(r, 'kode_unit_lini1'), col(r, 'kode_jabatan_lini1'));
      const lead = posByCode(col(r, 'kode_unit_pj'), col(r, 'kode_jabatan_pj'));
      if (!target) err(n, 'kode_jabatan_lini1', 'Jabatan Lini 1 tidak dikenal.');
      if (!lead) err(n, 'kode_jabatan_pj', 'Jabatan penanggung jawab tidak dikenal.');
      const q = (s: string) => {
        const m = /^(\d{4})-([1-4])$/.exec(s);
        return m
          ? db.quarters.find((x) => x.fiscalYear === Number(m[1]) && x.number === Number(m[2]))
          : undefined;
      };
      const from = q(col(r, 'tw_mulai'));
      const to = q(col(r, 'tw_selesai'));
      if (!from) err(n, 'tw_mulai', 'Format triwulan "2027-1" dan TA harus ada.');
      if (!to) err(n, 'tw_selesai', 'Format triwulan "2027-1" dan TA harus ada.');
      const supports: MonitoringSupport[] = [];
      for (const part of col(r, 'pendukung')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        const m = /^([^/]+)\/([^:]+):(kinerja_anggaran|pbj)$/.exec(part);
        const p = m && posByCode(m[1]!, m[2]!);
        if (!m || !p) err(n, 'pendukung', `Pendukung "${part}" tidak valid.`);
        else
          supports.push({
            positionId: p.id,
            domain: m[3] === 'pbj' ? 'procurement' : 'budget_performance',
          });
      }
      const key = (x: { fiscalYear: number; number: number }) => x.fiscalYear * 10 + x.number;
      if (from && to && key(from) > key(to))
        err(n, 'tw_selesai', 'Triwulan akhir sebelum triwulan awal.');
      if (target && from && to) {
        const clash = db.assignments.some((x) => {
          if (x.targetPositionId !== target.id) return false;
          const xf = db.quarters.find((y) => y.id === x.quarterFromId)!;
          const xt = db.quarters.find((y) => y.id === x.quarterToId)!;
          return key(xf) <= key(to) && key(from) <= key(xt);
        });
        if (clash)
          err(
            n,
            'kode_jabatan_lini1',
            `${target.name} sudah memiliki penanggung jawab pada rentang ini (INV-14).`,
          );
      }
      if (!col(r, 'nomor_sk')) err(n, 'nomor_sk', 'Nomor SK wajib diisi.');
      if (errors.length === before && target && lead && from && to)
        ops.push((d) =>
          d.assignments.push({
            id: newId('asg'),
            targetPositionId: target.id,
            leadPositionId: lead.id,
            supports,
            quarterFromId: from.id,
            quarterToId: to.id,
            decreeNo: col(r, 'nomor_sk'),
          }),
        );
    }
  });
  const invalidRows = new Set(errors.map((e) => e.row));
  return {
    dry: {
      kind,
      rows: rows.length,
      valid: rows.length - [...invalidRows].filter((x) => x > 1).length,
      errors,
    },
    apply: (d, a) => {
      for (const op of ops) op(d, a);
    },
  };
}

export interface ImportJob {
  at: string;
  actor: string;
  kind: ImportKind;
  rows: number;
}

export const importApi = {
  template: (kind: ImportKind) => csvTemplate(getDb(), kind),

  dryRun: (kind: ImportKind, text: string) =>
    call<DryRun>(() => {
      const a = requireActor([IMPORT_PERMISSION[kind]]);
      return plan(getDb(), kind, text, a.today).dry;
    }),

  apply: (kind: ImportKind, text: string) =>
    call<number>(() => {
      const a = requireActor([IMPORT_PERMISSION[kind]]);
      const p = plan(getDb(), kind, text, a.today);
      if (p.dry.errors.length)
        throw new ApiError(
          'errors',
          `Perbaiki ${new Set(p.dry.errors.map((e) => e.row)).size} baris bermasalah terlebih dahulu`,
          p.dry.errors,
        );
      mutateDb((d) => {
        p.apply(d, a);
        writeAudit(d, {
          at: a.at,
          actorUserId: a.userId,
          actingAs: a.actingAs,
          actingPositionId: null,
          action: `impor_${kind}`,
          entityType: 'ImportJob',
          entityId: newId('job'),
          before: null,
          after: { rows: p.dry.rows },
        });
      });
      return p.dry.rows;
    }),

  history: () =>
    call<ImportJob[]>(() => {
      const db = getDb();
      return db.audit
        .filter((x) => x.action.startsWith('impor_'))
        .sort((x, y) => y.at.localeCompare(x.at))
        .map((x) => ({
          at: x.at,
          actor: db.users.find((u) => u.id === x.actorUserId)?.fullName ?? '',
          kind: x.action.slice(6) as ImportKind,
          rows: (x.after as { rows: number }).rows,
        }));
    }),

  kindsFor: (userId: string, today: string) =>
    (Object.keys(IMPORT_PERMISSION) as ImportKind[]).filter((k) =>
      hasPermission(getDb(), userId, IMPORT_PERMISSION[k], today),
    ),
};
