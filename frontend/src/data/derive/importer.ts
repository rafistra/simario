// Pure derivations of the importer pages, moved out of the prototype module (B9) so pages do
// not bundle the local store. The fake backend re-exports them.

import type { ImportKind } from '@/test/fake/api/importer';
import type { DB } from '@/test/fake/db';

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

/** CSV template of an import kind; the jabatan columns follow the position types. */
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
