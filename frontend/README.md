# SIMARIO — frontend

Frontend Sistem Informasi Mitigasi Risiko Otorita IKN (React 18 + Vite): semua modul PRD v2.9, dilayani backend Django (`../backend`). Sejak B9 tidak ada mode data lokal; implementasi prototipe hanya dipakai sebagai backend tiruan Vitest (`src/test/fake/`).

Dokumentasi teknis lengkap ada di `docs/`: [arsitektur](../docs/00_arsitektur.md), [backend](../docs/01_backend.md), [frontend](../docs/02_frontend.md), [kontrak API](../docs/03_api_contract.md), [risiko & utang teknis](../docs/04_risk_and_debt.md), [pengembangan lokal & pengujian](../docs/05_local_dev_and_testing.md), [user story](../docs/06_user_stories.md).

## Menjalankan

```bash
docker compose up -d        # dari root repositori: PostgreSQL, Redis, RustFS, Keycloak, api
npm install
npm run dev
```

Buka http://localhost:5173 (Vite meneruskan `/api`, `/oidc`, `/storage` ke backend). Perintah lain:

| Perintah         | Kegunaan                                                            |
| ---------------- | ------------------------------------------------------------------- |
| `npm run build`  | Pemeriksaan tipe + build produksi + cek bundel tanpa kode prototipe |
| `npm run test`   | Vitest (aturan bisnis, vektor bersama, UI atas backend tiruan)      |
| `npm run lint`   | ESLint + Prettier                                                   |
| `npm run tokens` | Membuat ulang `src/styles/tokens.css` dari snapshot variabel Pencil |

## Penyebaran

Lewat stack Docker di belakang nginx (`docker-compose.prod.yml`); panduan di [docs/05 §2b](../docs/05_local_dev_and_testing.md#2b-staging-dan-produksi). Netlify dihapus di B9.

## Panel Prototipe (DevPanel)

Tombol **Prototipe** di kanan bawah:

- ganti persona tanpa keluar (hanya bila backend berjalan dengan `SIMARIO_DEV_TOOLS=true`);
- geser **jam server** (bawaan 6 Apr 2027 09.00) dan preset tanggal mockup; tugas terjadwal backend (pembukaan perbandingan, Berulang, pengingat, versi lembar, arsip TA) dijalankan setiap jam digeser;
- **Sesuaikan data ke tanggal ini** — memuat ulang data contoh seperti keadaannya pada tanggal simulasi (untuk skenario 18 Mar 2027 dan sejenisnya);
- latensi simulasi, gagalkan panggilan berikutnya, mode luring, batas sesi tidak aktif;
- mode gelap/terang, atur ulang data server.

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

- Sidebar desktop bisa diciutkan menjadi rel ikon 72 px (tombol di tepi kanan sidebar, pilihan diingat per pengguna); latar sidebar memakai gradasi Samudra dengan tekstur grain halus. Saat diciutkan, konten melebar hingga 1368 px (PRD v2.9). Halaman yang dulu sempit di mockup (Tahap, Skala Penilaian, Notifikasi, Impor Data, Jabatan Saya) kini memakai lebar konten penuh. Semua ini tidak ada di mockup.
- Data contoh statis per 6 Apr 2027; keadaan waktu lain lewat "Sesuaikan data ke tanggal ini".
- Beranda Januari: TW IV 2026 sudah dituntaskan di data contoh, jadi tidak ada kartu kewajiban seperti di mockup.
- Isi lampiran tidak disimpan; gambar tampil sebagai placeholder, unduhan berupa berkas contoh.
- Metrik Tujuan 8 menampilkan "Data belum cukup" (instrumentasi waktu-di-halaman belum ada).
- Komentar baru antar-tab disinkronkan lewat event `storage`, bukan polling server.
- Persona Dewi Anggraini dan peran kustom "Pimpinan Unit Kerja" ditambahkan untuk frame pembaca bukan peserta.
- Unit kerja memakai nama resmi Otorita IKN (ekspor 12 Okt 2026), hanya yang dipakai seed: unit fiktif mockup dipetakan — UKPBJ → Biro Umum dan Pengadaan Barang/Jasa, Satker A → Direktorat Pengelolaan Gedung, Kawasan dan Perkotaan, Satker B → Direktorat Sarana Prasarana Dasar, Satker C → Direktorat Pelayanan Dasar, Deputi Bidang Pendanaan → Direktorat Pendanaan. Label jabatan "Satker A/B/C" dan "UKPBJ" dipertahankan seperti mockup; jabatan Siti menjadi "Penanggung Jawab Pemantauan Direktorat Pendanaan". Kode unit (DPGKP, DSPD, DPLD, BUPBJ, DPDN) dibuat untuk impor CSV.
- Isian Data Umum "Tujuan" tidak wajib dan nonaktif secara bawaan (keputusan pengguna, berbeda dari PRD yang menjadikannya isian tetap wajib). Pengelola Master Data dapat mengaktifkannya per versi formulir; bila nonaktif, Tujuan tidak tampil di register dan lembar.
- ScoreInput (.pen Q0zcSS) kini dropdown kalimat (PRD v2.8), bukan kolom angka; baris "Pita skor" di halaman penilaian diganti "Skala versi n · m pilihan penilaian".
