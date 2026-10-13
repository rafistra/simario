# Desain — Penilaian dengan Pilihan Kalimat (Dropdown)

| | |
|---|---|
| Tanggal | 13 Okt 2026 |
| Status | Disetujui dalam diskusi; menunggu tinjauan spec |
| Dampak PRD | v2.7 → v2.8 (FR-NIL-002, RB-NIL-002, FR-MST-007, FR-MST-010, FR-BRD-004, FR-RWY-001, FR-LBR-004, glosarium, §2.8.1, invarian) |

## 1. Tujuan

Penilai (Lini 1 dan Lini 3) tidak lagi mengetik angka 0,0–4,0. Mereka memilih **kalimat kriteria** dari dropdown. Setiap kalimat mewakili satu nilai 0–4 yang disimpan sebagai skor, lalu predikat diturunkan dari pita seperti sekarang. Daftar kalimat diatur di `/master/skala-penilaian`, ikut berversi bersama pita.

**Angka skor tidak ditampilkan di tampilan pengguna mana pun.** Pengguna hanya melihat kalimat dan predikat. Angka hanya terlihat di halaman Skala Penilaian (pengelola), serta di kanal admin (ekspor CSV metrik, impor).

### Keputusan pengguna (diskusi 13 Okt 2026)

1. Pilihan berupa level skor diskret dengan kalimat; nilai tidak ditampilkan.
2. Satu daftar kalimat per versi skala, berlaku untuk semua risiko.
3. Angka disembunyikan di semua tampilan, termasuk perbandingan, riwayat, Beranda, dan Lembar Mutu (rata-rata tidak dicetak).
4. Aturan daftar: jumlah bebas; setiap predikat wajib punya ≥1 kalimat; nilai dan kalimat unik per versi.
5. Dropdown berupa **daftar datar** (tanpa kelompok predikat), terburuk → terbaik; predikat baru muncul setelah memilih.
6. Seed: draf 5 kalimat (nilai 0–4), ditandai ilustratif.
7. Pendekatan penyimpanan: `Assessment.score` tetap angka; kalimat diturunkan dari versi skala triwulan.
8. Di versi aktif, **teks** kalimat boleh disunting langsung; menambah, menghapus, atau mengubah **nilai** wajib lewat "Buat Versi Baru".
9. PRD diperbarui ke v2.8.

### Di luar cakupan

- Kalimat per jenis risiko atau per template risiko.
- Perubahan aturan perbandingan (tetap per predikat, RB-NIL-003), penjelasan wajib, Berulang, keterlambatan.
- Tampilan "nilai lama tanpa kalimat" untuk data yang tidak cocok (data contoh dipetakan ulang, §6).

## 2. Model data

### Entitas baru (`domain/types.ts`)

```ts
export interface ScoreOption {
  id: string;
  versionId: string; // ScoreBandVersion.id
  value: number;     // 0,0–4,0, satu desimal
  label: string;     // kalimat yang dilihat pengguna
  order: number;     // = urutan nilai menaik
}
```

- Koleksi baru `scoreOptions` di `data/db.ts`.
- `ScoreBandVersion`, `ScoreBand`, dan `Assessment` tidak berubah. `Assessment.score` tetap menyimpan angka.
- Kalimat untuk sebuah penilaian = `ScoreOption` di versi skala triwulan (`Quarter.scoreBandVersionId`) dengan `value === score`.

### Invarian baru (dicatat sebagai INV baru di PRD)

Dalam satu `ScoreBandVersion`:
- setiap predikat pita punya ≥1 `ScoreOption` yang nilainya jatuh di pita itu;
- `value` unik, `label` unik (dibandingkan setelah trim, tanpa beda huruf besar/kecil), `label` tidak kosong;
- `value` di 0–4 dengan paling banyak satu desimal.

Setiap `Assessment.score` yang tidak null sama dengan salah satu `value` di versi triwulannya.

## 3. Aturan domain (`domain/scoreBands.ts`, fungsi murni + Vitest)

- `optionFor(score: number, options: ScoreOption[]): ScoreOption | null`: pencocokan nilai persis (toleransi pembulatan satu desimal).
- `sortOptions(options)`: urut menurut `value` menaik.
- `validateOptions(options, bands): OptionProblem[]`, dengan `kind`:
  - `empty-label`, `duplicate-label`, `duplicate-value`, `out-of-range` (di luar 0–4 atau >1 desimal): membawa `optionId`;
  - `band-uncovered`: membawa `predicate`; dievaluasi terhadap pita versi yang sama.

## 4. API

### Master (`data/api/master.ts`, izin sama dengan pita)

- **Buat Versi Baru** menyalin pita **dan** kalimat versi aktif (id baru).
- **Simpan draf / jadwalkan** menerima `{ bands, options }`; ditolak bila `validateBands` atau `validateOptions` mengembalikan masalah. Audit mencatat pita dan kalimat sebelum/sesudah.
- **`updateOptionLabel(optionId, label)`**: hanya untuk versi `active`, hanya teks; validasi `empty-label`/`duplicate-label`; audit sebelum/sesudah.
- Versi `retired`: hanya baca.

### Penilaian (`data/api/assessment.ts`)

- `saveCell` dengan `score` yang tidak cocok dengan pilihan di versi triwulan → ditolak (gerbang struktural, pesan "Pilihan penilaian tidak dikenal.").
- `CellView` untuk pembaca membawa `optionLabel` dan `predicate`, **tanpa angka**. Penyembunyian dilakukan di selector, bukan di JSX. Sel milik penilai sendiri juga tidak memerlukan angka: dropdown cukup dengan `options: { value, label }[]` dan nilai terpilih sebagai kunci internal.
- Daftar pilihan triwulan dikirim di `RowView`/view halaman sebagai `{ value, label }[]` terurut.

### Payload Lembar (`domain/rules/sheetPayload.ts`, `domain/rules/sheets.ts`)

- Payload menyimpan `optionLabel` per penilaian agar snapshot beku (INV-22) tidak berubah bila teks kalimat disunting kemudian.
- Lembar Mutu tetap menghitung rata-rata secara internal untuk menentukan predikat. Data yang dikirim ke tampilan (Lembar, Riwayat, Beranda) hanya membawa predikat dan hitungan.

## 5. UI

### `ScoreInput` (nama tetap, padanan .pen Q0zcSS)

- Isinya diganti menjadi `Select` library (native `<select>`), diikuti `PredicateBadge`.
- Props: `label`, `options: { value: number; label: string }[]`, `value: number | null`, `predicateOf`, `disabled`, `onCommit(value | null)`.
- Pilihan pertama "— Pilih penilaian —" (mengosongkan). Daftar datar, terburuk → terbaik, tanpa angka.
- Tersimpan langsung saat pilihan berubah (autosave per baris). Lencana predikat tampil setelah memilih; sebelum memilih tidak ada teks rentang.
- Lebar mengisi sel; teks panjang terpotong elipsis di kontrol tertutup.
- "Belum relevan triwulan ini" menonaktifkan dropdown.

### Halaman penilaian `/jabatan/:jid/penilaian/:ta/:tw`

- Baris "Pita skor: 0,0–2,0 Kurang · …" diganti **"Skala versi [n] · [m] pilihan penilaian"** + tautan "Panduan skoring".
- Slide-over Panduan skoring: panduan per predikat + daftar kalimat (tanpa angka).
- Sel setelah perbandingan dibuka: kalimat + `PredicateBadge`, tanpa angka.
- Dialog "Tuntaskan Penilaian": kalimat/predikat, tanpa angka.

### Tampilan lain

| Tampilan | Sebelum | Sesudah |
|---|---|---|
| Utas risiko, panel ringkasan triwulan | skor + predikat | kalimat + predikat per lini |
| Riwayat, matriks risiko × TW | skor + predikat | predikat; slide-over detail menampilkan kalimat |
| Riwayat, ringkasan Lembar Mutu | rata-rata + predikat | predikat |
| Beranda (mini Lembar Mutu, kartu lain) | rata-rata/skor + predikat | predikat |
| Lembar Komunikasi | skor + predikat | kalimat + predikat |
| Lembar Mutu (layar & cetak) | rata-rata + predikat | predikat; label kolom "Rata-rata"/"Skor" → "Predikat" |
| Jejak audit (penilaian) | angka sebelum → sesudah | kalimat sebelum → sesudah (data mentah tetap angka) |
| Ekspor CSV metrik, impor | angka | angka (kanal admin; dicatat di laporan) |

### `/master/skala-penilaian`

Susunan yang ada dipertahankan. **Kartu baru "Pilihan penilaian"** ditambahkan di bawah pratinjau 0–4, sebelum panduan per predikat:

- Judul: "Pilihan penilaian (tampil sebagai dropdown di halaman penilaian)". Teks bantu: "Pengguna hanya melihat kalimat. Nilai dipakai untuk menentukan predikat dan tidak ditampilkan."
- Tabel: **Kalimat** (TextInput, lebar penuh) · **Nilai** (input mono 0,0–4,0) · **Predikat** (`PredicateBadge`, dihitung langsung dari pita versi ini) · tombol hapus. Baris diurutkan otomatis menurut nilai. Tombol "+ Tambah Pilihan".
- Pratinjau 0–4 diberi penanda titik di posisi setiap nilai pilihan.
- Chip ringkasan versi ditambah "· [m] pilihan".
- **Draf / terjadwal**: semua bisa disunting. Galat inline per baris, ditambah InlineAlert ringkasan di dekat Simpan (mis. "Predikat Cukup Terkendali belum punya kalimat."). Mengubah pita memperbarui kolom Predikat dan memvalidasi ulang.
- **Aktif**: hanya Kalimat yang bisa disunting. Simpan saat blur/Enter, dengan toast "Kalimat diperbarui". Nilai, hapus, dan tambah dinonaktifkan dengan keterangan "Ubah nilai atau jumlah pilihan lewat Buat Versi Baru."
- **Tidak berlaku**: hanya baca.
- < 900 px: tabel menjadi kartu bertumpuk.

## 6. Seed dan migrasi data contoh

- Berkas baru `docs/seed/pilihan_penilaian.json`:
  ```json
  {
    "illustrative": true,
    "note": "Draf sementara, belum bersumber dari dek Rapim. Ganti lewat /master/skala-penilaian.",
    "options": [
      { "value": 0, "label": "Mitigasi belum dilaksanakan" },
      { "value": 1, "label": "Mitigasi baru direncanakan, belum ada pelaksanaan" },
      { "value": 2, "label": "Mitigasi dilaksanakan sebagian, bukti belum memadai" },
      { "value": 3, "label": "Mitigasi dilaksanakan, bukti memadai, efektivitas belum terlihat" },
      { "value": 4, "label": "Mitigasi dilaksanakan penuh dan terbukti efektif" }
    ]
  }
  ```
  Seed mengimpor berkas ini (alias `@seed/`); teks tidak disalin ke kode.
- Versi 1 (aktif) dan Versi 2 (draf, seed `sbv-2`) sama-sama mendapat 5 kalimat itu. Dengan pita Versi 1: 0/1/2 → Kurang, 3 → Cukup, 4 → Terkendali dengan Baik. Pita draf Versi 2 sengaja bercelah (Kurang ≤1,9 · Cukup (2,0–2,9] · TB (2,9–4,0]), sehingga nilai 2 jatuh di celah dan Cukup tidak punya kalimat. Draf itu menampilkan galat celah pita **dan** "Predikat Cukup Terkendali belum punya kalimat." sebagai contoh validasi; tidak diperbaiki di seed.
- Skor seed yang ada dipetakan ke **nilai pilihan terdekat di dalam predikat yang sama** (mis. 2,7 → 3; 3,4 → 4; 1,8 → 2). Predikat, Sesuai/Tidak Sesuai, Berulang, dan penjelasan wajib tidak berubah, sehingga skenario demo Tahap 6–8 tetap berlaku.
- Payload snapshot Lembar seed (TW IV 2026 Versi 1; cetak sementara 001 TW I 2027) dibangun ulang dengan `optionLabel`.
- `SCHEMA_VERSION` 8 → 9.

## 7. Pembaruan PRD (tahap pertama implementasi)

- Header: Version 2.8 (revisi v2.7), Date 13 October 2026. Riwayat revisi baris baru: "Assessment by statement: scorers pick a configured statement per score value; numeric scores and averages hidden from all user views; ScoreOption added to score band versions".
- `git mv docs/PRD_SIMARIO_v2.7.md docs/PRD_SIMARIO_v2.8.md`; perbarui rujukan di `CLAUDE.md`.
- Bagian yang diubah:

| Lokasi | Perubahan |
|---|---|
| Glosarium **Score** | Nilai 0,0–4,0 yang diwakili pilihan penilaian (kalimat); tidak ditampilkan ke pengguna |
| Glosarium **Lembar Mutu** | Predikat per jenis risiko per penilai (dihitung dari rata-rata internal) |
| §2.8.1 | Entitas `ScoreOption` + seed ilustratif |
| Invarian | INV baru (§2 spec ini) |
| Prinsip tampilan (dekat §2.7) | Angka skor tidak ditampilkan kecuali di `/master/skala-penilaian`, ekspor CSV metrik, dan impor; diterapkan di selector data |
| FR-BRD-004 | Mini Lembar Mutu: predikat saja |
| FR-NIL-002 + catatan frame | Dropdown kalimat (daftar datar, terburuk → terbaik), predikat setelah memilih; pesan "Skor 0,0–4,0" dihapus |
| RB-NIL-002 | "A statement is selected; its value is stored as the score; the predicate is derived …" |
| FR-RWY-001 | Sel: predikat saja |
| FR-LBR-004 | Rata-rata dihitung untuk predikat, tidak ditampilkan/dicetak |
| FR-MST-007 + catatan frame | Daftar pilihan penilaian per versi, validasi, sunting teks di versi aktif, ubah nilai/jumlah lewat versi baru, penanda pada pratinjau |
| FR-MST-010 | Seed kalimat dari `docs/seed/pilihan_penilaian.json` (draf ilustratif) |

Teks UI yang dikutip di PRD sama persis dengan teks di aplikasi.

## 8. Pengujian

- **Domain**: `optionFor`, `sortOptions`, `validateOptions` (kosong, kembar label/nilai, di luar rentang, >1 desimal, pita tanpa kalimat, cakupan berubah saat pita diubah).
- **API master**: Buat Versi Baru menyalin kalimat; simpan ditolak bila ada masalah; `updateOptionLabel` hanya untuk versi aktif dan hanya teks; entri audit.
- **API penilaian**: `saveCell` menolak skor yang bukan pilihan; `CellView` pembaca membawa `optionLabel` dan tidak membawa angka.
- **Seed**: setiap skor seed cocok dengan satu pilihan di versi triwulannya; predikat hasil pemetaan sama dengan sebelumnya; `pilihan_penilaian.json` termuat.
- **UI**: `master.test.tsx` (kartu pilihan, galat cakupan, mode aktif hanya teks) dan test penilaian (dropdown, autosave, lencana) diperbarui; `flow.test.ts` tetap lulus.
- **Manual** pada 1440 dan 390 px: Nur Aini / Admin DKB (skala), Rafi & Andi (Lini 1), Hendra (Lini 3), Siti (tampilan baca), dan Lembar + pratinjau cetak.
- `npm run build`, `npm run test`, `npm run lint` lulus.

## 9. Dokumentasi & komit

- `CLAUDE.md` §9: catatan pascatahap berisi keputusan pengguna ini, perbedaan dari mockup (`ScoreInput` jadi dropdown; baris "Pita skor" diganti), status draf kalimat sebagai ilustratif, dan `SCHEMA_VERSION` 9.
- `frontend/README.md`: perbarui bagian perbedaan dari mockup bila menyebut input skor.
- Komit kecil per bagian (PRD, domain + data, UI), pesan bahasa Inggris imperatif, tanpa atribusi Claude.
