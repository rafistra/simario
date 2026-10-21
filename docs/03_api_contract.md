# 03 — Kontrak API

> Status dokumen: 21 Okt 2026 · PRD v2.9 · kode per checkpoint B2.

## 1. Status dan cakupan

**API HTTP dibangun per tahap (spec integrasi backend).** Sejak B2, `authApi`, `notificationApi`, `masterApi` (kecuali usulan risiko, B3), `adminApi`, `calendarApi`, dan `importApi`, `registerApi` (B3), `boardApi`, dan `threadApi` (B4) memanggil Django lewat `frontend/src/data/http/`; namespace lain masih lokal. Kontrak yang berlaku adalah antarmuka TypeScript di `frontend/src/data/repository.ts`: kumpulan namespace `*Api` yang asinkron (mengembalikan `Promise`) dan diimplementasikan di browser (`frontend/src/data/api/*.ts`, `frontend/src/data/local/*`). Halaman memanggil namespace ini, bukan `localStorage`.

Dokumen ini mencatat:

1. kontrak yang **sudah ada** (nama metode, masukan, keluaran, pemeriksaan izin, efek samping) — inilah yang harus dipenuhi backend agar frontend dapat dipindahkan dengan mengganti implementasi namespace saja;
2. **usulan** pemetaan ke endpoint REST Django (belum diputuskan; tandai bila disetujui);
3. **celah**: data yang saat ini dibaca halaman langsung dari store, sehingga belum punya metode baca di repository.

## 2. Konvensi

| Hal | Ketentuan sekarang | Catatan untuk REST |
|---|---|---|
| Pemanggilan | Semua metode melewati `call()` (`data/local/call.ts`): latensi simulasi 150–400 ms, mode luring, "gagalkan panggilan berikutnya" | Diganti `fetch`; DevPanel hanya di build dev |
| Pengecualian sinkron | `preferenceApi.get/set`, `threadApi.markSeen`, `importApi.template`, `importApi.kindsFor`, `boardApi.quarterLabel` tidak lewat `call()` | Jadikan asinkron saat dipindah |
| Identitas aktor | Diambil dari sesi (`useSession().userId`), tidak dikirim sebagai parameter | Dari token/sesi server |
| Jabatan yang bertindak | Parameter eksplisit untuk tindakan konten (`positionId`, `assessorPositionId`, `RegisterKey.positionId`) | Tetap eksplisit (INV-25) |
| Waktu | `now()` dari jam simulasi; `ISODate` = `YYYY-MM-DD`, `ISODateTime` = `YYYY-MM-DDTHH:mm` **tanpa zona waktu** | Kirim ISO 8601 dengan zona; server yang menentukan waktu |
| Nama field | camelCase (TypeScript) | Django snake_case → konversi di serializer atau middleware camelCase |
| ID | String berawalan (`usr-andi`, `pos-ppk-a1`, `q-2027-1`, `rq-…`, `aud-…`, `ntf-…`) dibuat klien | ID dibuat server (UUID/serial); frontend tidak boleh mengasumsikan format |
| Skor | `Assessment.score` 0–4 hanya untuk master skala, CSV metrik, impor; tampilan menerima `optionLabel` + `predicate` (PRD v2.8) | Serializer penilaian tidak mengirim `score` ke tampilan pengguna |
| Efek samping | Mutasi menulis `AuditLog` dan `Notification` dalam transaksi yang sama | Sama |

### 2.1 Galat

Semua galat dilempar sebagai `ApiError(code, message, details?)`. `message` adalah salinan teks Bahasa Indonesia yang siap ditampilkan (banyak dikutip dari PRD); `details` opsional (mis. daftar celah atau baris impor bermasalah).

**Backend (diputuskan, B0):** setiap jawaban galat di bawah `/api/` berbadan `{"code", "message", "details"}` dengan status HTTP dari kolom "HTTP" di bawah (`simario/core/errors.py`: `ApiError`, `STATUS_BY_CODE`, `api_exception_handler`; `ApiErrorMiddleware` untuk path tak dikenal dan galat tak tertangani). Komponen skema OpenAPI: `ApiError`. Pesan bawaan bila service tidak memberi pesan sendiri: `unauthenticated` "Sesi Anda berakhir. Silakan masuk kembali.", `forbidden` "Anda tidak memiliki akses untuk tindakan ini." (keduanya dari prototipe), `not_found` "Data tidak ditemukan.", `validation` "Isian belum valid." (`details` = galat per isian, camelCase), `server` "Terjadi kesalahan pada server. Silakan coba lagi." (500; detail galat hanya di log).

**Paginasi (diputuskan, B0):** `?page=n`; badan `{"results": [...], "page", "pageSize", "total"}`; 25 baris, komentar 50 (`simario/core/pagination.py`). Prefix `/api/v1/`, **tanpa garis miring di akhir** (`APPEND_SLASH = False`; varian bergaris miring dijawab 404 `not_found`), JSON camelCase dua arah.

| `code` | Arti | HTTP |
|---|---|---|
| `unauthenticated` | Tidak ada sesi ("Sesi Anda berakhir. Silakan masuk kembali.") | 401 |
| `forbidden` | Izin, holding, Pejabat/Pengisi, atau partisipasi tidak terpenuhi | 403 |
| `not_found` | Objek tidak ada / tidak terlihat | 404 |
| `validation` | Isian tidak valid; `details` per isian | 422 |
| `archived` | TA sudah diarsipkan (INV-21) | 409 |
| `locked`, `final`, `sent`, `excluded`, `not_started` | Objek beku/dikunci, sudah dituntaskan/dikirim, penilai dikecualikan, jendela belum dibuka | 409 |
| `occupied`, `type_in_use` | Jabatan sudah berpejabat (pakai Alih Pejabat); jenis jabatan masih dipakai | 409 |
| `nothing`, `empty` | Tidak ada yang dapat diproses (mis. tidak ada baris siap) | 409 / 422 |
| `bands_invalid`, `options_invalid` | Pita skor bercelah/bertumpuk; pilihan penilaian tidak lengkap (INV-3, INV-26) | 422 |
| `errors` | Impor masih punya baris bermasalah; `details` = daftar baris | 422 |
| `old_password`, `too_short`, `same`, `not_local` | Ganti kata sandi | 422 |
| `server` | Galat tak tertangani di server; prototipe: simulasi DevPanel | 500 |
| `offline` | Simulasi jaringan (DevPanel) | — (galat jaringan, dibuat klien) |

Tampilan: galat baca → `InlineAlert` merah + "Coba Lagi"; galat tulis → toast atau daftar celah (PRD §2.4).

## 3. Konteks pengguna (diputuskan, B1)

Halaman mendapatkan pengguna, holding, izin + cakupan, tampilan peran, dan triwulan berjalan dari `useAuth()` (`state/useAuth.ts`), yang kini dibangun dari `GET /api/v1/me` (`state/me.ts`, `useMe`). Jabatan aktif dan tampilan peran tetap dipilih di klien.

| Endpoint | Isi | Sumber logika (backend) |
|---|---|---|
| `GET /api/v1/me` | `user` (`id`, `nip`, `email`, `fullName`, `isLocalAccount`, `mustChangePassword`, `orgUnitId`), `serverNow` (ISO + offset), `today`, `devTools`, `holdings[]` (`kind`, `id`, `positionId`, `capacity`, `line`, `isFiller`, `position` berbentuk `Position`, `unitCode`, `officialName`, `roleView`), `activePositionId`, `permissions[]` (`{code, scope}`), `roleViews` (urut PMR, PMT, PJM, PMD, SAD), `currentQuarter` (`Quarter` atau null). Komponen skema `Me` | `accounts/selectors.py` `build_me` → `simario/domain/access.py` |
| `PUT /api/v1/me/active-position` | `{positionId}` → 204; jabatan yang tidak dipegang → 403 `forbidden` (FR-AUT-009) | `User.last_position` |

## 4. Namespace

Kolom **Izin**: kode FR-ADM-002. "Konten(n)" = `checkAction(n)`: izin + holding pada jabatan yang bertindak + Pejabat/Pengisi bila `requiresOfficial` + aturan Pengisi untuk izin drafting pada Pokja (INV-12/24/25). "Partisipasi" = izin 6 + holding/penugasan Lini 2 triwulan itu/holding Lini 3 (§1.5).

### 4.1 `authApi` — Autentikasi (AUT)

| Metode | Masukan | Keluaran | Izin | Efek samping | PRD | Usulan REST |
|---|---|---|---|---|---|---|
| `signInSso` | `nip` | `{ok, userId}` / `{ok:false, message}` | — | Audit `masuk_ditolak_belum_terdaftar` bila NIP tak dikenal | FR-AUT-001 | Alur OIDC Keycloak + `POST /api/auth/oidc/callback` |
| `signInLocal` | `nip, password` | sama | — | Lockout 5×/15 menit | FR-AUT-002 | `POST /api/auth/login` |
| `changePassword` | `userId, {oldPassword?, newPassword}` | `void` | Akun lokal | Audit `ganti_kata_sandi` (tanpa nilai) | FR-AUT-003/004 | `POST /api/auth/password` |
| `signOut` | — | `void` | — | — | — | `POST /api/auth/logout` |

**Diputuskan (B1):** `GET /api/v1/auth/config` → `{devTools, oidcEnabled}` dan memasang cookie CSRF; `POST /api/v1/auth/login` → `{ok, userId}` atau galat `login_failed` (401, "NIP atau kata sandi tidak sesuai" / "Akun Anda tidak aktif. Hubungi Superadmin.") dan `locked_out` (423, pesan kunci prototipe); `POST /api/v1/auth/password` → 204 atau `not_local`/`old_password`/`too_short`/`same` (422), menaikkan `auth_epoch` (sesi lain berakhir); `POST /api/v1/auth/logout` → 204. SSO: peramban ke `/oidc/authenticate/?next=…` (mozilla-django-oidc, Keycloak), kembali lewat `/oidc/callback/`; penolakan diarahkan ke `/login?alasan=belum-terdaftar|tidak-aktif|sso-gagal`. Klien hanya mengalihkan ke `/login?alasan=sesi-berakhir` untuk 401 `unauthenticated`. `signInSso` di frontend kini berarti masuk sebagai persona (pengembangan): `POST /api/v1/dev/impersonate {nip}`.

**Alat pengembangan (B1, hanya bila `SIMARIO_DEV_TOOLS`; selain itu 404):** `GET /api/v1/dev/personas`, `POST /api/v1/dev/impersonate {nip}`, `POST /api/v1/dev/clock {at}` → `{serverNow, ran}` (menjalankan tugas terjadwal), `POST /api/v1/dev/reset {asOf?}` → `{counts}` (memuat ulang data demo dan mengakhiri sesi pemanggil).

### 4.2 `notificationApi`, `preferenceApi` — Notifikasi & preferensi (NTF)

| Metode | Masukan | Keluaran | Catatan | PRD | Usulan REST |
|---|---|---|---|---|---|
| `notificationApi.list` | `userId` | `Notification[]` terbaru dulu | **HTTP (B1)**; lonceng, panel, dan `/notifikasi` memakai satu store (`state/notifications.ts`) | FR-NTF-013/014 | `GET /api/v1/notifications?page=` (milik sendiri, terbaru dulu; filter jenis/status di klien) |
| `notificationApi.markRead` | `id` | `void` | **HTTP (B1)**; milik orang lain → 404 | FR-NTF-013 | `POST /api/v1/notifications/{id}/read` |
| `notificationApi.markAllRead` | `userId` | `void` | **HTTP (B1)** | FR-NTF-013 | `POST /api/v1/notifications/read-all` |
| `preferenceApi.get/set` | `userId, key[, value]` | nilai | Sinkron; filter papan per jabatan, sidebar diciutkan, pilihan foto (`userId='*'`) | FR-PPN-001, FR-LBR-005 | `GET/PUT /api/preferences/{key}` |

### 4.3 `masterApi` — Master Data (MST) — diputuskan, B2

| Metode | Masukan | Izin | PRD | REST (`/api/v1`) |
|---|---|---|---|---|
| `setPositionTypeActive` | `typeId, active` | 17 | FR-MST-008 | `PATCH /position-types/{id}` |
| `savePosition` | `PositionInput {positionTypeId, code, name, orgUnitId, identity}`, `id?` | 18 | FR-MST-009, INV-2 | `POST /positions`, `PUT /positions/{id}` |
| `deactivatePosition` / `reactivatePosition` | `positionId[, reason]` | 18 | FR-MST-009 | `POST /positions/{id}/deactivate` · `/reactivate` |
| `addStage`, `renameStage`, `setStageActive`, `deleteStage` | per tahap | 15 | FR-MST-001 | `POST/PATCH/DELETE /stages[/{id}]` |
| `reorderStages` | `positionTypeId, orderedIds[]` | 15 | FR-MST-001 | `PUT /position-types/{id}/stage-order` |
| `saveTemplate` | `{positionTypeId, stageId, riskType, description, mitigations[]}`, `id?`, `fromProposalId?` | 12 (+13 bila dari usulan) | FR-MST-003, 005 | `POST /risk-templates`, `PUT /risk-templates/{id}`; dari usulan: `POST /proposals/{id}/accept` (B3) |
| `setTemplateActive`, `deleteTemplate` | `templateId` | 12 | FR-MST-004 | `PATCH/DELETE /risk-templates/{id}` |
| `rejectProposal` | `proposalId, reason` | 13 | FR-MST-005 | `POST /proposals/{id}/reject` (B3); daftar: `GET /proposals` (baris + konteks risiko sumber) |
| `saveDataUmumForm` | `positionTypeId, defaultObjective, fields[], objectiveEnabled` | 16 | FR-MST-006 (versi baru) | `POST /position-types/{id}/data-umum-forms` |
| `createBandDraft`, `updateBandDraft`, `saveBandVersion`, `discardBandDraft` | versi, pita, pilihan, tanggal berlaku | 14 | FR-MST-007, INV-3, INV-26 | `POST/PUT/DELETE /score-band-versions[/{id}]`, `POST …/{id}/schedule` |
| `updateActiveGuidance`, `updateOptionLabel` | teks panduan / kalimat versi aktif | 14 | FR-MST-007 | `PATCH /score-bands/{predicate}`, `PATCH /score-options/{id}` |

Baca: `GET /collections/<nama>` (baris berbentuk tipe `domain/types.ts`, untuk pengguna yang masuk; `core/collections.py`), `GET /risk-templates/usage?fiscalYear=` (`{templateId: jumlah}`), `GET /positions/{id}/impact`. Pemakaian oleh register dijawab stub nol sampai B3 (U-21). Semua mutasi master menulis audit dengan aksi yang sama seperti prototipe. Belum ada metode **tambah/ubah jenis jabatan** ("Tambah Jenis", FR-MST-008) — lihat [04_risk_and_debt.md](04_risk_and_debt.md).

### 4.4 `registerApi` — Register (REG) — diputuskan, B3

`RegisterKey = {positionId, fiscalYear}`; register dibuat otomatis saat penulisan pertama (audit `buat_register`).

| Metode | Masukan | Izin | Efek samping | PRD | REST (`/api/v1`) |
|---|---|---|---|---|---|
| `view` | `key` | Cakupan baca (§5) | Baca saja. `RegisterView`: `register` (null bila belum ada, atau bagi pembaca bila belum pernah terbit), `unpublishedForReader`, `access`, `stages` (risiko + mitigasi per sub-bagian, terfilter per pembaca), `risks`, `pending` (hanya pemegang jabatan), `gaps` (hanya yang boleh menyusun) | FR-REG-001, 002, 012 | `GET /registers/{pos}/{ta}` (+ `previousRegister`, `stagesDone`, `flagged`) |
| `toggleTemplateRisk` | `key, templateId, selected` | Konten(2) | Status kembali `draft` bila `ready` | FR-REG-003 | `PUT /registers/{pos}/{ta}/template-risks/{tplId}` `{selected}` |
| `addCustomRisk` | `key, stageId, riskType, description` | Konten(2) | `isCustom = true` | FR-REG-004 | `POST /registers/{pos}/{ta}/risks` → `{id}` |
| `deleteRisk` | `riskId` | Konten(2) | Hanya draf | FR-REG-011 | `DELETE /register-risks/{id}` |
| `toggleTemplateMitigation`, `addCustomMitigation`, `deleteMitigation` | risiko/mitigasi | Konten(2) | | FR-REG-003, 011 | `PUT /register-risks/{id}/template-mitigations/{tplId}` `{selected}`, `POST /register-risks/{id}/mitigations` `{text}`, `DELETE /register-mitigations/{id}` |
| `setDeclaration`, `setDeclarationReason` | `key, stageId, riskType (null = seluruh tahap), on/reason, force?` | Konten(2) | `force` menghapus pilihan yang bertentangan setelah konfirmasi | FR-REG-002, 005, 008 | `PUT /registers/{pos}/{ta}/declarations` `{stageId, riskType, on, force}`; alasan: `PATCH` yang sama `{stageId, riskType, reason}` |
| `updateDataUmum` | `key, Partial<DataUmumValues>` | Konten(2) | Diaudit, juga setelah terbit | FR-REG-001 | `PATCH /registers/{pos}/{ta}` (Data Umum) |
| `markReady` | `key` | Konten(2) (tombolnya hanya untuk Operator) | `draft` → `ready`; galat `empty`/`nothing`; notifikasi Pejabat (FR-NTF-001) | FR-REG-006 | `POST …/mark-ready` |
| `publish` | `key` | Konten(3) — Pejabat | Gerbang struktural → `ApiError('validation', details: gaps)`; flag `no_mitigation`; `RiskQuarter` dibuat; `RiskProposal` untuk risiko sendiri; notifikasi Lini 2 (FR-NTF-002); mengembalikan `PublishSummary` | FR-REG-007, 008 | `POST …/publish` |
| `deactivateRisk`, `deactivateMitigation` | `id, reason` | Konten(3) | `deactivatedFromQuarterId` = triwulan berikut (TW IV: null) | FR-REG-010 | `POST /register-risks/{id}/deactivate`, `POST /register-mitigations/{id}/deactivate` |
| `copyFromPrevious` | `key` | Konten(2) | Hanya bila register kosong; mengembalikan `CopySummary` | FR-REG-009 | `POST …/copy-from-previous` |

Backend: `simario/registers/selectors.py` (`build_register_view`), `services.py`, aturan murni `simario/domain/register.py` + vektor `shared/test-vectors/register.json`. Halaman Register membaca view lewat `useRegisterViews` (`data/http/register.ts`); setiap mutasi memuat ulang view. Prototipe: read model di `data/api/registerView.ts`: `buildRegisterView` (dipakai `registerApi.view` dan, secara sinkron, oleh halaman Register), `registerAccess`, `pendingItems`, `wouldFlagNoMitigation`. Halaman juga memakai `registerGaps`, `completeStages` (`domain/rules/register.ts`).

### 4.5 `boardApi`, `threadApi` — Papan & Utas (PPN) — diputuskan, B4

| Metode | Masukan | Keluaran / efek | Izin | PRD | REST (`/v1`) |
|---|---|---|---|---|---|
| `boardApi.board` | `positionId, fiscalYear` | `BoardView` (kelompok tahap › jenis, `BoardRow` dengan hitungan per lini, chip predikat terbuka, penanda, titik aktivitas) | Cakupan baca (§5) | FR-PPN-001 | `GET /positions/{pos}/board/{ta}` |
| `boardApi.thread` | `riskId` | `ThreadView` (header, kelompok per TW, sub-utas mitigasi, panel `QuarterCard` VIS-1/2, info partisipasi, panduan fase buta) | idem | FR-PPN-002 | `GET /register-risks/{id}/thread`; polling 30 detik: `?since=` → `{comments, latestAt}`; peserta @sebut: `GET /register-risks/{id}/participants?quarterId=` |
| `threadApi.post` | `PostInput {riskId, mitigationId, body, quarterId?, isStep, files[], mentionUserIds[]}` | Komentar + lampiran `pending`; berlangganan; notifikasi sebut & komentar baru | Partisipasi; Langkah hanya Lini 1 & triwulan berjalan | FR-PPN-003…007, RB-PPN-004 | `POST /register-risks/{id}/comments` (multipart: bagian `data` JSON + `files`; `confidential[]` sejajar urutan berkas) |
| `threadApi.edit` | `commentId, body` | "(disunting)" | Penulis, ≤ 15 menit | FR-PPN-008, INV-19 | `PATCH /comments/{id}` |
| `threadApi.withdraw` | `commentId` | Isi asli hanya di audit | Penulis | FR-PPN-008, VIS-6 | `POST /comments/{id}/withdraw` |
| `threadApi.setConfidential` | `attachmentId, on` | Diaudit | Menyalakan: pengunggah Lini 3; mematikan: izin 25 | FR-PPN-006 | `PATCH /attachments/{id}` |
| `threadApi.follow` | `riskId, on` | | Pemegang jabatan tidak bisa berhenti | FR-PPN-010 | `PUT`/`DELETE /register-risks/{id}/subscription` |
| `threadApi.markSeen` | `riskId` | Sinkron, tidak diaudit | — | FR-PPN-001 | `POST /register-risks/{id}/seen` |

Lampiran (spec §4.7): isi diperiksa di server (ekstensi, ukuran ≤ 20 MB, ≤ 10 berkas, MIME dari isi lewat `puremagic`), disimpan di RustFS `attachments/<pos>/<ta>/<uuid>`, kuota 1 GB per jabatan per TA (galat `quota`, 413). Unduh: `GET /attachments/{id}/download` → 302 ke URL pre-signed 5 menit di `/storage/…`; berkas `pending`/`quarantined`, konfidensial tanpa izin 10, atau di luar cakupan baca → 404. Lampiran demo tanpa isi diunduh sebagai berkas contoh.

### 4.6 `assessmentApi` — Penilaian (NIL) — diputuskan, B5

| Metode | Masukan | Keluaran / efek | Izin | PRD | REST (`/v1`) |
|---|---|---|---|---|---|
| `page` | `positionId, fiscalYear, tw, blind?` | `AssessmentView` (strip header, `RowView` per risiko, `CellView` per kolom sesuai VIS-1/2/5/9, `ExplanationView`); draf penjelasan hanya untuk pemegang Lini 1; `blind=true` hanya untuk izin 24 dan setiap pemuatan dicatat `lihat_penilaian_sebelum_dibuka` | Cakupan baca (§5) | FR-NIL-001, 012 | `GET /positions/{pos}/assessments/{ta}/{tw}[?blind=1]` |
| `finalisePreview` | `positionId, fiscalYear, tw, assessorPositionId` | `FinalisePreview {toFinalise, unscored, noEvidence[], missingReason[]}` untuk dialog Tuntaskan | Konten(4/8) pada jabatan penilai; Lini 1 hanya jabatan pemilik risiko | FR-NIL-003 | `GET /positions/{pos}/assessments/{ta}/{tw}/finalise-preview?assessorPositionId=` |
| `queue` | `quarterId` (null = bawaan) | `QueueView` antrean Lini 3 | Direktorat dari holding Lini 3 | FR-NIL-010 | `GET /assessment-queue[?quarterId=]` |
| `saveCell` | `rqId, assessorPositionId, CellPatch {score?, notRelevant?, notRelevantReason?, note?}` | Autosave; `ready` → `draft`; skor di luar pilihan ditolak "Pilihan penilaian tidak dikenal." | Konten(4) Lini 1 / Konten(8) Lini 3; dalam jendela; belum beku (`frozen`, 409) | FR-NIL-002, 005, INV-18 | `PATCH /risk-quarters/{rq}/assessments/{pos}` |
| `addFiles`, `removeFile` | `rqId, assessorPositionId, NewFile[]` / `attachmentId` | Multipart seperti komentar (`files` + `data` = `{confidential: [...]}`); RustFS + ClamAV; Lini 3 konfidensial bawaan; kuota bersama | idem | NFR-009, VIS-4 | `POST /risk-quarters/{rq}/assessments/{pos}/files`, `DELETE /assessment-files/{id}` |
| `markReady` | `lini1PositionId, quarterId, assessorPositionId` | Baris draf berskor → `ready`; `{count}`; notifikasi Pejabat | Konten(4/8) | FR-NIL-003, 006 | `POST /positions/{pos}/quarters/{q}/assessments/{a}/ready` |
| `finalise` | idem | Menuntaskan baris berskor/"Belum relevan" saja; `no_evidence`; keterlambatan dipatok; `run_comparisons` untuk baris itu | Konten(5/9) — Pejabat | FR-NIL-003, 006 | `POST …/finalise` |
| `reopen` | `assessmentId` | Selama hasil belum dibuka | Konten(5/9) | FR-NIL-004 | `POST /assessments/{id}/reopen` |
| `saveExplanation`, `markExplanationsReady`, `sendExplanations` | `resultId` + `{reason?, plan?}` / `lini1PositionId, resultIds[]` | Kirim: kekal (INV-23), keterlambatan, notifikasi Lini 2/3 (FR-NTF-010); siap diaudit pada entitas Position | Konten(4) / Konten(5) | FR-NIL-008 | `PATCH /results/{id}/explanation`, `POST /positions/{pos}/explanations/ready`, `POST /positions/{pos}/explanations/send` |
| `logBlindView` | `positionId, quarterId` | Tanpa panggilan (server mencatat saat `GET …?blind=1`) | 24 | FR-NIL-012 | — |

Baris penilaian dan perbandingan dikunci per `RiskQuarter` (`select_for_update`) pada setiap mutasi dan pada `run_comparisons`, sehingga dua direktorat yang menuntaskan bersamaan membuka setiap hasil sekali.

### 4.7 `historyApi`, `homeApi`, `sheetApi` — Riwayat, Beranda, Lembar (RWY, BRD, LBR) — `historyApi` dan `homeApi` diputuskan, B6

`historyApi.history`, `sheetApi.view`, dan `sheetApi.print` memeriksa cakupan baca (§5); `homeApi` hanya mengembalikan jabatan dalam cakupan.

| Metode | Masukan | Keluaran | PRD | Usulan REST |
|---|---|---|---|---|
| `historyApi.history` | `positionId, fiscalYear` | `HistoryView` (Lembar Mutu per TW, `HistoryRow` × TW, lintas tahun per `lineageId`) | FR-RWY-001…006 | `GET /v1/positions/{pos}/history/{ta}` (B6) |
| `homeApi.home` | `activePositionId` (boleh null) | `HomeView` (kartu per FR-BRD-010) | FR-BRD-001…010 | `GET /v1/home[?position=]` (B6) |
| `homeApi.positions` | — | `PositionListRow[]` dalam cakupan | FR-BRD-011 | `GET /v1/my-positions` (B6) |
| `sheetApi.view` | `positionId, fiscalYear, tw, snapshotId` (null = tampilan berjalan) | `SheetView` (payload berjalan atau salinan beku, tersamar per VIS-9, daftar versi) | FR-LBR-001…005, 010 | `GET /api/positions/{pos}/sheets/{ta}/{tw}?snapshot=` |
| `sheetApi.setPhotos` | `positionId, quarterId, section, attachmentIds[]` (≤ 5) | `void` | FR-LBR-005 | `PUT …/sheets/{ta}/{tw}/photos/{section}` |
| `sheetApi.print` | `positionId, fiscalYear, tw, kinds[]` | Snapshot baru `trigger=print` (sementara bila belum ada versi otomatis) | FR-LBR-006 | `POST …/sheets/{ta}/{tw}/print` |
| `sheetApi.findByNumber` | `number` | `{id, positionId, fiscalYear, tw, kind}` | FR-LBR-010 | `GET /api/snapshots?number=` |

### 4.8 `adminApi`, `calendarApi`, `importApi`, `insightsApi` — Administrasi (ADM) — diputuskan B2, kecuali `insightsApi` (B8)

| Metode | Izin | PRD | REST (`/api/v1`) |
|---|---|---|---|
| `adminApi.addUser`, `reactivateUser`, `deactivateUser` | 21 | FR-ADM-004 | `POST /users` (→ `{id, temporaryPassword}` sekali), `POST /users/{id}/deactivate` · `/reactivate` |
| `adminApi.setManualRoles` | 22 | US-ADM-002 | `PUT /users/{id}/roles` |
| `adminApi.assignPosition` (`AssignInput`) | 21 | FR-ADM-004 | `POST /occupancies` |
| `adminApi.replaceOfficial` (`ReplaceInput`) | 21 | FR-ADM-005 | `POST /positions/{id}/replace-official` |
| `adminApi.moveFiller` | 21 | FR-ADM-005 | `POST /positions/{id}/filler` |
| `adminApi.resetPassword` | 21 | FR-AUT-005 | `POST /users/{id}/reset-password` |
| `adminApi.addRole`, `deleteRole`, `setPermission` | 22 | FR-ADM-001…003, 009 | `POST/DELETE /roles`, `PUT /roles/{id}/permissions/{code}` |
| `adminApi.addAssignments`, `removeAssignment` | 20 | FR-ADM-006, INV-14 | `POST/DELETE /monitoring-assignments` |
| `adminApi.searchStaff` | pengguna masuk | OQ-11 | `GET /staff?q=` (Keycloak Admin REST, service account `simario`; 503 "Pencarian pegawai belum tersedia.") |
| `adminApi.appointOperator`, `revokeOperator` | Konten(11) — Pejabat | FR-ADM-010, FR-NTF-011 | `POST /positions/{id}/delegates`, `POST /delegates/{id}/revoke`; kartu: `GET /me/positions` |
| `calendarApi.createFiscalYear`, `updateFiscalYear`, `updateQuarter(…, confirmPastDeadline)` | 19 | FR-ADM-007, INV-9 | `POST /fiscal-years`, `PATCH /fiscal-years/{y}`, `PATCH /quarters/{id}` |
| `calendarApi.excludeAssessor` | 19 | §2.5 | `POST /quarters/{id}/assessors/{pos}/exclude` |
| `calendarApi.archiveManually` | 26 | §2.5 | `POST /fiscal-years/{y}/archive`; `GET /fiscal-years/{y}/archive-status` (19/26) |
| `importApi.template`, `dryRun`, `apply`, `history`, `kindsFor` | 18 / 21 / 20 per jenis | FR-ADM-013 | `GET /imports/templates/{kind}` (CSV), `GET /imports/kinds`, `POST /imports` (dry run → `ImportJob`), `POST /imports/{id}/commit` (cek ulang; galat → 422 `errors`), `GET /imports` |
| `insightsApi.metrics(year)` | 22 | FR-ADM-011 | usulan `GET /metrics?ta=` (+ `?format=csv`) |
| `insightsApi.audit(filter, original)` | 23 (+24 untuk nilai asli) | FR-ADM-008, VIS-8 | usulan `GET /audit?…&original=1` |
| `insightsApi.logShowOriginal` | 24 | FR-ADM-008 | dicatat server |

Mutasi yang mengubah holding, peran, atau delegasi menaikkan `auth_epoch` pengguna terkait (FR-AUT-008): sesi mereka berakhir pada permintaan berikutnya (`401 unauthenticated`). Frontend memuat ulang koleksi yang berubah dan `/me` setelah mutasi.

## 5. Celah kontrak: data yang dibaca langsung dari store

Prinsip CLAUDE.md §4 ("halaman tidak pernah menyentuh `localStorage` langsung") terpenuhi, tetapi 24 berkas di `pages/`, `layout/`, dan `components/` (ditambah `state/useAuth.ts`) **membaca** store (`useDb`/`getDb` dari `@/data/local/store`) secara sinkron untuk daftar dan pilihan. Di backend, setiap baris di bawah perlu endpoint baca. `DataGate` (`components/DataGate`) hanya menyimulasikan satu panggilan agar skeleton/galat tetap tampil.

| Berkas | Data yang dibaca | Usulan endpoint |
|---|---|---|
| `layout/Sidebar.tsx`, `layout/Topbar.tsx`, `layout/Workspace.tsx` | Jabatan dalam cakupan dan pencarian global (konteks pengguna sudah dari `GET /api/v1/me`, B1) | `GET /api/positions/{id}`, `GET /api/search?q=` |
| `pages/register/*` | **B3:** view dari `GET /api/v1/registers/{pos}/{ta}`; data master lewat `CollectionGate` | — |
| `pages/master/*` | **B2/B3:** koleksi master dari backend lewat `CollectionGate`; usulan dari `GET /api/v1/proposals`. Petunjuk pemakaian register ("Dipakai N jabatan", "dapat dihapus", dampak nonaktif) masih dihitung dari store lokal (U-22) | `GET /api/v1/risk-templates/usage`, `/positions/{id}/impact` |
| `pages/admin/*` | **B2:** Pengguna, Peran, Penugasan, Tahun Anggaran, Jabatan Saya, Impor dari koleksi backend lewat `CollectionGate`; status arsip masih dihitung dari penilaian lokal (B5); Audit dan Metrik lokal (B8) | `GET /api/v1/audit`, `/metrics` (B8) |
| `pages/board/*` | **B4:** papan dan utas dari backend; peserta @sebut dari `GET …/participants` | — |
| `pages/assessment/AssessmentPage.tsx` | `finalisePreview` | `GET …/finalise-preview` |
| `pages/sheets/SheetPage.tsx` | Snapshot yang baru dibuat `sheetApi.print`, lalu `maskPayloadFor` | `sheetApi.print` mengembalikan payload tersamar, bukan hanya ID |
| `pages/auth/LoginPage.tsx` | Daftar persona, `staffDirectory` | Dihapus di produksi (Keycloak) |

**Cakupan baca (izin 1).** Setiap read model ruang kerja jabatan memeriksa cakupan sendiri lewat `assertCanRead` (`data/local/actor.ts`) → `canReadPosition` (`domain/rules/access.ts`): pemegang jabatan apa pun, atau cakupan izin 1 yang mencakup jabatan itu **untuk TA yang dilihat** (Lini 2: TA penugasannya). Berlaku untuk `boardApi.board`, `boardApi.thread`, `assessmentApi.page`, `historyApi.history`, `sheetApi.view`, `sheetApi.print`, dan `registerApi.view`; di luar cakupan → `forbidden`. `sheetApi.findByNumber` menjawab `not_found` untuk nomor di luar cakupan agar tidak membocorkan keberadaannya. `layout/Workspace.tsx` memakai aturan yang sama hanya untuk menampilkan halaman 403. Di backend, setiap endpoint baca **wajib** memeriksa cakupan dengan aturan yang sama (acuan uji: `data/api/readAccess.test.ts`).

## 6. Aturan visibilitas yang menjadi bagian kontrak

Keluaran read model sudah difilter; backend harus menghasilkan keluaran yang sama untuk pembaca yang sama. Acuan uji: `domain/rules/visibility.test.ts`, `data/api/assessment.test.ts`, `data/api/thread.test.ts`, `data/api/sheets.test.ts`.

| Aturan | Diterapkan di (prototipe) |
|---|---|
| VIS-1/2/5/9 buta & direktorat terlambat | `domain/rules/visibility.ts` dipakai `buildAssessment`, `buildThread`, `buildHistory`, `buildHome`, notifikasi di `local/comparisons.ts` |
| VIS-3/4 lampiran konfidensial | `canSeeAttachment`; tampilan "[n] lampiran konfidensial" |
| VIS-6 komentar ditarik | `buildThread` mengirim `body = null` |
| VIS-7 tampilan turunan netral-pembaca | `buildSheetPayload` (`domain/rules/sheetPayload.ts`), `lembarMutu` |
| VIS-8 redaksi audit | `redact` di `api/insights.ts` (`[disamarkan]`, `[konfidensial]`) |
| VIS-9 penyamaran snapshot | `maskPayloadFor` |
| Skor tidak ditampilkan (v2.8) | `toDisplay` mengganti `score` dengan `optionLabel` |
