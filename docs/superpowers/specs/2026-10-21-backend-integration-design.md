# Desain — Integrasi Backend SIMARIO

| | |
|---|---|
| Tanggal | 21 Okt 2026 |
| Status | Disetujui pengguna 21 Okt 2026; revisi 22 Okt 2026 (pengguna): ClamAV dihapus, pemindaian oleh antivirus VM (PRD v2.9.2) |
| Branch | `feat/backend-integration` |
| Acuan | PRD v2.9 (§2.1, §2.3, §2.5–§2.8), [01_backend.md](../../01_backend.md) (§2.1 keputusan stack), [03_api_contract.md](../../03_api_contract.md), [04_risk_and_debt.md](../../04_risk_and_debt.md) |

## 1. Maksud

SIMARIO sekarang adalah prototipe frontend lengkap (10 modul PRD) yang menyimulasikan server di browser (`frontend/src/data/local/`, `localStorage`). Proyek ini membangun **backend sungguhan untuk seluruh modul** dan memindahkan frontend ke backend itu, sehingga SIMARIO dapat dipakai oleh banyak pengguna dengan data bersama.

Urutan pemakaian yang dituju (keputusan pengguna):

1. **Uji coba terbatas** dengan beberapa PPK sungguhan.
2. **UAT** dengan semua lini (Lini 1, Lini 2, Lini 3, Pengelola Master Data, Superadmin).
3. **Dipakai sungguhan pertama kali untuk TW I TA 2027.** Tanggal belum pasti. Kalender TA 2027: jendela Lini 3 buka 1 Jan 2027, Lini 1 buka 1 Mar, tenggat Lini 1 26 Mar, tenggat Lini 3 2 Apr. Register PPK harus terbit sebelum jendela dibuka.

Yang membangun dan merawat: **pengguna bersama Claude**. Tidak ada tim lain, sehingga rancangan memilih yang sederhana, umum, dan terdokumentasi.

## 2. Tujuan, bukan tujuan, anti-tujuan

### Tujuan

- Satu backend Django yang memenuhi **semua** modul PRD (AUT, BRD, REG, PPN, NIL, RWY, LBR, MST, NTF, ADM) dan seluruh kontrak di `03_api_contract.md`, termasuk endpoint baca untuk data yang kini dibaca halaman langsung dari store (§5 dokumen itu, utang U-01).
- Backend menjadi **satu-satunya sumber kebenaran**: izin tiga lapis, visibilitas VIS-1…9, invarian, audit, notifikasi, dan tugas terjadwal berjalan di server.
- Frontend memakai backend lewat HTTP; **mode prototipe tanpa backend dihapus** setelah perpindahan selesai (keputusan pengguna).
- Berjalan lokal dengan satu perintah (`docker compose up`), lengkap dengan persona contoh dan jam simulasi.
- Siap dipindah ke server OIKN dan ke Keycloak `sso.ikn.go.id` **hanya dengan mengganti konfigurasi**.

### Bukan tujuan (proyek ini)

- Menyebarkan **produksi** ke server OIKN atau menyambung ke `sso.ikn.go.id` (belum ada akses). Yang dikerjakan: konfigurasi dan daftar kebutuhan agar siap. **Staging masuk cakupan** (§4.11): konfigurasi dan panduan penyebarannya siap di B4; penyebaran fisiknya dilakukan saat akses server tersedia.
- Memindahkan data uji coba ke produksi. Uji coba **sekali pakai**; produksi dimulai bersih *(diputuskan pengguna)*.
- Mengubah tampilan, alur, atau aturan yang sudah disetujui di prototipe. Perubahan perilaku hanya bila PRD menuntutnya dan prototipe belum memenuhinya; dicatat di laporan tahap.
- Fitur di luar PRD v2.9; kalender libur nasional (v1.1, R-07); format Kepka 47 (OQ-5); retensi/pemusnahan ANRI (OQ-8).
- Instrumentasi `PageTiming` (Tujuan 8) — metrik tetap "Data belum cukup" seperti sekarang.
- Uji end-to-end browser otomatis (Playwright) — tetap verifikasi manual seperti prototipe.

### Anti-tujuan

**Rancangan yang harus dirombak di tengah jalan** (keputusan pengguna). Karena itu dokumen ini mengunci keputusan besar di depan (§4). Hal yang sengaja dibiarkan terbuka tercatat di §9 dan tidak boleh memaksa perubahan pada keputusan §4. Bila pembangunan menemukan bahwa keputusan §4 salah, **berhenti dan tanyakan ke pengguna** sebelum menyimpang.

## 3. Batasan

- Stack sesuai [01_backend.md §2.1](../../01_backend.md#21-keputusan-stack-21-okt-2026): Python 3.12, Django 5.2 LTS + DRF, PostgreSQL 16, Celery 5.5 + Redis 7 + `django-celery-beat`, RustFS (API S3), Keycloak (OIDC). Pemindaian malware dilakukan antivirus yang sudah terpasang di VM OIKN, bukan oleh aplikasi *(revisi 22 Okt 2026, pengguna; semula ClamAV)*.
- PRD menang bila berbeda dengan prototipe, **kecuali** keputusan pengguna yang sudah tercatat: `objectiveEnabled` (A-8), pilihan kalimat penilaian (A-7), RustFS (A-12).
- Template risiko hanya dari `docs/seed/template_risiko_rapim.json`; kalimat penilaian dari `docs/seed/pilihan_penilaian.json`. Jangan menyalin teksnya ke kode.
- Tidak memanggil layanan eksternal selain yang ada di Docker Compose.
- Aturan kerja repositori tetap berlaku: tahap dengan checkpoint dan persetujuan pengguna, komit `tipe: deskripsi` tanpa atribusi, dokumen `docs/00–06` diperbarui di komit yang sama.
- **CLAUDE.md saat ini melarang backend** (§1 "Tanpa backend", §12 "Jangan … menambah backend"). Tahap B0 memperbarui CLAUDE.md lebih dulu (lihat §6).

## 4. Keputusan yang dikunci

Butir bertanda *(diputuskan pengguna)* berasal dari diskusi 21 Okt 2026. Selebihnya **keputusan Claude** yang dikunci di sini agar tidak berubah di tengah jalan; pengguna dapat mengubahnya saat meninjau dokumen ini.

### 4.1 Struktur repositori

```
simario2/
  backend/
    pyproject.toml, uv.lock
    manage.py
    config/            settings/{base,local,test,production}.py, urls.py, celery.py
    simario/
      core/            clock, errors (ApiError), pagination, camelCase, permissions DRF, base models
      domain/          aturan murni Python (tanpa ORM), padanan frontend/src/domain/rules/*
      accounts/ org/ calendar/ reference/ registers/ board/ assessments/
      sheets/ notifications/ audit/ insights/ imports/ home/ devtools/
    tests/             pytest (API, service, paritas)
  frontend/            (yang sudah ada)
  shared/
    test-vectors/      vektor uji JSON untuk aturan yang ada di dua sisi (§4.9)
  infra/
    keycloak/          realm-export.json (realm lokal "otorita-ikn")
    nginx/             konfigurasi produksi
  docker-compose.yml           lokal
  docker-compose.prod.yml      produksi (dengan nginx), belum dipakai
  .env.example
```

- App Django mengikuti tabel [01_backend.md §3](../../01_backend.md#3-struktur-aplikasi-django-usulan), ditambah `core` dan `devtools`. Setiap app: `models.py`, `services.py` (mutasi + audit + notifikasi dalam transaksi), `selectors.py` (read model per pembaca, tempat VIS diterapkan), `serializers.py`, `views.py`, `urls.py`, `tasks.py` bila ada tugas.
- View tipis: validasi masukan → panggil service/selector → serializer. Aturan bisnis tidak ditulis di view atau serializer.

### 4.2 Model data dan identitas

- Entitas mengikuti PRD §2.8.1 (snake_case) dengan **semua kolom "Saran" di [01_backend.md §4.2](../../01_backend.md#42-perbedaan-bentuk-yang-harus-diputuskan-saat-membangun-backend) dianggap diputuskan**, termasuk: `objective_enabled` di `DataUmumForm`; `Position.short_name`, `deactivated_at`, `deactivation_reason`; tabel `Mention`, `MonitoringSupport`, `PrintPhotoSelection`, `ImportJob`; `RiskQuarter.no_step_flag` tersimpan; `Assessment.updated_at`; `Notification.event_key` unik per (`user_id`, `event_key`); `ScoreBandVersion.status` dengan `scheduled`; kolom `impact`/`likelihood`/`score` di `RegisterRisk` nullable.
- Invarian basis data sesuai [01_backend.md §4.3](../../01_backend.md#43-invarian-yang-harus-dijaga-di-basis-data); `AuditLog` dijaga trigger PostgreSQL yang menolak UPDATE dan DELETE (migrasi `RunSQL`).
- **Primary key: UUID** dibuat server. Frontend tidak mengasumsikan format ID.
- **Seed demo memakai UUID deterministik**: `uuid5(NAMESPACE_SIMARIO, "<id prototipe>")` (mis. dari `usr-andi`), sehingga data contoh, tautan demo, dan vektor uji stabil antar-reset.
- Kunci alami tetap unik: `RiskTemplate.code` / `MitigationTemplate.code` (mis. `PPK-T4-FR-03`), `User.nip`, `Position.code` per unit kerja, `Permission.code` 1–26.
- `AuditLog.acting_as`: enum `pejabat | operator | superadmin | pengelola | sistem` + null (padanan `Capacity | 'superadmin' | 'pengelola' | 'sistem' | null` di `domain/types.ts`; nilai `Capacity` diambil dari tipe itu).
- **Zona waktu: Asia/Makassar (WITA)** untuk semua aturan tanggal (tenggat, H-1, keterlambatan, hari kerja). Disimpan `timestamptz`; API mengirim ISO 8601 dengan offset (`2027-04-06T09:00:00+08:00`); tanggal murni (`date`) dikirim `YYYY-MM-DD`. Menutup R-06.

### 4.3 API

- Prefix **`/api/v1/`**. JSON camelCase (`djangorestframework-camel-case`); Python snake_case.
- **Read model berbentuk layar**: endpoint baca mengembalikan bentuk yang sama dengan tipe view prototipe (`RegisterView`, `BoardView`, `ThreadView`, `AssessmentView`, `QueueView`, `HistoryView`, `HomeView`, `SheetView`, dan seterusnya), sudah difilter untuk pembaca. Halaman tidak perlu ditulis ulang, hanya sumber datanya.
- Endpoint mengikuti kolom "Usulan REST" di `03_api_contract.md` §3–§5; usulan itu **menjadi keputusan**. Penyesuaian kecil (nama path) boleh dilakukan saat membangun selama dicatat di `03_api_contract.md` pada komit yang sama.
- **Galat**: badan `{ "code": "...", "message": "...", "details": ... }` dengan `code` dan `message` persis seperti tabel `03_api_contract.md` §2.1 (teks Bahasa Indonesia siap tampil); status HTTP sesuai kolom "Usulan HTTP". Satu exception handler DRF di `core/errors.py`.
- Paginasi nomor halaman: bawaan 25 baris; komentar 50 (PRD §2.4).
- **Kontrak tipe**: `drf-spectacular` menghasilkan OpenAPI 3; `openapi-typescript` menulis `frontend/src/data/http/schema.d.ts`. Skrip `npm run api:types` dan pemeriksaan di `npm run lint` bahwa berkas itu mutakhir terhadap skema yang dihasilkan backend.
- Skor numerik tidak pernah dikirim ke tampilan pengguna (PRD v2.8), kecuali endpoint skala penilaian, ekspor CSV metrik, dan impor.
- Polling utas 30 detik: `GET /api/v1/register-risks/{id}/thread?since=<ISO>` (NFR-015).

### 4.4 Autentikasi dan sesi

- **Sesi cookie Django (BFF)**, cookie `httpOnly`, `SameSite=Lax`; token OIDC tidak pernah sampai ke browser.
- **OIDC** lewat `mozilla-django-oidc` dengan backend kustom yang **mencocokkan pengguna lewat klaim NIP** dan **tidak pernah membuat akun** (FR-AUT-001, RB-AUT-003). NIP tidak dikenal → pesan "belum terdaftar" persis PRD + audit `masuk_ditolak_belum_terdaftar`.
- Semua parameter Keycloak dari variabel lingkungan: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_NIP_CLAIM` (bawaan `nip`), `OIDC_REDIRECT_URI`. **Pindah ke `sso.ikn.go.id` = mengganti `.env`** *(diputuskan pengguna: siap diintegrasikan nanti)*.
- **Keycloak lokal** di Docker Compose dengan realm `otorita-ikn` dari `infra/keycloak/realm-export.json`: client `simario`, atribut pengguna `nip` dipetakan ke klaim `nip`, seluruh persona seed dengan kata sandi demo.
- **Akun lokal** tetap ada (FR-AUT-002): kata sandi di-hash (`make_password`), kunci 5× gagal / 15 menit disimpan di basis data per NIP, ganti kata sandi wajib (FR-AUT-003/004), atur ulang oleh Superadmin (FR-AUT-005).
- **Batas tidak aktif 60 menit** (NFR-008): `SESSION_COOKIE_AGE=3600` + `SESSION_SAVE_EVERY_REQUEST`. API mengembalikan 401 `unauthenticated` → frontend ke `/login?alasan=sesi-berakhir`.
- **Pembatalan sesi saat peran/izin/holding/delegasi berubah** (FR-AUT-008, U-04): kolom `User.auth_epoch` dinaikkan oleh service terkait; middleware membandingkan dengan nilai di sesi.
- CSRF Django: cookie `csrftoken`, header `X-CSRFToken` dari klien.
- Di lokal, Vite mem-proxy `/api` dan `/oidc` ke Django agar satu origin (cookie dan CSRF tanpa CORS). Di produksi nginx melayani SPA dan mem-proxy `/api`.

### 4.5 Jam simulasi dan alat dev

- Satu fungsi `simario.core.clock.now()` dipakai semua aturan; tidak ada `timezone.now()` di service, selector, atau aturan.
- **Lokal**: jam simulasi **global** disimpan di tabel singleton `DevClock` (waktu simulasi + waktu nyata saat disetel; berjalan mengikuti waktu nyata, seperti `state/clock.ts`). Global, bukan per sesi, karena tugas terjadwal dan data bersama harus melihat satu waktu yang sama.
- **Produksi**: `now()` selalu waktu nyata; tabel dan endpoint dev tidak aktif (`settings.SIMARIO_DEV_TOOLS = False`).
- **Staging**: `SIMARIO_DEV_TOOLS` diatur lewat `.env`. **Mati selama uji coba PPK** (pengguna sungguhan, jam nyata, tanpa data contoh). **Boleh dinyalakan untuk UAT** bila skenario perlu menggeser tanggal. Jam tetap global, sehingga semua penguji UAT melihat tanggal yang sama *(keputusan Claude; mengganti usulan "override per sesi di staging" di `01_backend.md`, yang diperbarui di B0)*.
- App `devtools` (hanya bila `SIMARIO_DEV_TOOLS`): `POST /api/v1/dev/clock` (setel jam + jalankan semua tugas terjadwal secara sinkron), `POST /api/v1/dev/impersonate` (masuk sebagai persona, padanan pemilih persona dan `?sebagai=`), `POST /api/v1/dev/reset` (muat ulang seed demo, opsional `asOf` = padanan "Sesuaikan data ke tanggal ini"), `POST /api/v1/dev/fail-next` dan latensi buatan untuk menguji skeleton dan galat.
- DevPanel frontend tetap ada di build dev dan memanggil endpoint ini; tidak dibundel di build produksi.

### 4.6 Data awal

- `python manage.py seed_reference` — idempoten, untuk semua lingkungan: 26 izin, 5 peran bawaan + izin default, jenis jabatan, tahap, template (4 / 14 / 146 / 302 dari berkas Rapim), formulir Data Umum, pita skor + pilihan penilaian. **Hanya membuat yang belum ada; tidak pernah menimpa** data referensi yang sudah ada *(keputusan Claude)*. Setelah ada data, perubahan referensi (termasuk kalimat pilihan penilaian yang masih draf, R-P3) dilakukan lewat aplikasi: versi skala baru, sunting template, dan seterusnya, sehingga tidak retroaktif (§2.8.3).
- `python manage.py seed_demo [--as-of <ISO>]` — seluruh data contoh prototipe (pengguna, jabatan, holding, register, komentar, penilaian, hasil, notifikasi, audit, snapshot) dengan UUID deterministik; **ditolak bila `SIMARIO_DEV_TOOLS` mati**. Persona contoh tetap ada di lokal *(diputuskan pengguna)*.
- Sumber seed demo: diporting dari `frontend/src/data/seed/*` ke fixture Python atau JSON di `backend/simario/devtools/seed/`. Hasilnya harus sama dengan prototipe (jumlah per koleksi dan nilai kunci diuji).
- Data resmi pengguna dan jabatan untuk uji coba dimuat lewat fitur impor CSV yang sudah ada (`/pengaturan/impor`, FR-ADM-013).

### 4.7 Berkas dan lampiran

- Unggah **multipart lewat Django** (bukan unggah langsung ke storage), agar ukuran, jumlah, ekstensi, dan **MIME dari isi** (`python-magic`) diperiksa di server (NFR-009) sebelum disimpan.
- Penyimpanan `django-storages` (S3) ke RustFS, bucket privat `simario`; kunci `attachments/<position_id>/<fiscal_year>/<uuid>`; berkas SK/surat di `decrees/…`. Hanya API S3 standar.
- Pemindaian malware oleh antivirus VM di luar aplikasi (NFR-010, PRD v2.9.2). `Attachment` tidak punya status pindai; berkas dapat diunduh begitu tersimpan. *(Revisi 22 Okt 2026, pengguna: semula task Celery `attachment_scan` ke `clamd` dengan karantina.)*
- Unduh: `GET /api/v1/attachments/{id}/download` memeriksa cakupan baca + VIS-3/4, lalu **302 ke URL pre-signed 5 menit** (NFR-011). URL itu memakai path `/storage/…` di origin aplikasi, bukan alamat RustFS: di lokal Vite mem-proxy `/storage` ke RustFS, di produksi nginx. **RustFS tidak pernah terbuka langsung ke browser**, sehingga tidak bergantung pada kebijakan jaringan OIKN *(keputusan Claude)*. Gambar di Lembar dan utas memakai endpoint yang sama (placeholder prototipe diganti gambar asli).
- Kuota 1 GB per jabatan Lini 1 per TA (NFR-012) dihitung dari jumlah `Attachment.size` di PostgreSQL.

### 4.8 Tugas terjadwal

- Setiap tugas di [01_backend.md §5](../../01_backend.md#5-tugas-terjadwal) menjadi fungsi service `run_<nama>(as_of)` yang **idempoten dan aman bila jam melompat jauh**, dibungkus task Celery dengan nama yang sama (`risk_quarters`, `score_bands`, `comparisons`, `reminders`, `sheet_freeze`, `calendar`, `delegations`).
- Celery Beat menjalankan `run_all(clock.now())` **setiap 15 menit**.
- Pemicu event sama seperti prototipe, ditambah yang tercatat sebagai utang U-07: `comparisons` setelah Tuntaskan dan kecualikan penilai; `risk_quarters` setelah terbit; `sheet_freeze` setelah Kirim Penjelasan dan saat hasil terlambat terbuka.
- Di lokal, `POST /dev/clock` menjalankan `run_all` secara sinkron sebelum menjawab.

### 4.9 Aturan bisnis di dua sisi

- Aturan murni ditulis ulang di `backend/simario/domain/` (fungsi Python tanpa ORM), satu modul per berkas di `frontend/src/domain/rules/` dan `domain/calendar.ts`, `domain/scoreBands.ts`, `domain/permissions.ts`.
- **Vektor uji bersama** di `shared/test-vectors/<aturan>.json` (masukan + keluaran yang diharapkan), dibuat dari kasus di `*.test.ts`. Vitest dan pytest sama-sama membacanya. Wajib untuk: pita skor/predikat, perbandingan, keterlambatan dan hari kerja, akses (izin tiga lapis), visibilitas VIS-1…9, celah register, Lembar Mutu, Berulang.
- Setelah perpindahan, frontend **hanya menyimpan** aturan untuk umpan balik instan: predikat dari pita saat memilih kalimat, daftar celah sebelum terbit, batas berkas di Composer. Server selalu memeriksa ulang. Aturan lain dihapus dari frontend beserta vektornya di sisi Vitest.
- Uji API khusus **INV-16 (buta) dan INV-17 (konfidensial)** wajib lulus sebelum tahap penilaian dinyatakan selesai (PRD Lampiran E).

### 4.10 Frontend

- `frontend/src/data/http/`: `client.ts` (`fetch`, `credentials: 'same-origin'`, header CSRF, pemetaan badan galat ke `ApiError` yang sama, 401 → sesi berakhir) dan satu berkas per namespace dengan **tanda tangan metode yang sama** dengan `repository.ts`.
- Perpindahan **per namespace mengikuti urutan tahap**: `repository.ts` mengganti impor dari implementasi lokal ke HTTP untuk namespace yang tahapnya selesai. Tanpa flag `VITE_DATA_SOURCE` (tidak diperlukan karena mode lokal akan dihapus). Selama transisi, namespace yang belum pindah tetap lokal; ketidaksinkronan data antara keduanya diterima di lokal.
- **Gerbang modul sementara** *(keputusan Claude)*: satu daftar modul yang sudah pindah (`frontend/src/data/http/migrated.ts`). Rute dan menu modul yang belum pindah disembunyikan bila `VITE_HIDE_UNMIGRATED=true` (dipakai untuk build uji coba), sehingga pengguna sungguhan tidak melihat data contoh lokal. Endpoint baca notifikasi (lonceng) masuk B1 dan Beranda versi sementara (kartu dari modul yang sudah pindah) masuk B4. Gerbang dihapus di B9.
- Halaman yang kini membaca store langsung (24 berkas, U-01) dipindah ke metode baca repository + `useQuery` di tahap modulnya. `useAuth()` membaca `GET /api/v1/me`.
- Tahap terakhir menghapus `data/local/`, `data/seed/`, `data/db.ts`, pemakaian `localStorage` untuk data (preferensi pindah ke `preferenceApi` server), `netlify.toml`, dan tipe yang digantikan `schema.d.ts`. `state/clock.ts` hanya menampilkan jam dari server (`GET /api/v1/me` menyertakan `serverNow`).
- Uji Vitest berbasis store lokal (`flow.test.ts`, `readAccess.test.ts`, `assessment.test.ts`, `thread.test.ts`, `sheets.test.ts`, `register.test.ts`, `master.test.ts`, `admin.test.ts`, `home.test.ts`, `scheduler.test.ts`, `seed.test.ts`) **diporting menjadi uji pytest** sebelum dihapus. Uji komponen dan UI tetap di Vitest.

### 4.11 Lingkungan

- `docker-compose.yml` (lokal): `db` (postgres:16), `redis` (7), `api` (Django, `runserver`), `worker` dan `beat` (Celery), `storage` (RustFS), `keycloak` (26, `start-dev --import-realm`). Frontend tetap `npm run dev` di host (HMR cepat) dengan proxy ke `api`. Nginx tidak dipakai di lokal *(diputuskan pengguna: lokal dulu)*.
- `docker-compose.prod.yml` + `infra/nginx/`: gunicorn, nginx (SPA statis + proxy `/api` dan `/storage`), HTTPS, tanpa Keycloak lokal. Satu berkas untuk **staging dan produksi**; perbedaannya hanya `.env` (`DJANGO_SETTINGS_MODULE=config.settings.staging|production`, `SIMARIO_DEV_TOOLS`, domain, rahasia, parameter OIDC). Disiapkan dan diuji jalan di lokal pada **B4**, sebelum uji coba.
- **Masuk di staging** *(keputusan Claude)*: akun lokal (FR-AUT-002) untuk PPK uji coba, dibuat lewat impor CSV atau Tambah Pengguna. OIDC aktif bila `OIDC_*` diisi (Keycloak OIKN, bila aksesnya sudah ada). Keycloak lokal tidak disebarkan ke staging.
- **Migrasi basis data**: karena uji coba sekali pakai, migrasi boleh dirombak atau digabung (`squash`) sampai B9. Sejak B9, migrasi hanya maju. Staging di-reset (basis data + bucket) bila migrasi dirombak.
- `.env.example` mendaftar semua variabel; rahasia tidak dikomit.
- Uji backend memakai PostgreSQL sungguhan (bukan SQLite) lewat compose.
- Perintah: `docker compose up`, `docker compose exec api python manage.py seed_reference|seed_demo`, `uv run pytest`, `uv run ruff check`, `uv run mypy`. Skrip pembungkus di `backend/Makefile` atau `justfile` (pilihan pembangun).

## 5. Pemeriksaan izin dan visibilitas

- Pemeriksaan tiga lapis (RB-ADM-001) diporting dari `domain/rules/access.ts` ke `simario/domain/access.py`: izin (kode 1–26 + cakupan) → holding/penugasan/aturan lini pada **jabatan yang bertindak** (INV-25, selalu parameter eksplisit) → Pejabat/Pengisi untuk tindakan akhir (INV-12, INV-24). Tidak pernah memeriksa nama peran (RB-ADM-002).
- Setiap endpoint baca ruang kerja jabatan memeriksa cakupan baca dengan aturan `canReadPosition` (termasuk Lini 2 dibatasi TA penugasannya); `findByNumber` menjawab `not_found` di luar cakupan.
- VIS-1…9 diterapkan di `selectors.py`, bukan di serializer generik atau frontend. Acuan perilaku: tabel `03_api_contract.md` §6.

## 6. Tahapan

Mengikuti aturan checkpoint CLAUDE.md §9: setiap tahap berakhir dengan laporan, `build`/`test`/`lint` frontend **dan** `pytest`/`ruff`/`mypy` backend lulus, komit `feat: … (checkpoint Bn)`, lalu menunggu persetujuan pengguna. Tahap B0 menambahkan bagian "Tahapan Backend" berisi daftar ini ke CLAUDE.md.

| Tahap | Isi | Hasil yang bisa dicoba |
|---|---|---|
| **B0 — Kerangka** | Perbarui CLAUDE.md (§1, §3, §4, §10, §12 untuk backend; tahap B0–B9). `backend/` (uv, Django, settings, `core`), `docker-compose.yml` dengan semua layanan, realm Keycloak lokal, pipeline OpenAPI → `schema.d.ts`, `shared/test-vectors/`, pytest/ruff/mypy | `docker compose up` sehat; `/api/v1/schema/` tampil |
| **B1 — Fondasi** | Model `accounts`, `org`, `calendar`, `reference`, `audit` (+ trigger), `notifications`; izin 1–26; `domain/access.py` + vektor; sesi, OIDC Keycloak lokal, akun lokal, lockout, `auth_epoch`; `GET /me`; jam + `devtools`; `seed_reference`, `seed_demo`. Frontend: `client.ts`, `authApi`, `useAuth` → `/me`, Sidebar/Topbar/Workspace, DevPanel | Masuk lewat Keycloak lokal dan akun lokal sebagai Andi, Siti, Hendra, Admin DKB; menu sesuai; geser jam |
| **B2 — Master & Administrasi** | MST (jabatan, tahap, template, usulan, Data Umum, skala + pilihan) dan ADM (pengguna, peran, penugasan, TA/kuartal/arsip, jabatan saya, impor CSV + `ImportJob`) | Skenario uji Tahap 3 dan 9 prototipe; impor CSV pengguna & jabatan |
| **B3 — Register** | REG penuh (`registerApi.view` sebagai read model tunggal, terbit, salin, tambahan, nonaktif), `RiskProposal`, `risk_quarters` | Skenario uji Tahap 4 prototipe |
| **B4 — Papan, Utas, Lampiran** | PPN penuh, polling 30 detik, RustFS + ClamAV + karantina + pre-signed, kuota (ClamAV dihapus 22 Okt 2026) | Skenario uji Tahap 5; berkas EICAR dikarantina (tidak berlaku lagi) |
| **B4s — Staging** | `config/settings/staging.py`, `docker-compose.prod.yml` + nginx + HTTPS diuji di lokal, panduan penyebaran staging (`docs/05_…`), build frontend uji coba dengan gerbang modul, daftar kebutuhan server staging | Aplikasi jalan dari konfigurasi produksi di lokal. **Titik uji coba PPK** (lihat §7) |
| **B5 — Penilaian** | NIL penuh, `comparisons`, Berulang, penjelasan, tampilan buta, antrean; uji INV-16/17 | Skenario uji Tahap 6 |
| **B6 — Riwayat, Notifikasi, Beranda** | RWY, NTF (semua event + `reminders`), BRD, `/jabatan`, `/pantauan` | Skenario uji Tahap 7 |
| **B7 — Lembar & Cetak** | LBR, snapshot, nomor, `sheet_freeze`, foto asli | Skenario uji Tahap 8 |
| **B8 — Metrik & Jejak Audit** | `insights` (metrik + CSV), audit dengan redaksi VIS-8 dan nilai asli (izin 24) | Skenario uji Tahap 9 (metrik, audit) |
| **B9 — Pemutusan mode lokal & kesiapan** | Hapus mode lokal (§4.10) dan gerbang modul; migrasi digabung lalu dibekukan (hanya maju); skrip cadangan & pemulihan PostgreSQL + bucket (NFR-014) diuji; daftar kebutuhan ke tim infrastruktur OIKN (client Keycloak, redirect URI, klaim NIP, HTTPS, server, storage); perbarui `docs/00–06`, PRD §2.1 (RustFS, bila pengguna setuju), `frontend/README.md` | Alur penuh TW I dari pengisian sampai cetak Lembar tanpa kode lokal; uji pemulihan dari cadangan |

## 7. Titik uji coba dan kesiapan

- **Uji coba PPK di staging** *(diputuskan pengguna)* dapat dimulai setelah B4s: masuk, register, papan dan utas, lampiran berjalan di backend dengan data resmi hasil impor; modul yang belum pindah disembunyikan (§4.10). **Datanya sekali pakai** *(diputuskan pengguna)*: tidak dipindah ke produksi.
- **UAT di staging** setelah B9 (semua modul di backend, mode lokal dihapus). Staging di-reset bersih sebelum UAT.
- **Produksi dimulai bersih**: `seed_reference` + impor CSV data resmi; tanpa `seed_demo`.
- **TW I 2027**: B0–B4s harus siap sebelum register PPK disusun (target Desember 2026); B5 sebelum 1 Jan 2027 (jendela Lini 3); B7 sebelum perbandingan TW I terbuka (± 3 Apr 2027). Penyebaran ke server OIKN di luar proyek ini dan bergantung pada akses dari OIKN.

## 8. Risiko yang dibawa

- R-09 kematangan RustFS — mitigasi di §4.7 (API S3 standar saja) dan uji integrasi penyimpanan di B4.
- Paritas aturan TS ↔ Python — mitigasi vektor uji bersama (§4.9).
- Jadwal TW I ketat untuk satu pengembang — mitigasi: urutan tahap mengikuti kalender, titik uji coba setelah B4.
- Data tidak sinkron selama transisi (namespace lokal vs HTTP) — diterima di lokal; uji coba hanya memakai modul yang sudah pindah.

## 9. Diserahkan ke pembangun / dibiarkan terbuka

Hal di bawah boleh diputuskan saat membangun tanpa mengubah keputusan §4; catat di dokumen `docs/` terkait:

- Versi patch persis setiap paket dan image (dikunci di `uv.lock`, `package-lock.json`, dan tag image).
- Nama path REST yang disesuaikan dari usulan `03_api_contract.md`.
- Nama dan struktur fixture seed demo di backend.
- `Makefile` atau `justfile`.
- Bentuk persis tabel lockout dan `DevClock`.
- Layanan S3 pengganti bila RustFS gagal uji integrasi (perlu persetujuan pengguna sebelum diganti).

Belum diputuskan dan di luar proyek ini: server dan alamat staging serta produksi OIKN, akses `sso.ikn.go.id`, retensi arsip (OQ-8), OQ-3, OQ-12.
