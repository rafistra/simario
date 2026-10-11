// Board seed: comments, attachments, subscriptions, thread views for the TA 2027 registers.
// TW I comments feed the Lembar Komunikasi; TW II has one Langkah so far (quiet markers elsewhere).

import type { Attachment, Comment, ThreadSubscription, ThreadView } from '@/domain/types';

export const comments: Comment[] = [];
export const attachments: Attachment[] = [];

interface C {
  id: string;
  risk: string;
  mitigation?: string;
  author: string;
  line: 1 | 2 | 3;
  as?: 'pejabat' | 'operator';
  pos: string;
  q: string;
  at: string;
  body: string;
  step?: boolean;
  edited?: string;
  withdrawn?: string;
  mentions?: string[];
  files?: { name: string; size: number; mime: string; confidential?: boolean; by?: string }[];
}

let fileSeq = 1;
function c(spec: C) {
  comments.push({
    id: spec.id,
    registerRiskId: spec.risk,
    registerMitigationId: spec.mitigation ?? null,
    authorUserId: spec.author,
    authorLine: spec.line,
    actingAs: spec.as ?? 'pejabat',
    actingPositionId: spec.pos,
    quarterId: spec.q,
    body: spec.body,
    isStep: spec.step ?? false,
    createdAt: spec.at,
    editedAt: spec.edited ?? null,
    withdrawnAt: spec.withdrawn ?? null,
    withdrawnByUserId: spec.withdrawn ? spec.author : null,
    mentionUserIds: spec.mentions ?? [],
  });
  for (const f of spec.files ?? []) {
    attachments.push({
      id: `att-${fileSeq++}`,
      ownerKind: 'comment',
      ownerId: spec.id,
      filename: f.name,
      sizeBytes: f.size,
      mimeType: f.mime,
      scanStatus: 'clean',
      isConfidential: f.confidential ?? false,
      uploadedById: f.by ?? spec.author,
      uploadedAt: spec.at,
    });
  }
}

const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const JPG = 'image/jpeg';
const A1 = 'pos-ppk-a1';
const TW1 = 'q-2027-1';
const TW2 = 'q-2027-2';

/* Penyerapan anggaran tidak mencapai target per Triwulan. */
c({
  id: 'cm-1',
  risk: 'rr-a1-penyerapan',
  author: 'usr-rafi',
  line: 1,
  as: 'operator',
  pos: A1,
  q: TW1,
  at: '2027-02-03T09:12',
  step: true,
  body: 'Jadwal penarikan dana TW I sudah disusun ulang bersama Biro Keuangan. Realisasi Januari 8,4% dari pagu; target akhir Maret 22%.\n@Siti Rahmawati mohon masukan atas proyeksi Februari.',
  mentions: ['usr-siti'],
  files: [
    { name: 'Notulen_Rapat_RPD_TW1.pdf', size: 655360, mime: PDF },
    { name: 'foto_rapat_rpd.jpg', size: 412000, mime: JPG },
  ],
});
c({
  id: 'cm-2',
  risk: 'rr-a1-penyerapan',
  author: 'usr-siti',
  line: 2,
  pos: 'pos-pj-pemantauan',
  q: TW1,
  at: '2027-02-05T10:30',
  edited: '2027-02-05T10:38',
  body: 'Mohon lampirkan rekap realisasi per minggu agar deviasi terhadap RPD terpantau sejak awal. Proyeksi Februari 15% masih realistis bila paket perangkat pusat data berkontrak sebelum 20 Februari.',
});
c({
  id: 'cm-3',
  risk: 'rr-a1-penyerapan',
  author: 'usr-andi',
  line: 1,
  pos: A1,
  q: TW1,
  at: '2027-03-10T14:00',
  step: true,
  body: 'Rapat evaluasi penyerapan bersama tim teknis; dua paket dipercepat ke Maret dan rekap mingguan mulai diunggah setiap Jumat.',
  files: [{ name: 'Rekap_Realisasi_Minggu10.xlsx', size: 90112, mime: XLSX }],
});
c({
  id: 'cm-4',
  risk: 'rr-a1-penyerapan',
  author: 'usr-yudi',
  line: 2,
  pos: 'pos-sup-birokeu',
  q: TW1,
  at: '2027-03-12T09:45',
  body: 'Biro Keuangan sudah menerima rekap minggu 10. Deviasi terhadap RPD turun menjadi 3,6 poin.',
});
c({
  id: 'cm-5',
  risk: 'rr-a1-penyerapan',
  author: 'usr-rafi',
  line: 1,
  as: 'operator',
  pos: A1,
  q: TW2,
  at: '2027-04-05T11:20',
  step: true,
  body: 'Rekap realisasi minggu pertama April diunggah; Rencana Kerja Bulanan TW II sudah disepakati.',
  files: [{ name: 'RKB_TW2_PPK-A1.pdf', size: 312000, mime: PDF }],
});
c({
  id: 'cm-6',
  risk: 'rr-a1-penyerapan',
  author: 'usr-hendra',
  line: 3,
  pos: 'pos-kepatuhan',
  q: TW2,
  at: '2027-04-06T08:05',
  body: 'Mohon dokumen kontrak paket perangkat pusat data diunggah pada utas ini untuk penelaahan TW II.',
});

/* Keterlambatan revisi DIPA menghambat jadwal pengadaan. (custom) */
c({
  id: 'cm-7',
  risk: 'rr-a1-dipa',
  author: 'usr-rafi',
  line: 1,
  as: 'operator',
  pos: A1,
  q: TW1,
  at: '2027-02-12T13:05',
  body: 'Usulan revisi DIPA diajukan ke Kanwil DJPb pada 10 Februari; estimasi pengesahan dua minggu.',
});
c({
  id: 'cm-8',
  risk: 'rr-a1-dipa',
  author: 'usr-lestari',
  line: 2,
  as: 'operator',
  pos: 'pos-sup-ukpbj',
  q: TW1,
  at: '2027-02-14T08:50',
  body: 'UKPBJ menyesuaikan jadwal pemilihan paket lisensi agar tidak mendahului pengesahan revisi.',
});

/* Deviasi RPD — deactivated from TW II. */
c({
  id: 'cm-9',
  risk: 'rr-a1-rpd',
  author: 'usr-rafi',
  line: 1,
  as: 'operator',
  pos: A1,
  q: TW1,
  at: '2027-02-15T10:00',
  step: true,
  body: 'RPD kegiatan diperbarui sesuai milestone kontrak; penarikan dana TW I hanya untuk belanja pegawai.',
});

/* Pemecahan kontrak. */
c({
  id: 'cm-10',
  risk: 'rr-a1-pemecahan',
  author: 'usr-hendra',
  line: 3,
  pos: 'pos-kepatuhan',
  q: TW1,
  at: '2027-02-20T15:30',
  body: 'Kami menelaah dua kontrak lisensi sejenis bulan Februari. Kertas kerja terlampir untuk Lini 3.',
  files: [
    {
      name: 'Kertas_Kerja_Kepatuhan_Paket_Lisensi.xlsx',
      size: 88064,
      mime: XLSX,
      confidential: true,
    },
    { name: 'Daftar_Kontrak_Februari.pdf', size: 204800, mime: PDF },
  ],
});
c({
  id: 'cm-11',
  risk: 'rr-a1-pemecahan',
  author: 'usr-andi',
  line: 1,
  pos: A1,
  q: TW1,
  at: '2027-03-05T16:10',
  step: true,
  body: 'Paket lisensi tahap 2 dihentikan sementara untuk digabung dengan paket tahap 3 dalam satu proses E-Purchasing.',
});
c({
  id: 'cm-12',
  risk: 'rr-a1-pemecahan',
  author: 'usr-siti',
  line: 2,
  pos: 'pos-pj-pemantauan',
  q: TW1,
  at: '2027-03-06T09:00',
  body: 'Penggabungan paket sudah tepat. Mohon dikoordinasikan dengan UKPBJ agar jadwal pemilihan tidak mundur.',
});
c({
  id: 'cm-13',
  risk: 'rr-a1-pemecahan',
  author: 'usr-rafi',
  line: 1,
  as: 'operator',
  pos: A1,
  q: TW1,
  at: '2027-03-14T11:00',
  withdrawn: '2027-03-14T11:06',
  body: 'Draf jadwal penggabungan paket (salah unggah).',
});
c({
  id: 'cm-14',
  risk: 'rr-a1-pemecahan',
  author: 'usr-maya',
  line: 3,
  pos: 'pos-pai',
  q: TW1,
  at: '2027-04-02T15:00',
  body: 'Hasil TW I sudah dibuka. Mohon penjelasan rencana penggabungan paket beserta jadwalnya.',
  mentions: ['usr-andi'],
});

/* Terlambatnya proses pembayaran termin kepada Penyedia. */
c({
  id: 'cm-15',
  risk: 'rr-a1-pembayaran',
  mitigation: 'rr-a1-pembayaran-m3',
  author: 'usr-rafi',
  line: 1,
  as: 'operator',
  pos: A1,
  q: TW1,
  at: '2027-03-02T10:40',
  step: true,
  body: 'Verifikasi tagihan termin 1 selesai dalam 4 hari kerja.',
  files: [{ name: 'SP2D_Termin1_PPK-A1.pdf', size: 1258291, mime: PDF }],
});
c({
  id: 'cm-16',
  risk: 'rr-a1-pembayaran',
  author: 'usr-yudi',
  line: 2,
  pos: 'pos-sup-birokeu',
  q: TW1,
  at: '2027-03-03T14:15',
  body: 'SP2D termin 1 terbit 2 Maret. Mohon tagihan termin 2 disiapkan sebelum 15 Mei.',
});

/* Penyuapan, Gratifikasi, atau Pemerasan. */
c({
  id: 'cm-17',
  risk: 'rr-a1-penyuapan',
  author: 'usr-andi',
  line: 1,
  pos: A1,
  q: TW1,
  at: '2027-01-28T09:30',
  step: true,
  body: 'Pakta Integritas ditandatangani seluruh anggota tim teknis dan panitia penerima hasil pekerjaan.',
  files: [{ name: 'Pakta_Integritas_Tim_Teknis.pdf', size: 540000, mime: PDF }],
});

/* PPK A-2 — Dimas (Operator) is a participant there but only a reader on PPK A-1. */
c({
  id: 'cm-18',
  risk: 'rr-a2-markup',
  author: 'usr-dimas',
  line: 1,
  as: 'operator',
  pos: 'pos-ppk-a2',
  q: TW1,
  at: '2027-02-22T10:00',
  step: true,
  body: 'Justifikasi harga lisensi disusun dari tiga penawaran pembanding.',
});

export const subscriptions: ThreadSubscription[] = [
  { userId: 'usr-siti', registerRiskId: 'rr-a1-penyerapan', muted: false },
  { userId: 'usr-siti', registerRiskId: 'rr-a1-pemecahan', muted: false },
  { userId: 'usr-yudi', registerRiskId: 'rr-a1-penyerapan', muted: false },
  { userId: 'usr-yudi', registerRiskId: 'rr-a1-pembayaran', muted: false },
  { userId: 'usr-lestari', registerRiskId: 'rr-a1-dipa', muted: false },
  { userId: 'usr-hendra', registerRiskId: 'rr-a1-pemecahan', muted: false },
  { userId: 'usr-hendra', registerRiskId: 'rr-a1-penyerapan', muted: false },
  { userId: 'usr-maya', registerRiskId: 'rr-a1-pemecahan', muted: false },
];

export const threadViews: ThreadView[] = [
  { userId: 'usr-andi', registerRiskId: 'rr-a1-penyerapan', lastSeenAt: '2027-04-01T08:00' },
  { userId: 'usr-andi', registerRiskId: 'rr-a1-pemecahan', lastSeenAt: '2027-04-01T08:00' },
  { userId: 'usr-andi', registerRiskId: 'rr-a1-dipa', lastSeenAt: '2027-04-01T08:00' },
  { userId: 'usr-rafi', registerRiskId: 'rr-a1-penyerapan', lastSeenAt: '2027-04-05T11:20' },
];
