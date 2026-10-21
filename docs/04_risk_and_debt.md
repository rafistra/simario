# 04 — Risiko dan Utang Teknis

> Status dokumen: 21 Okt 2026 · PRD v2.9 · kode `frontend/` per komit `7bebb66`.
> Skala: **Tinggi** = menghalangi rilis produksi atau dapat membocorkan data; **Sedang** = harus dibereskan saat membangun backend; **Rendah** = kebersihan/perawatan.
> Perbarui berkas ini setiap kali butir selesai (pindahkan ke §5) atau ditemukan butir baru.

## 1. Ringkasan

| Kategori | Tinggi | Sedang | Rendah |
|---|---|---|---|
| Risiko produk & proses (R-P) | 2 | 4 | 1 |
| Risiko teknis (R) | 3 | 6 | 1 |
| Utang teknis (U) | 0 | 9 | 9 |

Yang paling penting: **backend belum ada** (R-01), sehingga seluruh aturan izin dan kerahasiaan saat ini hanya berjalan di browser (R-02), dan sebagian data dibaca halaman langsung dari store sehingga kontrak API belum lengkap (U-01). Utang tingkat Tinggi U-02 dan U-03 sudah diselesaikan (§5).

## 2. Risiko produk dan proses

Sebagian besar bersumber dari PRD (§1.2, §1.3, §1.11, Lampiran E).

| ID | Risiko | Dampak | Tingkat | Mitigasi / tindak lanjut |
|---|---|---|---|---|
| R-P1 | Butir terbuka PRD belum dijawab: **OQ-3** (unit pemegang peran Pengelola Master Data), **OQ-12** (kadensi Lembar Komunikasi di dek Rapim masih bulanan) — keduanya menghalangi rilis | Data referensi tanpa pemilik; pengguna menerima dua kadensi berbeda | Tinggi | Minta keputusan pemilik proses sebelum rilis |
| R-P2 | **OQ-8** masa retensi & aturan arsip lampiran (ANRI) belum ditetapkan; **OQ-5** format resmi Kepka 47 menyusul v1.1 | Tidak ada dasar pemusnahan; cetakan belum dokumen resmi (sudah dinyatakan di catatan status FR-LBR-008) | Tinggi | Konfigurasi retensi minimal 5 TA (NFR-013) sampai OQ-8 dijawab |
| R-P3 | Kalimat pilihan penilaian di `docs/seed/pilihan_penilaian.json` masih **draf ilustratif** (`"illustrative": true`) | Penilai memilih kalimat yang belum disahkan; perbandingan antartriwulan kehilangan makna bila kalimat diganti di tengah tahun | Sedang | Sahkan kalimat sebelum TW pertama; ganti lewat `/master/skala-penilaian` (versi baru) |
| R-P4 | Keputusan pengguna yang **berbeda dari PRD**: isian Data Umum "Tujuan" opsional dan nonaktif secara bawaan (`objectiveEnabled`) | PRD dan kode tidak sejalan; backend bisa dibangun mengikuti PRD | Sedang | Perbarui PRD (FR-REG-001, FR-MST-006, §2.6) atau konfirmasi ulang |
| R-P5 | Asumsi Tujuan 8 (≤ 30 menit per penilaian triwulan) belum dapat diukur — instrumentasi `PageTiming` belum ada | Metrik Tujuan 8 selalu "Data belum cukup" | Sedang | Bangun instrumentasi bersama backend; ukur ulang di triwulan pertama (PRD §1.3) |
| R-P6 | Beban Lini 3: setiap direktorat menilai setiap risiko setiap jabatan Lini 1 (PRD §1.4.1) | Keterlambatan Lini 3 → perbandingan terbuka sebagian, penanda Terlambat | Sedang | Delegasi Operator Lini 3, jendela Lini 3 sejak awal triwulan, antrean `/penilaian` dengan filter |
| R-P7 | Pola pemakaian papan belum terbukti (apakah Lini 1 menulis Langkah, apakah Lini 2 ikut) | Lembar Komunikasi kosong; Tujuan 2 gagal | Rendah | PRD Lampiran E: jeda satu bulan uji langsung setelah modul papan sebelum membangun penilaian |

## 3. Risiko teknis

| ID | Risiko | Dampak | Tingkat | Mitigasi / tindak lanjut |
|---|---|---|---|---|
| R-01 | **Backend belum ada** (lihat [01_backend.md](01_backend.md)) | Tidak dapat dipakai produksi; tidak ada data bersama antarpengguna | Tinggi | Ikuti daftar kerja [01_backend.md §8](01_backend.md#8-daftar-kerja-pemindahan-ke-backend) |
| R-02 | Semua izin, VIS-1…9, dan INV ditegakkan **di browser**; siapa pun dengan tautan dapat masuk sebagai persona apa pun dan membaca seluruh `localStorage` | Tidak ada kerahasiaan sebenarnya. Aman hanya karena datanya fiktif | Tinggi | Prototipe hanya dengan data fiktif (`netlify.toml`: `noindex`); di backend VIS & INV-16/17 di serializer + uji API khusus |
| R-03 | Kata sandi akun lokal disimpan **teks polos** di seed dan `localStorage` (`User.password`) | Pola yang salah bila tersalin ke backend | Tinggi | Backend: hash (Django `make_password`), tidak pernah dikirim ke klien |
| R-04 | Kuota `localStorage` (± 5 MB per origin): audit, notifikasi, dan snapshot terus bertambah; `writeStorage` menelan galat kuota tanpa memberi tahu | Perubahan hilang saat dimuat ulang tanpa peringatan | Sedang | DevPanel "Atur ulang data"; bila perlu tampilkan peringatan saat penulisan gagal |
| R-05 | Banyak tab: tulis ulang per koleksi, siapa terakhir menang; event `storage` memuat ulang seluruh basis data | Perubahan dari tab lain dapat tertimpa | Sedang | Diterima untuk prototipe; backend menangani konkurensi (transaksi, versi baris) |
| R-06 | **Zona waktu tidak didefinisikan.** `ISODateTime` = `YYYY-MM-DDTHH:mm` tanpa zona; jam simulasi memakai field UTC sebagai waktu lokal. PRD tidak menyebut zona (IKN berada di WITA, UTC+8) | Tenggat, keterlambatan, dan "H-1" dapat bergeser satu hari di server | Sedang | Putuskan zona acuan (usul: Asia/Makassar) dan simpan `timestamptz` |
| R-07 | Hari kerja dihitung Senin–Jumat tanpa kalender libur nasional (PRD §1.10) | Tenggat penjelasan dapat jatuh di hari libur | Sedang | Sudah di luar cakupan v1.0; dijadwalkan v1.1 (PRD Lampiran D) |
| R-08 | Mockup `Simario.pen` hanya dapat dibaca lewat MCP Pencil; browser Pencil sering macet saat screenshot | Verifikasi visual bergantung pada satu alat | Rendah | Pakai Edge headless (lihat [05_local_dev_and_testing.md](05_local_dev_and_testing.md)) |
| R-09 | **Kematangan RustFS** sebagai penyimpanan objek (keputusan 21 Okt 2026, [01_backend.md §2.1](01_backend.md#21-keputusan-stack-21-okt-2026)). Proyeknya masih muda: rilis stabil 1.x baru ada (B0 memakai `rustfs/rustfs:1.0.3`, 21 Okt 2026), riwayat produksinya pendek, dan pilihan ini berbeda dari PRD §2.1 (MinIO) | Kehilangan atau kerusakan berkas bukti audit; perilaku S3 yang tidak lengkap (pre-signed URL, multipart) baru ketahuan di produksi | Sedang | Pantau rilis 1.x sampai go-live; hanya pakai API S3 standar lewat `django-storages`; uji integrasi penyimpanan di CI (unggah, pre-signed 5 menit, multipart 20 MB, karantina, hapus); cadangan harian + uji pemulihan (NFR-014); siapkan pengganti (SeaweedFS, Garage, Ceph RGW, S3 internal OIKN); konfirmasi ke tim infrastruktur OIKN; perbarui PRD §2.1 |
| R-11 | **Data personel terbaca semua pengguna yang masuk** (B2): `GET /api/v1/collections/users` (tanpa kata sandi), `occupancies`, `delegates`, dan `GET /api/v1/staff` terbuka bagi siapa pun yang masuk, karena halaman seperti Jabatan Saya dan Workspace membutuhkannya | NIP, email, dan jabatan seluruh pegawai dapat diunduh oleh Operator mana pun | Sedang | B9: batasi koleksi per izin (21/22 untuk daftar lengkap) setelah halaman memakai read model per modul; `staff` hanya untuk pemegang izin 11 atau 21 |

## 4. Utang teknis

| ID | Utang | Lokasi | Tingkat | Tindakan yang disarankan |
|---|---|---|---|---|
| U-01 | **Berkas di `pages/` dan `layout/` masih membaca store langsung** (`useDb`/`getDb`) untuk register, papan, penilaian, riwayat, lembar, usulan, audit, metrik, Topbar, dan Workspace. **B2:** halaman master dan admin kini membaca koleksi backend lewat `CollectionGate` (`GET /api/v1/collections/<nama>`), tetapi digabung di atas store lokal agar petunjuk berbasis register tetap jalan | Lihat [03_api_contract.md §5](03_api_contract.md#5-celah-kontrak-data-yang-dibaca-langsung-dari-store) | Sedang | Tiap tahap B3–B8 mengganti bacaan modulnya dengan read model HTTP |
| U-18 | **Jembatan ID sementara** (`frontend/src/data/http/legacyIds.ts` + `legacy-ids.json`): UUID backend ↔ ID prototipe di batas HTTP selama transisi. Entitas baru di backend tidak punya padanan lokal, dan lonceng hanya menampilkan notifikasi backend | `data/http/` | Rendah | Hapus bersama mode lokal di B9 |
| U-20 | `seed_reference` (data referensi produksi) mengimpor helper dari `simario.devtools.seed` dan membaca `docs/seed` lewat `REPO_DIR = parents[3]` (di container: mount `./docs/seed:/docs/seed`) | `simario/reference/catalog.py`, `docker-compose.yml` | Rendah | B4s: pindahkan `legacy_uuid`/`convert_row` ke `simario.core`; image produksi menyalin `docs/seed` atau path dari setting |
| U-22 | **Petunjuk pemakaian register di halaman master dari store lokal** (B3): "Dipakai N jabatan", "dapat dihapus" (template/tahap), dan dampak nonaktif jabatan masih dihitung dari register lokal, padahal register sudah di backend; backend tetap menolak menghapus yang dipakai dengan pesannya sendiri | `pages/master/{TemplatesPage,TemplateEditor,StagesPage,PositionsPage}.tsx` | Rendah | B9: pakai `GET /api/v1/risk-templates/usage`, `/positions/{id}/impact`, dan endpoint pemakaian tahap saat mode lokal dihapus |
| U-23 | **DevPanel "Simulasikan komentar masuk" masih menulis store lokal** (B4), sehingga tidak muncul di utas backend; uji banner "[n] komentar baru" kini memakai dua sesi/tab | `dev/DevPanel.tsx` | Rendah | Endpoint dev yang membuat komentar persona lain, atau hapus tombolnya di B9 |
| U-24 | **Reset data dev tidak mengosongkan bucket** (B4): baris lampiran hilang, objek di RustFS tetap ada | `simario/devtools/seed.py` | Rendah | Hapus prefix `attachments/` dan `quarantine/` saat `POST /api/v1/dev/reset` |
| U-05 | FR-MST-008 "Tambah Jenis" (membuat jenis jabatan baru) **belum ada**; hanya aktif/nonaktif jenis bawaan | `pages/master/PositionsPage.tsx`, `masterApi` | Sedang | Tambah formulir jenis (nama, lini, peran bawaan, multi-Pejabat, isian identitas) |
| U-06 | FR-AUT-006: menu "Sunting" pengguna hanya mengubah peran manual; ubah NIP/nama/email oleh Superadmin belum ada | `pages/admin/UsersPage.tsx` | Sedang | Tambah dialog sunting identitas + audit |
| U-07 | Versi lembar otomatis (`runSheetFreeze`) hanya dievaluasi saat aplikasi dimulai atau jam simulasi digeser, tidak langsung setelah "Kirim Penjelasan" atau hasil Lini 3 terlambat terbuka | `data/local/scheduler.ts`, `data/api/assessment.ts` | Sedang | Panggil setelah event terkait (seperti `runComparisons`) |
| U-08 | Isi lampiran tidak disimpan (field `blobKey`/IndexedDB disiapkan tetapi tidak dipakai); gambar = placeholder; alur karantina pemindaian gagal tidak pernah terjadi | `domain/types.ts` (`Attachment`), `data/api/thread.ts` | Sedang | Backend RustFS + ClamAV; di prototipe opsional simpan gambar ≤ 500 KB di IndexedDB (CLAUDE.md §4) |
| U-09 | Bentuk data prototipe menyimpang dari PRD §2.8.1 di beberapa entitas (`mentionUserIds`, `supports[]` tertanam, `PrintPhotoSelection` di preferensi `userId='*'`, tanpa `ImportJob`, tanpa `no_step_flag`, dll.) | `domain/types.ts` | Sedang | Ikuti tabel [01_backend.md §4.2](01_backend.md#42-perbedaan-bentuk-yang-harus-diputuskan-saat-membangun-backend) |
| U-10 | Bundel JavaScript tunggal **812 kB** (gzip 228 kB) — Vite memperingatkan > 500 kB; hanya galeri komponen yang dimuat malas; template seed 120 kB ikut dibundel | `src/App.tsx`, `vite.config.ts` | Rendah | `lazy()` per modul halaman; di produksi seed tidak dibundel |
| U-11 | Pencarian global (Ctrl K) hanya mencari halaman dan jabatan, padahal placeholder "Cari risiko atau jabatan…"; komentar kode masih "Risks join in Tahap 5" | `layout/Topbar.tsx` | Rendah | Tambah risiko (uraian) ke hasil, atau ubah placeholder |
| U-12 | Sinkron antar-tab memakai event `storage`, bukan polling 30 detik (NFR-015) | `data/local/store.ts` | Rendah | Backend: polling `GET …/thread?since=` saat halaman utas terlihat |
| U-13 | Berkas besar yang sulit dirawat: `data/api/assessment.ts` (1.183 baris), `layout/Shell.css` (1.187), `pages/master/Master.css` (909), `data/api/register.ts` (871), `pages/admin/UsersPage.tsx` (869) | — | Rendah | Pecah per sub-fitur saat disentuh berikutnya |
| U-14 | Parameter `opts.write` di `call()` tidak dipakai | `data/local/call.ts` | Rendah | Hapus atau pakai untuk membedakan GET/POST saat migrasi |
| U-15 | Uji: tidak ada uji end-to-end/regresi visual otomatis; verifikasi 1440/390 px manual; Vitest membuat jsdom sekali per berkas uji (26 berkas, ± 1 menit) | `vite.config.ts` | Rendah | Pertimbangkan Playwright untuk skenario utama; `pool: 'vmThreads'` |
| U-16 | Data contoh statis per 6 Apr 2027; skenario tanggal lain memakai `seedAsOf` yang hanya **mendekati** (penilaian yang dituntaskan setelah titik potong dianggap belum dimulai; tidak ada riwayat draf). Menaikkan `SCHEMA_VERSION` menghapus data demo yang diketik pengguna | `data/seed/asOf.ts`, `data/db.ts` | Sedang | Diterima untuk prototipe; dokumentasikan di demo |
| U-17 | Persona di CLAUDE.md §5 menyebut Dimas Prasetyo juga "Pejabat Pengadaan Satker B", padahal seed memberi jabatan itu ke Wulan Sari (`occ-wulan-pjp-b`); `frontend/README.md` sudah sesuai seed. Tidak ada persona seed yang memegang lebih dari satu tampilan peran, jadi pengalih tampilan peran (FR-AUT-007) hanya terlihat setelah Superadmin memberi peran manual tambahan | `CLAUDE.md`, `data/seed/org.ts` | Rendah | Pilih salah satu sumber (mockup atau seed) dan selaraskan |

## 5. Sudah diselesaikan

| Tanggal | Butir | Catatan |
|---|---|---|
| 22 Okt 2026 | **U-21** — stub pemakaian penilaian | B5: `simario/assessments/usage.py` membaca penilaian sungguhan; arsip TA menutup penilaian dan penjelasan lewat `assessments/archive.py` (`on_archive`) |
| 22 Okt 2026 | **R-10** — "Keluar" tidak mengakhiri sesi Keycloak | B4s: `POST /api/v1/auth/logout` mengembalikan URL end-session Keycloak (`id_token_hint`, `post_logout_redirect_uri=/login`) setelah masuk lewat SSO; klien mengikutinya. Uji `test_sso_sign_out_ends_the_keycloak_session` |
| 22 Okt 2026 | Penerima sinyal `user_logged_in` (B1) dipegang lemah dan hilang di gunicorn, sehingga setiap sesi langsung berakhir | B4s: `weak=False`; ditemukan saat uji asap stack produksi. Uji `test_epoch_receiver_is_held_strongly` |
| 21 Okt 2026 | **U-04** — FR-AUT-008: perubahan peran/izin/holding/delegasi tidak membatalkan sesi | B2: layanan admin memanggil `bump_auth_epoch` untuk pengguna terkait (peran manual, izin peran, penetapan/alih Pejabat, Pengisi, Operator, penugasan, tugas `delegations`); uji `test_replace_official_ends_sessions_of_affected_users`, `test_assignment_change_updates_lini2_scope` |
| 21 Okt 2026 | **U-19** — sesi SSO pengguna nonaktif tetap hidup | B2: `SimarioOIDCBackend.get_user` mengembalikan None untuk pengguna nonaktif dan `deactivate_user` menaikkan `auth_epoch`; uji `test_inactive_sso_user_is_not_restored`, `test_deactivated_user_session_ends` |
| 21 Okt 2026 | `frontend/README.md` masih menyebut "PRD v2.7" | Diperbarui ke v2.9 bersama dokumen ini |
| 21 Okt 2026 | **U-02** (Tinggi) — cakupan baca (izin 1) hanya diperiksa di `layout/Workspace.tsx` | `canReadPosition` (`domain/rules/access.ts`) + `assertCanRead` (`data/local/actor.ts`) dipanggil di `buildBoard`, `buildThread`, `buildAssessment`, `buildHistory`, `buildSheetView`, `buildRegisterView`, dan `sheetApi.print`; `sheetApi.findByNumber` menjawab "tidak ditemukan" untuk nomor di luar cakupan. Lini 2 dibatasi ke TA penugasannya, termasuk di `Workspace.tsx`. Uji: `data/api/readAccess.test.ts` |
| 21 Okt 2026 | **U-03** (Tinggi) — visibilitas draf/tambahan register untuk pembaca dihitung di halaman (`pages/register/model.ts`) | Read model `buildRegisterView` + `registerApi.view` di `data/api/registerView.ts`: pembaca hanya menerima risiko dan mitigasi terbit, tanpa butir tertunda dan celah terbit, dan tidak menerima apa pun dari register yang belum pernah terbit. `model.ts` dihapus; `RiskCard` menerima mitigasi terfilter. Uji: `data/api/readAccess.test.ts` |
