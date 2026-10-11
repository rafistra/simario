# SIMARIO — prototipe frontend

Prototipe Sistem Informasi Mitigasi Risiko Otorita IKN yang terasa seperti aplikasi asli: semua modul PRD v2.7, tanpa backend. Data disimpan di `localStorage` browser dan dapat diatur ulang kapan saja.

## Menjalankan

```bash
npm install
npm run dev
```

Buka http://localhost:5173. Perintah lain:

| Perintah         | Kegunaan                                                            |
| ---------------- | ------------------------------------------------------------------- |
| `npm run build`  | Pemeriksaan tipe + build produksi                                   |
| `npm run test`   | Vitest (aturan bisnis, API lokal, UI)                               |
| `npm run lint`   | ESLint + Prettier                                                   |
| `npm run tokens` | Membuat ulang `src/styles/tokens.css` dari snapshot variabel Pencil |

## Masuk dan persona

Di `/login`, tombol SSO membuka pemilih persona. Akun lokal (Lestari Wulandari, Admin DKB) masuk dengan NIP dan kata sandi dari data contoh. Persona utama:

| Persona                      | Peran                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| Andi Wirawan                 | Pejabat PPK A-1 · DDKB (Lini 1)                               |
| Rafi Ananda                  | Operator PPK A-1                                              |
| Bambang Hartono              | Pejabat PPK A-2                                               |
| Dimas Prasetyo               | Operator PPK A-2, Pengisi Pokja Pemilihan 03                  |
| Ratna Sari                   | Anggota Pokja 03 (bukan Pengisi)                              |
| Hadi Susanto                 | KPA Satker A (register TA 2027 belum ada — alur salin)        |
| Siti Rahmawati               | Penanggung Jawab Pemantauan (Lini 2)                          |
| Hendra Gunawan / Maya Kusuma | Direktorat Kepatuhan / Pengawasan dan Audit Internal (Lini 3) |
| Dewi Anggraini               | Pembaca cakupan Unit DDKB (bukan peserta utas)                |
| Nur Aini                     | Pengelola Master Data                                         |
| Admin DKB                    | Superadmin                                                    |

## Panel Prototipe (DevPanel)

Tombol **Prototipe** di kanan bawah:

- ganti persona tanpa keluar;
- geser **tanggal simulasi** (bawaan 6 Apr 2027 09.00) dan preset tanggal mockup; tugas terjadwal (pembukaan perbandingan, Berulang, pengingat, versi lembar, arsip TA) dievaluasi ulang setiap tanggal berubah;
- **Sesuaikan data ke tanggal ini** — memuat ulang data contoh seperti keadaannya pada tanggal simulasi (untuk skenario 18 Mar 2027 dan sejenisnya);
- latensi simulasi, gagalkan panggilan berikutnya, mode luring, batas sesi tidak aktif;
- mode gelap/terang, **Simulasikan komentar masuk** (di halaman utas), atur ulang data.

Tautan demo: `?sebagai=usr-andi&waktu=2027-03-18T09:00&data=sesuai` (persona + tanggal + data sesuai tanggal). `?tema=gelap` memaksa mode gelap.

## Skenario uji singkat

1. **Register** — `?sebagai=usr-rafi`: susun, Tandai Siap → Andi menerbitkan; gerbang struktural memblokir dengan daftar bernomor.
2. **Utas** — Hendra melampirkan berkas konfidensial; Andi hanya melihat "1 lampiran konfidensial"; Langkah Andi menghapus penanda sepi.
3. **Penilaian TW I** — `&waktu=2027-03-18T09:00&data=sesuai`: Rafi mengisi, Andi menuntaskan; geser ke 1–2 Apr, Hendra & Maya menilai; 3 Apr perbandingan terbuka; Andi mengirim penjelasan.
4. **Lembar** — Cetak dari tampilan berjalan membuat salinan bernomor `SIMARIO/LK/2027/TW1/DDKB-PPKA1/00n`; mencetak salinan beku tidak membuat salinan baru.
5. **Administrasi** — Admin DKB: Alih Pejabat PPK A-1 mengakhiri operator lama; Andi menunjuk Galih Pratama sebagai operator dari Jabatan Saya.

## Struktur

```
src/
  components/   pustaka komponen (nama sama dengan Simario.pen)
  layout/       AppShell, Sidebar, Topbar, Workspace, nav
  pages/        auth, home, register, board, assessment, history, sheets, master, notifications, admin, faults
  domain/       types, permissions, calendar, rules/ (akses, visibilitas VIS-1…9, register, utas, penilaian, lembar)
  data/         db, repository, api/ (per modul), local/ (store, call, scheduler, comparisons, reminders), seed/
  state/        sesi, jam simulasi, pengaturan dev
```

Semua akses data lewat `data/repository.ts`; aturan visibilitas diterapkan di read model (`data/api/*`), bukan di JSX.

## Padanan frame Simario.pen

Setiap frame di FrameIndex punya padanan halaman/keadaan:

| Modul (jumlah frame)            | Rute                                                                                 | Catatan                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Autentikasi (4) + Sesi Berakhir | `/login`, `/ganti-kata-sandi`, `/login?alasan=sesi-berakhir`                         | SSO = pemilih persona                                                             |
| Beranda (8)                     | `/`                                                                                  | Kartu mengikuti lini jabatan aktif; kosong untuk Lestari                          |
| Register (11)                   | `/jabatan/:jid/register/:ta`                                                         | Semua keadaan (draf, salin, celah, terbit, nonaktif TW II/IV, baca, Pokja, arsip) |
| Papan Risiko (11) + Memuat      | `/jabatan/:jid/papan/:ta[/risiko/:rid]`                                              | Pembaca bukan peserta = Dewi Anggraini                                            |
| Penilaian (12) + Memuat         | `/jabatan/:jid/penilaian/:ta/:tw`, `/penilaian`                                      | Keadaan waktu lewat DevPanel / `data=sesuai`                                      |
| Riwayat (3)                     | `/jabatan/:jid/riwayat?ta=`                                                          | Lintas tahun per baris                                                            |
| Lembar (8)                      | `/jabatan/:jid/lembar/:ta/:tw`                                                       | Pratinjau cetak: `?salinan=…&cetak=pratinjau`                                     |
| Master Data (9)                 | `/master/*`                                                                          |                                                                                   |
| Administrasi (16)               | `/pengaturan/*`, `/jabatan-saya`, `/jabatan`, `/pantauan`, `/metrik`, `/jejak-audit` |                                                                                   |
| Notifikasi (2)                  | panel lonceng, `/notifikasi`                                                         |                                                                                   |
| Gangguan (5)                    | 403, 404, 500, luring                                                                |                                                                                   |
| Mode gelap (2), Ponsel (6)      | semua halaman                                                                        | toggle di menu pengguna; satu breakpoint 900 px                                   |

### Perbedaan yang disengaja

- Data contoh statis per 6 Apr 2027; keadaan waktu lain lewat "Sesuaikan data ke tanggal ini".
- Beranda Januari: TW IV 2026 sudah dituntaskan di data contoh, jadi tidak ada kartu kewajiban seperti di mockup.
- Isi lampiran tidak disimpan; gambar tampil sebagai placeholder, unduhan berupa berkas contoh.
- Metrik Tujuan 8 menampilkan "Data belum cukup" (instrumentasi waktu-di-halaman belum ada).
- Komentar baru antar-tab disinkronkan lewat event `storage`, bukan polling server.
- Persona Dewi Anggraini dan peran kustom "Pimpinan Unit Kerja" ditambahkan untuk frame pembaca bukan peserta.
