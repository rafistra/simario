# 05 — Pengembangan Lokal dan Pengujian

> Status dokumen: 21 Okt 2026 · kode `frontend/` per komit `7bebb66`.
> Hasil pemeriksaan terakhir (21 Okt 2026, checkpoint B1): `npm run test` **36 berkas / 308 uji lulus**, `npm run lint` lulus (termasuk `api:check`), `npm run build` lulus (dengan peringatan ukuran bundel, U-10); backend `uv run pytest` lulus, `ruff` dan `mypy` bersih; uji asap SSO lulus.

## 1. Prasyarat

| Kebutuhan | Versi | Catatan |
|---|---|---|
| Node.js | 22 (sama dengan `netlify.toml`) | npm ikut terpasang |
| Browser | Chrome/Edge 115+, Firefox 120+ (NFR-005) | Edge dipakai untuk screenshot headless |
| Git | — | `.gitattributes` memaksa LF |
| Backend | Docker Desktop (Compose v2), `uv` | Hanya untuk kerangka backend (§2a); prototipe masih memakai `localStorage` sampai modulnya dipindah |
| Pencil + MCP Pencil | — | Hanya untuk membaca `Simario.pen` (token, ukuran, screenshot frame) |

Di Windows, perintah di bawah berjalan di Git Bash maupun PowerShell.

## 2. Menjalankan aplikasi

Dari folder `frontend/`:

```bash
npm install
```

```bash
npm run dev
```

Buka http://localhost:5173. Saat pertama dibuka, data contoh dimuat dari seed dan disimpan di `localStorage`.

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server dev Vite (HMR) |
| `npm run build` | `tsc -b` (pemeriksaan tipe) + build produksi ke `frontend/dist` |
| `npm run preview` | Menyajikan `dist` secara lokal |
| `npm run test` | Vitest sekali jalan (jsdom) |
| `npm run test:watch` | Vitest mode pantau |
| `npm run lint` | ESLint + `prettier --check` |
| `npm run format` | Prettier menulis ulang berkas |
| `npm run tokens` | Membuat ulang `src/styles/tokens.css` dari `scripts/pencil-variables.json` |
| `npm run api:types` | Membuat ulang `src/data/http/schema.d.ts` dari `backend/openapi.yaml` |
| `npm run api:check` | Gagal bila `schema.d.ts` basi (bagian dari `npm run lint`) |

## 2a. Backend lokal

Spec: `docs/superpowers/specs/2026-10-21-backend-integration-design.md` (§4.11). Pertama kali, dari root repositori:

```bash
cp .env.example .env
```

```bash
docker compose up -d --build
```

Start pertama butuh waktu: image diunduh dan ClamAV mengunduh basis data virus (± 5 menit; `clamav` berstatus `starting` sampai selesai). Service `migrate` berjalan sekali (migrasi + `init_storage` membuat bucket), lalu `api`, `worker`, dan `beat` mulai.

| Layanan | Alamat di host | Catatan |
|---|---|---|
| Frontend (Vite) | http://localhost:5173 | `npm run dev` di host; proxy `/api` dan `/oidc` → API, `/storage` → RustFS |
| API (Django) | http://localhost:8100/api/v1/health | Port host 8100 (8000 sering terpakai); skema `/api/v1/schema`, Swagger `/api/v1/docs` |
| Keycloak | http://127.0.0.1:8080 | Konsol admin `admin`/`admin`; realm `otorita-ikn` diimpor dari `infra/keycloak/realm-export.json`. Pakai `127.0.0.1`, bukan `localhost` (port hanya terikat IPv4) |
| RustFS | http://localhost:9100 (S3), http://localhost:9101 (konsol) | Port host 9100/9101 (9000/9001 sering terpakai) |
| PostgreSQL | localhost:5432 | `simario`/`simario` |
| Redis | localhost:6379 | — |
| ClamAV | hanya di jaringan compose (`clamav:3310`) | — |

Semua port host hanya terikat ke `127.0.0.1` (tidak terjangkau dari jaringan kantor). `GET /api/v1/health` menjawab `200 {"status":"ok"}` bila basis data, Redis, storage, dan ClamAV siap; `503 "degraded"` menyebut pemeriksaan yang gagal.

Uji dan lint backend berjalan di host (`uv` memasang Python 3.12 sendiri), dari `backend/`, dengan service `db` menyala:

```bash
uv run pytest
```

```bash
uv run ruff check .
```

```bash
uv run ruff format --check .
```

```bash
uv run mypy .
```

Setelah endpoint berubah, buat ulang skema lalu tipe TS (`uji test_committed_schema_is_current` dan `npm run api:check` gagal bila lupa):

```bash
uv run python manage.py spectacular --file openapi.yaml --validate
```

```bash
npm run api:types
```

Vektor uji bersama ada di `shared/test-vectors/` (format di README-nya); Vitest dan pytest membaca berkas yang sama.

### Data, persona, dan SSO (B1)

- **Data demo backend** = ekspor otomatis seed prototipe. Setelah seed frontend berubah, jalankan `npm run seed:export` (dari `frontend/`): menulis `backend/simario/devtools/fixtures/demo.json`, `frontend/src/data/http/legacy-ids.json` (jembatan ID sementara), dan pengguna realm di `infra/keycloak/realm-export.json`. Lalu `uv run python manage.py build_catalog` bila peran, izin, jenis jabatan, formulir Data Umum, atau pita berubah.
- **Memuat data demo** (hanya bila `SIMARIO_DEV_TOOLS=true`; menghapus semua data): `docker compose exec api python manage.py seed_demo`, opsional `--as-of 2027-03-18T09:00`. Jam simulasi diatur ke 6 Apr 2027 09.00 WITA (atau `--as-of`).
- **Data referensi** untuk semua lingkungan (tidak pernah menimpa): `docker compose exec api python manage.py seed_reference`.
- **Masuk lewat Keycloak lokal:** tombol "Masuk dengan Akun Otorita IKN" → nama pengguna = NIP persona, kata sandi `simario-demo` (khusus lokal). NIP Galih Pratama (`199812012024011001`) ada di Keycloak tetapi tidak di SIMARIO, untuk mencoba pesan "Akun Anda belum terdaftar".
- **Masuk sebagai persona tanpa Keycloak:** tombol "Masuk sebagai persona (mode pengembangan)" di `/login`, menu DevPanel "Masuk sebagai", atau tautan demo `?sebagai=usr-andi&waktu=2027-03-18T09:00&data=sesuai` (semuanya lewat `/api/v1/dev/*`).
- **Impor ulang realm** setelah `realm-export.json` berubah: `docker compose rm -sf keycloak && docker compose up -d keycloak`.
- **Cari pegawai (B2):** `GET /api/v1/staff?q=` (dialog "Tunjuk Operator") memanggil Keycloak Admin REST dengan service account client `simario` (peran realm-management `view-users`, sudah ada di realm lokal). Untuk sso.ikn.go.id client yang sama perlu peran itu; tanpa `OIDC_*` atau bila Keycloak tidak terjangkau, jawabannya 503 "Pencarian pegawai belum tersedia."
- **Lampiran (B4):** unggahan disimpan di RustFS dan dipindai ClamAV oleh worker Celery (`docker compose logs worker` menampilkan `clamd: stream: OK|… FOUND`). Unduhan diarahkan ke `/storage/…` (proxy Vite → RustFS, URL bertanda tangan untuk `S3_PUBLIC_ENDPOINT`). Uji karantina: unggah DOCX (zip) berisi string EICAR. Setelah dependensi backend berubah: `docker compose up -d --build api worker beat`.
- **Impor CSV (B2):** `/pengaturan/impor` membuat `ImportJob` uji coba di backend; "Terapkan" memeriksa ulang lalu menerapkan. Pemisah `,` atau `;` (Excel), BOM, dan CRLF diterima. `POST /api/v1/dev/reset` menghapus job dan pengguna baru.
- **Uji asap SSO** (butuh `npm run dev`): `uv run python scripts/oidc_smoke.py 198204172008011003` → berakhir dengan `GET /api/v1/me` 200; dengan NIP Galih → `refused: belum-terdaftar`.
- Selama transisi, modul yang belum pindah masih memakai data `localStorage`; DevPanel menggeser jam dan mengatur ulang data di kedua sisi.

Mengatur ulang semua data backend (basis data, bucket, basis data ClamAV, Keycloak):

```bash
docker compose down -v
```

## 2b. Staging dan produksi

Satu berkas `docker-compose.prod.yml` untuk staging dan produksi (gunicorn, Celery worker/beat, PostgreSQL, Redis, RustFS, ClamAV, nginx dengan HTTPS). Perbedaannya hanya `.env.prod` (lihat `.env.prod.example`): `DJANGO_SETTINGS_MODULE=config.settings.staging|production`, domain, rahasia, `OIDC_*`. Hanya nginx yang membuka port dan ia menambahkan header keamanan (HSTS sesuai `SECURE_HSTS_SECONDS`, `X-Frame-Options DENY`, `frame-ancestors 'none'`, nosniff) pada setiap respons (`infra/nginx/security-headers.conf`); `/storage` diteruskan ke RustFS dengan Host yang dipakai tanda tangan URL unduhan. Kebutuhan server: [07_staging_requirements.md](07_staging_requirements.md).

**Menyebarkan ke staging**

1. Salin repositori ke server, buat `.env.prod` dari `.env.prod.example`, pasang sertifikat di `TLS_CERT_DIR` (`fullchain.pem`, `privkey.pem`).
2. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` — layanan `migrate` menjalankan `migrate`, `init_storage`, `seed_reference`, `collectstatic` sebelum `api` mulai.
3. `docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python manage.py create_superadmin --nip <NIP> --name "<Nama>"`.
4. Uji asap: dari `backend/`, `uv run python ../infra/smoke.py https://<domain> <NIP> <kata-sandi-sementara> .env.prod`.
5. Build uji coba menyembunyikan modul yang belum pindah ke backend (`VITE_HIDE_UNMIGRATED=true`, `frontend/src/data/http/migrated.ts`); Beranda tampil dalam versi sementara.

**Mencoba di mesin ini**: `sh infra/nginx/dev-cert.sh localhost`, isi `.env.prod.local` (contoh: `HTTPS_PORT=8443`, `CSRF_TRUSTED_ORIGINS=https://localhost:8443`, `SECURE_HSTS_SECONDS=0`), lalu `SIMARIO_ENV_FILE=.env.prod.local docker compose -f docker-compose.prod.yml --env-file .env.prod.local up -d --build` dan uji asap ke `https://localhost:8443`. Matikan dengan `SIMARIO_ENV_FILE=.env.prod.local docker compose -f docker-compose.prod.yml --env-file .env.prod.local down` (volume tetap). Setiap perintah compose stack ini memerlukan `--env-file` (dan `SIMARIO_ENV_FILE` bila bukan `.env.prod`): tanpa itu compose berhenti karena `POSTGRES_PASSWORD` dan `S3_ACCESS_KEY` wajib diisi.

## 3. Masuk dan persona

Di `/login`, tombol **"Masuk dengan Akun Otorita IKN"** membuka pemilih persona (pengganti SSO). Akun lokal ("Masuk dengan akun lokal"):

| Persona | NIP | Kata sandi seed | Catatan |
|---|---|---|---|
| Lestari Wulandari (Operator UKPBJ) | `199404052019032003` | `Lestari-Awal-2027` | Wajib ganti kata sandi saat masuk pertama |
| Admin DKB (Superadmin) | `198703122010011002` | `Simario-Admin-2027!` | |

Nilai di atas fiktif dan hanya ada di seed prototipe. Lima kali gagal → terkunci 15 menit.

Persona utama dan id-nya (untuk `?sebagai=`):

| id | Persona | Peran |
|---|---|---|
| `usr-andi` | Andi Wirawan | Pejabat PPK A-1 · DDKB (Lini 1) |
| `usr-rafi` | Rafi Ananda | Operator PPK A-1 |
| `usr-bambang` | Bambang Hartono | Pejabat PPK A-2 |
| `usr-dimas` | Dimas Prasetyo | Operator PPK A-2, Pengisi Pokja Pemilihan 03 (contoh pemilih jabatan) |
| `usr-ratna` | Ratna Sari | Anggota Pokja 03 (bukan Pengisi) |
| `usr-hadi` | Hadi Susanto | KPA Satker A (register TA 2027 belum ada — alur salin) |
| `usr-siti` | Siti Rahmawati | Penanggung Jawab Pemantauan (Lini 2) |
| `usr-lestari` | Lestari Wulandari | Operator UKPBJ (Lini 2 pendukung), akun lokal |
| `usr-hendra` | Hendra Gunawan | Direktorat Kepatuhan (Lini 3) |
| `usr-maya` | Maya Kusuma | Direktorat Pengawasan dan Audit Internal (Lini 3) |
| `usr-dewi` | Dewi Anggraini | Pembaca cakupan Unit DDKB (bukan peserta utas) |
| `usr-nur` | Nur Aini | Pengelola Master Data |
| `usr-admin` | Admin DKB | Superadmin, akun lokal |

Persona lain di seed: `usr-yohanes` (anggota Pokja 03), `usr-rina`, `usr-budi` (nonaktif), `usr-wulan` (Pejabat Pengadaan Satker B), `usr-yudi` (Biro Keuangan), `usr-wahyu` (Pejabat UKPBJ), `usr-rizky`, `usr-fajar`. Galih Pratama ada di direktori pegawai (untuk demo "Tunjuk Operator"), belum menjadi pengguna.

## 4. DevPanel dan tautan demo

Tombol **Prototipe** di kanan bawah (`src/dev/DevPanel.tsx`):

- ganti persona tanpa keluar;
- geser **tanggal simulasi** (bawaan 6 Apr 2027 09.00) dan preset: 11 Jan 2027 (Beranda awal tahun), 18 Mar 2027 (jendela Lini 1 TW I), 22 Mar 2027 (fase buta TW I), 6 Apr 2027 (hasil TW I dibuka), 20 Jul 2027 (riwayat TW II), 12 Okt 2027 (administrasi);
- **Sesuaikan data ke tanggal ini** — memuat ulang data contoh seperti keadaannya pada tanggal simulasi;
- latensi simulasi (150–400 ms), gagalkan panggilan berikutnya, mode luring, batas sesi tidak aktif;
- tema terang/gelap, **Simulasikan komentar masuk** (di halaman utas), atur ulang data.

Tugas terjadwal (pembukaan perbandingan, Berulang, pengingat, versi lembar, arsip TA, delegasi kedaluwarsa) dievaluasi setiap tanggal digeser.

Parameter URL (dibaca `src/main.tsx` dan `src/lib/theme.ts`):

| Parameter | Contoh | Efek |
|---|---|---|
| `sebagai` | `?sebagai=usr-andi` | Masuk sebagai persona aktif |
| `waktu` | `&waktu=2027-03-18T09:00` | Menyetel tanggal simulasi (format `YYYY-MM-DDTHH:mm`) |
| `data=sesuai` | `&data=sesuai` | Bersama `waktu`: data contoh digulung ke tanggal itu |
| `tema` | `?tema=gelap` / `?tema=terang` | Memaksa tema |
| `salinan` + `cetak=pratinjau` | di halaman Lembar | Menahan tata letak cetak salinan beku untuk pratinjau PDF |

## 5. Data lokal dan cara mengatur ulang

| Kunci `localStorage` | Isi |
|---|---|
| `simario:v1:<koleksi>` (36 koleksi) | Basis data prototipe (`src/data/db.ts`) |
| `simario:v1:schemaVersion` | Saat ini `9`; bila berbeda dari `SCHEMA_VERSION`, data di-seed ulang |
| `simario:session` | Pengguna, jabatan aktif, tampilan peran, lockout, jabatan terakhir |
| `simario:clock` | Tanggal simulasi |
| `simario:dev` | Latensi, gagal berikutnya, luring, batas sesi |
| `simario:theme` | Tema |

Mengatur ulang: DevPanel → **Atur ulang data**, atau hapus semua kunci `simario:*` lewat DevTools → Application → Local Storage. Saat mengubah bentuk entitas atau seed, **naikkan `SCHEMA_VERSION`** di `src/data/db.ts` dan catat di CLAUDE.md.

## 6. Pengujian otomatis

Vitest dengan jsdom dan Testing Library (`vite.config.ts` → `test`, `src/test/setup.ts`). Berkas uji berdampingan dengan kodenya (`*.test.ts(x)`).

| Lapisan | Berkas | Jumlah uji | Yang diuji |
|---|---|---|---|
| Domain | `domain/rules/access.test.ts` | 9 | Holding, izin, Pejabat/Pengisi, cakupan, partisipasi |
| | `domain/rules/visibility.test.ts` | 6 | VIS-1 fase buta, VIS-2, VIS-5/9 |
| | `domain/calendar.test.ts` | 7 | Default triwulan §2.5, hari kerja, keterlambatan |
| | `domain/scoreBands.test.ts` | 6 | Pita & pilihan penilaian (INV-3, INV-26) |
| Data / API | `data/api/register.test.ts` | 12 | Siapa boleh menyusun/menerbitkan (INV-12/24/25), gerbang, salin |
| | `data/api/thread.test.ts` | 14 | Partisipasi §1.5, Langkah, sunting 15 menit, konfidensial |
| | `data/api/assessment.test.ts` | 11 | Siklus TW I dari 18 Mar 2027, pembukaan, penjelasan, Berulang |
| | `data/api/sheets.test.ts` | 9 | Payload lembar (FR-LBR-001…004), VIS-7, snapshot |
| | `data/api/home.test.ts` | 10 | Lembar Mutu, kartu Beranda |
| | `data/api/master.test.ts` | 19 | Izin di repository, validasi master |
| | `data/api/admin.test.ts` | 14 | Pengguna & holding (FR-ADM-004/005), delegasi |
| | `data/api/readAccess.test.ts` | 12 | Cakupan baca (izin 1) di semua read model ruang kerja, cetak, cari nomor; visibilitas register per pembaca (FR-REG-012) |
| | `data/api/flow.test.ts` | 1 | Alur penuh TW I dari pengisian sampai cetak |
| | `data/local/scheduler.test.ts` | 1 | Tugas terjadwal idempoten |
| | `data/seed/seed.test.ts` | 12 | Template dari dek Rapim: 4 / 14 / 146 / 302; uraian register = template |
| UI | `App.test.tsx` | 9 | Rute dan penjaga akses (403/404) |
| | `components/components.test.tsx` | 10 | Pustaka komponen |
| | `layout/AppShell.test.tsx` | 2 | Sidebar diciutkan |
| | `pages/*/…test.tsx` (7 berkas) | 37 | Register, Papan, Penilaian, Lembar, Master, Administrasi, Notifikasi |
| Lib | `lib/format.test.ts` | 5 | Format skor, tanggal |

Menjalankan satu berkas atau satu nama uji:

```bash
npx vitest run src/data/api/assessment.test.ts
```

```bash
npx vitest run -t "VIS-1"
```

Aturan menulis uji baru:

- Setiap aturan bisnis baru di `domain/rules/` mendapat uji unit (CLAUDE.md §6).
- Aturan visibilitas dan kerahasiaan (VIS-1…9, INV-16/17) dan cakupan baca diuji di tingkat read model (`data/api/*.test.ts`), bukan hanya di UI. Read model baru untuk ruang kerja jabatan memanggil `assertCanRead` dan ditambahkan ke `data/api/readAccess.test.ts`.
- Uji memakai seed asli dan jam simulasi (`useClock.getState().setNow(...)`), tidak memakai `new Date()`.

## 7. Verifikasi visual terhadap mockup

Diwajibkan untuk setiap halaman di checkpoint (CLAUDE.md §9 butir 3) pada 1440 px dan 390 px.

1. Ambil frame acuan lewat MCP Pencil: `TakeScreenshot([frameId])` (id dari FrameIndex `TvVoU`).
2. Jalankan `npx vite` di latar.
3. Screenshot desktop dengan Edge headless:

```bash
msedge --headless=new --screenshot=register-1440.png --window-size=1440,5200 "http://localhost:5173/jabatan/pos-ppk-a1/register/2027?sebagai=usr-andi"
```

4. Ponsel: Edge headless punya lebar minimum di atas 390 px. Buat berkas sementara di `frontend/public/` berisi `<iframe>` selebar 390 px yang memuat halaman tujuan, screenshot berkas itu, lalu **hapus berkasnya**.
5. Bandingkan; catat perbedaan yang disengaja di `frontend/README.md` ("Perbedaan yang disengaja").

Daftar periksa manual tambahan: navigasi keyboard menampilkan cincin fokus, tidak ada gulir horizontal di 390 px, target sentuh ≥ 44 px, mode gelap (`?tema=gelap`), keadaan kosong/memuat/galat (DevPanel: latensi, gagalkan panggilan berikutnya, luring).

## 8. Skenario uji manual

| # | Skenario | Persona & tanggal | Langkah |
|---|---|---|---|
| 1 | Register | `?sebagai=usr-rafi` | Susun, "Tandai Siap Diterbitkan" → ganti ke Andi, terima notifikasi, "Terbitkan Register"; gerbang struktural memblokir dengan daftar bernomor; risiko tanpa mitigasi terbit dengan flag |
| 2 | Utas | Hendra, lalu Andi | Hendra melampirkan berkas konfidensial → Andi hanya melihat "1 lampiran konfidensial"; Langkah Andi menghapus penanda sepi |
| 3 | Penilaian TW I | `&waktu=2027-03-18T09:00&data=sesuai` | Rafi mengisi, Andi menuntaskan; geser ke 1–2 Apr, Hendra & Maya menilai; 3 Apr perbandingan terbuka sebagian; Andi mengirim penjelasan Tidak Sesuai |
| 4 | Lembar | Andi | Cetak dari tampilan berjalan membuat salinan bernomor `SIMARIO/LK/2027/TW1/DDKB-PPKA1/00n`; mencetak salinan beku tidak membuat salinan baru |
| 5 | Administrasi | Admin DKB | Alih Pejabat PPK A-1 mengakhiri operator lama; Andi menunjuk Galih Pratama sebagai operator dari Jabatan Saya → Galih dapat masuk |
| 6 | Master | Nur Aini | `/master/template`: 4 jenis, 14 tahap; draf pita bercelah ditolak; template nonaktif hilang dari pilihan register baru |
| 7 | Akses | Andi | `/pengaturan/pengguna` → 403; rute asal → 404 |

Skenario per user story ada di [06_user_stories.md](06_user_stories.md).

## 9. Sebelum komit dan checkpoint

1. `npm run build`, `npm run test`, `npm run lint` lulus (dari `frontend/`); untuk tahap backend juga `uv run pytest`, `ruff check`, `ruff format --check`, `mypy` (dari `backend/`).
2. Halaman yang diubah dibandingkan dengan frame `.pen` pada 1440 px dan 390 px.
3. Keadaan kosong, memuat, galat + "Coba Lagi", Operator, read-only/arsip tersedia sesuai note frame.
4. Dicoba manual dengan persona yang relevan.
5. Bila bentuk data/seed berubah: `SCHEMA_VERSION` naik.
6. Pesan komit `tipe: deskripsi` tanpa scope (`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`), bahasa Inggris imperatif, **tanpa** baris `Co-Authored-By` atau atribusi Claude (CLAUDE.md §11). Checkpoint tahap: `feat: <ringkasan> (checkpoint N)`.

## 10. Rilis demo (Netlify)

- **Lewat Git:** hubungkan repositori di Netlify; `netlify.toml` sudah mengatur base `frontend`, `npm run build`, publish `dist`, Node 22, pengalihan SPA, dan header `noindex`.
- **Seret-lepas:** `npm run build`, lalu seret `frontend/dist` ke app.netlify.com/drop (`public/_redirects` ikut tersalin).

Setiap pengunjung memegang salinan data sendiri di browsernya dan dapat masuk sebagai persona mana pun — **hanya untuk data fiktif** (R-02 di [04_risk_and_debt.md](04_risk_and_debt.md)).

## 11. Masalah umum

| Gejala | Penyebab | Solusi |
|---|---|---|
| Data contoh tidak sesuai skenario | Data lama di `localStorage` atau tanggal simulasi bergeser | DevPanel → "Sesuaikan data ke tanggal ini" atau "Atur ulang data" |
| Perubahan seed tidak terlihat | `SCHEMA_VERSION` belum dinaikkan | Naikkan di `src/data/db.ts`, atau atur ulang data |
| Galat impor `@seed/...` saat dev | `server.fs.allow` tidak mencakup `docs/` | Pastikan `vite.config.ts` tetap `fs: { allow: ['..'] }` |
| Token CSS berubah tidak sesuai `.pen` | `tokens.css` diedit tangan | Ambil ulang `GetVariables()` → `scripts/pencil-variables.json` → `npm run tokens` |
| Uji lambat (± 1 menit) | jsdom dibuat per berkas | Jalankan berkas tertentu saja; lihat U-15 |
| `docker compose up` gagal "port is already allocated" | Proyek lain memakai port host yang sama | Hentikan proyek itu atau ubah pemetaan port di `docker-compose.yml` (lalu `.env` dan `vite.config.ts`) |
| `/api/v1/health` 503 dengan `clamav: error` | ClamAV masih mengunduh basis data virus | Tunggu `docker compose ps` menunjukkan `clamav` `healthy` |
| `test_committed_schema_is_current` gagal | `openapi.yaml` basi | Jalankan `spectacular --file openapi.yaml`, lalu `npm run api:types` |
| Halaman langsung ke `/login?alasan=sesi-berakhir` | Batas sesi tidak aktif tercapai (bawaan 60 menit, bisa dipercepat di DevPanel) | Masuk lagi; periksa setelan batas sesi di DevPanel |
