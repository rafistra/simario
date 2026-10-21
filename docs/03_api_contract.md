# 03 — Kontrak API

> Status dokumen: 21 Okt 2026 · PRD v2.9 · kode `frontend/` per komit `7bebb66`.

## 1. Status dan cakupan

**Belum ada API HTTP.** Kontrak yang berlaku hari ini adalah antarmuka TypeScript di `frontend/src/data/repository.ts`: kumpulan namespace `*Api` yang asinkron (mengembalikan `Promise`) dan diimplementasikan di browser (`frontend/src/data/api/*.ts`, `frontend/src/data/local/*`). Halaman memanggil namespace ini, bukan `localStorage`.

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

## 3. Konteks pengguna (belum ada di repository)

Halaman mendapatkan pengguna, holding, izin + cakupan, tampilan peran, dan triwulan berjalan dari `useAuth()` (`state/useAuth.ts`), yang menghitungnya langsung dari seluruh basis data lokal. Backend perlu satu endpoint:

| Usulan | Isi | Sumber logika |
|---|---|---|
| `GET /api/me` | `user`, `holdings[]` (jabatan, lini, kapasitas Pejabat/Operator, `isFiller`), `permissions` (kode → cakupan), `roleViews`, `currentQuarter`, nama Pejabat untuk "Dilakukan oleh [Nama Pejabat]" | `buildAuthContext`, `holdingsOf`, `permissionScopes`, `finalisingOfficial` |
| `PUT /api/me/active-position` | Jabatan terakhir dipakai (FR-AUT-009) | `useSession.setActivePosition` (sekarang di browser) |

## 4. Namespace

Kolom **Izin**: kode FR-ADM-002. "Konten(n)" = `checkAction(n)`: izin + holding pada jabatan yang bertindak + Pejabat/Pengisi bila `requiresOfficial` + aturan Pengisi untuk izin drafting pada Pokja (INV-12/24/25). "Partisipasi" = izin 6 + holding/penugasan Lini 2 triwulan itu/holding Lini 3 (§1.5).

### 4.1 `authApi` — Autentikasi (AUT)

| Metode | Masukan | Keluaran | Izin | Efek samping | PRD | Usulan REST |
|---|---|---|---|---|---|---|
| `signInSso` | `nip` | `{ok, userId}` / `{ok:false, message}` | — | Audit `masuk_ditolak_belum_terdaftar` bila NIP tak dikenal | FR-AUT-001 | Alur OIDC Keycloak + `POST /api/auth/oidc/callback` |
| `signInLocal` | `nip, password` | sama | — | Lockout 5×/15 menit | FR-AUT-002 | `POST /api/auth/login` |
| `changePassword` | `userId, {oldPassword?, newPassword}` | `void` | Akun lokal | Audit `ganti_kata_sandi` (tanpa nilai) | FR-AUT-003/004 | `POST /api/auth/password` |
| `signOut` | — | `void` | — | — | — | `POST /api/auth/logout` |

### 4.2 `notificationApi`, `preferenceApi` — Notifikasi & preferensi (NTF)

| Metode | Masukan | Keluaran | Catatan | PRD | Usulan REST |
|---|---|---|---|---|---|
| `notificationApi.list` | `userId` | `Notification[]` terbaru dulu | Panel & `/notifikasi` saat ini membaca store langsung (lihat §5) | FR-NTF-013/014 | `GET /api/notifications?kind=&read=&page=` |
| `notificationApi.markRead` | `id` | `void` | | FR-NTF-013 | `POST /api/notifications/{id}/read` |
| `notificationApi.markAllRead` | `userId` | `void` | | FR-NTF-013 | `POST /api/notifications/read-all` |
| `preferenceApi.get/set` | `userId, key[, value]` | nilai | Sinkron; filter papan per jabatan, sidebar diciutkan, pilihan foto (`userId='*'`) | FR-PPN-001, FR-LBR-005 | `GET/PUT /api/preferences/{key}` |

### 4.3 `masterApi` — Master Data (MST)

| Metode | Masukan | Izin | PRD | Usulan REST |
|---|---|---|---|---|
| `setPositionTypeActive` | `typeId, active` | 17 | FR-MST-008 | `PATCH /api/position-types/{id}` |
| `savePosition` | `PositionInput {positionTypeId, code, name, orgUnitId, identity}`, `id?` | 18 | FR-MST-009, INV-2 | `POST /api/positions`, `PUT /api/positions/{id}` |
| `deactivatePosition` / `reactivatePosition` | `positionId[, reason]` | 18 | FR-MST-009 | `POST /api/positions/{id}/deactivate` · `/reactivate` |
| `addStage`, `renameStage`, `setStageActive`, `deleteStage` | per tahap | 15 | FR-MST-001 | `POST/PATCH/DELETE /api/stages[/{id}]` |
| `reorderStages` | `positionTypeId, orderedIds[]` | 15 | FR-MST-001 | `PUT /api/position-types/{id}/stage-order` |
| `saveTemplate` | `{positionTypeId, stageId, riskType, description, mitigations[]}`, `id?`, `fromProposalId?` | 12 (+13 bila dari usulan) | FR-MST-003, 005 | `POST/PUT /api/risk-templates`; `POST /api/proposals/{id}/accept` |
| `setTemplateActive`, `deleteTemplate` | `templateId` | 12 | FR-MST-004 | `PATCH/DELETE /api/risk-templates/{id}` |
| `rejectProposal` | `proposalId, reason` | 13 | FR-MST-005 | `POST /api/proposals/{id}/reject` |
| `saveDataUmumForm` | `positionTypeId, defaultObjective, fields[], objectiveEnabled` | 16 | FR-MST-006 (versi baru) | `POST /api/position-types/{id}/data-umum-forms` |
| `createBandDraft`, `updateBandDraft`, `saveBandVersion`, `discardBandDraft` | versi, pita, pilihan, tanggal berlaku | 14 | FR-MST-007, INV-3, INV-26 | `POST/PUT/DELETE /api/score-band-versions[/{id}]`, `POST …/{id}/schedule` |
| `updateActiveGuidance`, `updateOptionLabel` | teks panduan / kalimat versi aktif | 14 | FR-MST-007 | `PATCH /api/score-bands/{predicate}`, `PATCH /api/score-options/{id}` |

Semua mutasi master menulis audit. Belum ada metode **tambah/ubah jenis jabatan** ("Tambah Jenis", FR-MST-008) — lihat [04_risk_and_debt.md](04_risk_and_debt.md).

### 4.4 `registerApi` — Register (REG)

`RegisterKey = {positionId, fiscalYear}`; register dibuat otomatis saat penulisan pertama (audit `buat_register`).

| Metode | Masukan | Izin | Efek samping | PRD | Usulan REST |
|---|---|---|---|---|---|
| `view` | `key` | Cakupan baca (§5) | Baca saja. `RegisterView`: `register` (null bila belum ada, atau bagi pembaca bila belum pernah terbit), `unpublishedForReader`, `access`, `stages` (risiko + mitigasi per sub-bagian, terfilter per pembaca), `risks`, `pending` (hanya pemegang jabatan), `gaps` (hanya yang boleh menyusun) | FR-REG-001, 002, 012 | `GET /api/registers/{pos}/{ta}` |
| `toggleTemplateRisk` | `key, templateId, selected` | Konten(2) | Status kembali `draft` bila `ready` | FR-REG-003 | `POST/DELETE /api/registers/{pos}/{ta}/risks` |
| `addCustomRisk` | `key, stageId, riskType, description` | Konten(2) | `isCustom = true` | FR-REG-004 | `POST …/risks` |
| `deleteRisk` | `riskId` | Konten(2) | Hanya draf | FR-REG-011 | `DELETE /api/register-risks/{id}` |
| `toggleTemplateMitigation`, `addCustomMitigation`, `deleteMitigation` | risiko/mitigasi | Konten(2) | | FR-REG-003, 011 | `…/register-risks/{id}/mitigations` |
| `setDeclaration`, `setDeclarationReason` | `key, stageId, riskType (null = seluruh tahap), on/reason, force?` | Konten(2) | `force` menghapus pilihan yang bertentangan setelah konfirmasi | FR-REG-002, 005, 008 | `PUT /api/registers/{pos}/{ta}/declarations` |
| `updateDataUmum` | `key, Partial<DataUmumValues>` | Konten(2) | Diaudit, juga setelah terbit | FR-REG-001 | `PATCH /api/registers/{pos}/{ta}` |
| `markReady` | `key` | Konten(2) (tombolnya hanya untuk Operator) | `draft` → `ready`; galat `empty`/`nothing`; notifikasi Pejabat (FR-NTF-001) | FR-REG-006 | `POST …/mark-ready` |
| `publish` | `key` | Konten(3) — Pejabat | Gerbang struktural → `ApiError('validation', details: gaps)`; flag `no_mitigation`; `RiskQuarter` dibuat; `RiskProposal` untuk risiko sendiri; notifikasi Lini 2 (FR-NTF-002); mengembalikan `PublishSummary` | FR-REG-007, 008 | `POST …/publish` |
| `deactivateRisk`, `deactivateMitigation` | `id, reason` | Konten(3) | `deactivatedFromQuarterId` = triwulan berikut (TW IV: null) | FR-REG-010 | `POST /api/register-risks/{id}/deactivate` |
| `copyFromPrevious` | `key` | Konten(2) | Hanya bila register kosong; mengembalikan `CopySummary` | FR-REG-009 | `POST …/copy-from-previous` |

Read model dan fungsi bantunya ada di `data/api/registerView.ts`: `buildRegisterView` (dipakai `registerApi.view` dan, secara sinkron, oleh halaman Register), `registerAccess`, `pendingItems`, `wouldFlagNoMitigation`. Halaman juga memakai `registerGaps`, `completeStages` (`domain/rules/register.ts`).

### 4.5 `boardApi`, `threadApi` — Papan & Utas (PPN)

| Metode | Masukan | Keluaran / efek | Izin | PRD | Usulan REST |
|---|---|---|---|---|---|
| `boardApi.board` | `positionId, fiscalYear` | `BoardView` (kelompok tahap › jenis, `BoardRow` dengan hitungan per lini, chip predikat terbuka, penanda, titik aktivitas) | Cakupan baca (§5) | FR-PPN-001 | `GET /api/positions/{pos}/board/{ta}` |
| `boardApi.thread` | `riskId` | `ThreadView` (header, kelompok per TW, sub-utas mitigasi, panel `QuarterCard` VIS-1/2, info partisipasi, panduan fase buta) | idem | FR-PPN-002 | `GET /api/register-risks/{id}/thread` |
| `threadApi.post` | `PostInput {riskId, mitigationId, body, quarterId?, isStep, files[], mentionUserIds[]}` | Komentar + lampiran `pending`; berlangganan; notifikasi sebut & komentar baru | Partisipasi; Langkah hanya Lini 1 & triwulan berjalan | FR-PPN-003…007, RB-PPN-004 | `POST /api/register-risks/{id}/comments` (multipart) |
| `threadApi.edit` | `commentId, body` | "(disunting)" | Penulis, ≤ 15 menit | FR-PPN-008, INV-19 | `PATCH /api/comments/{id}` |
| `threadApi.withdraw` | `commentId` | Isi asli hanya di audit | Penulis | FR-PPN-008, VIS-6 | `POST /api/comments/{id}/withdraw` |
| `threadApi.setConfidential` | `attachmentId, on` | Diaudit | Menyalakan: pengunggah Lini 3; mematikan: izin 25 | FR-PPN-006 | `PATCH /api/attachments/{id}` |
| `threadApi.follow` | `riskId, on` | | Pemegang jabatan tidak bisa berhenti | FR-PPN-010 | `PUT/DELETE /api/register-risks/{id}/subscription` |
| `threadApi.markSeen` | `riskId` | Sinkron, tidak diaudit | — | FR-PPN-001 | `POST /api/register-risks/{id}/seen` |

### 4.6 `assessmentApi` — Penilaian (NIL)

| Metode | Masukan | Keluaran / efek | Izin | PRD | Usulan REST |
|---|---|---|---|---|---|
| `page` | `positionId, fiscalYear, tw, blind?` | `AssessmentView` (strip header, `RowView` per risiko, `CellView` per kolom sesuai VIS-1/2/5/9, `ExplanationView`) ; `blind=true` hanya untuk izin 24 | Cakupan baca (§5) | FR-NIL-001, 012 | `GET /api/positions/{pos}/assessments/{ta}/{tw}` |
| `queue` | `quarterId` (null = bawaan) | `QueueView` antrean Lini 3 | Rute dijaga izin 8; direktorat dari holding Lini 3 | FR-NIL-010 | `GET /api/assessment-queue?quarter=` |
| `saveCell` | `rqId, assessorPositionId, CellPatch {score?, notRelevant?, notRelevantReason?, note?}` | Autosave; `ready` → `draft`; skor di luar pilihan ditolak "Pilihan penilaian tidak dikenal." | Konten(4) Lini 1 / Konten(8) Lini 3; dalam jendela; belum beku | FR-NIL-002, 005, INV-18 | `PUT /api/risk-quarters/{rq}/assessments/{pos}` |
| `addFiles`, `removeFile` | `rqId, assessorPositionId, NewFile[]` / `attachmentId` | Lampiran Lini 3 konfidensial bawaan | idem | NFR-009, VIS-4 | `POST/DELETE …/attachments` |
| `markReady` | `lini1PositionId, quarterId, assessorPositionId` | Baris draf berskor → `ready`; mengembalikan jumlah baris; notifikasi Pejabat | Konten(4/8) (tombolnya hanya untuk Operator) | FR-NIL-003, 006 | `POST …/mark-ready` |
| `finalise` | idem | Menuntaskan baris berskor/"Belum relevan" saja; `no_evidence`; keterlambatan dipatok; `runComparisons` | Konten(5/9) — Pejabat | FR-NIL-003, 006 | `POST …/finalise` |
| `reopen` | `assessmentId` | Selama hasil belum dibuka | Konten(5/9) | FR-NIL-004 | `POST /api/assessments/{id}/reopen` |
| `saveExplanation`, `markExplanationsReady`, `sendExplanations` | `resultId(s)`, `{reason, plan}` | Kirim: kekal (INV-23), keterlambatan, notifikasi Lini 2/3 (FR-NTF-010) | Konten(4) / Konten(5) | FR-NIL-008 | `PATCH /api/comparison-results/{id}/explanation`, `POST …/send` |
| `logBlindView` | `positionId, quarterId` | Audit setiap tampilan buta | 24 | FR-NIL-012 | dicatat server saat `GET …?blind=1` |

Fungsi bantu di halaman: `finalisePreview(getDb(), …)` untuk dialog ringkasan — perlu endpoint `GET …/finalise-preview`.

### 4.7 `historyApi`, `homeApi`, `sheetApi` — Riwayat, Beranda, Lembar (RWY, BRD, LBR)

`historyApi.history`, `sheetApi.view`, dan `sheetApi.print` memeriksa cakupan baca (§5); `homeApi` hanya mengembalikan jabatan dalam cakupan.

| Metode | Masukan | Keluaran | PRD | Usulan REST |
|---|---|---|---|---|
| `historyApi.history` | `positionId, fiscalYear` | `HistoryView` (Lembar Mutu per TW, `HistoryRow` × TW, lintas tahun per `lineageId`) | FR-RWY-001…006 | `GET /api/positions/{pos}/history?ta=` |
| `homeApi.home` | `activePositionId` (boleh null) | `HomeView` (kartu per FR-BRD-010) | FR-BRD-001…010 | `GET /api/home?position=` |
| `homeApi.positions` | — | `PositionListRow[]` dalam cakupan | FR-BRD-011 | `GET /api/positions?scope=` |
| `sheetApi.view` | `positionId, fiscalYear, tw, snapshotId` (null = tampilan berjalan) | `SheetView` (payload berjalan atau salinan beku, tersamar per VIS-9, daftar versi) | FR-LBR-001…005, 010 | `GET /api/positions/{pos}/sheets/{ta}/{tw}?snapshot=` |
| `sheetApi.setPhotos` | `positionId, quarterId, section, attachmentIds[]` (≤ 5) | `void` | FR-LBR-005 | `PUT …/sheets/{ta}/{tw}/photos/{section}` |
| `sheetApi.print` | `positionId, fiscalYear, tw, kinds[]` | Snapshot baru `trigger=print` (sementara bila belum ada versi otomatis) | FR-LBR-006 | `POST …/sheets/{ta}/{tw}/print` |
| `sheetApi.findByNumber` | `number` | `{id, positionId, fiscalYear, tw, kind}` | FR-LBR-010 | `GET /api/snapshots?number=` |

### 4.8 `adminApi`, `calendarApi`, `importApi`, `insightsApi` — Administrasi (ADM)

| Metode | Izin | PRD | Usulan REST |
|---|---|---|---|
| `adminApi.addUser`, `reactivateUser`, `deactivateUser` | 21 | FR-ADM-004 | `POST /api/users`, `POST /api/users/{id}/(de)activate` |
| `adminApi.setManualRoles` | 22 | US-ADM-002 | `PUT /api/users/{id}/roles` |
| `adminApi.assignPosition` (`AssignInput`) | 21 | FR-ADM-004 | `POST /api/occupancies` |
| `adminApi.replaceOfficial` (`ReplaceInput`) | 21 | FR-ADM-005 | `POST /api/positions/{id}/replace-official` |
| `adminApi.moveFiller` | 21 | FR-ADM-005 | `POST /api/positions/{id}/filler` |
| `adminApi.resetPassword` | 21 | FR-AUT-005 | `POST /api/users/{id}/reset-password` |
| `adminApi.addRole`, `deleteRole`, `setPermission` | 22 | FR-ADM-001…003, 009 | `POST/DELETE /api/roles`, `PUT /api/roles/{id}/permissions/{code}` |
| `adminApi.addAssignments`, `removeAssignment` | 20 | FR-ADM-006, INV-14 | `POST/DELETE /api/monitoring-assignments` |
| `adminApi.searchStaff` | — | OQ-11 | `GET /api/staff?q=` (proxy Keycloak) |
| `adminApi.appointOperator`, `revokeOperator` | Konten(11) — Pejabat | FR-ADM-010, FR-NTF-011 | `POST /api/positions/{id}/delegates`, `POST /api/delegates/{id}/revoke` |
| `calendarApi.createFiscalYear`, `updateFiscalYear`, `updateQuarter(…, confirmPastDeadline)` | 19 | FR-ADM-007, INV-9 | `POST /api/fiscal-years`, `PATCH /api/fiscal-years/{y}`, `PATCH /api/quarters/{id}` |
| `calendarApi.excludeAssessor` | 19 | §2.5 | `POST /api/quarters/{id}/assessors/{pos}/exclude` |
| `calendarApi.archiveManually` | 26 | §2.5 | `POST /api/fiscal-years/{y}/archive` |
| `importApi.template`, `dryRun`, `apply`, `history`, `kindsFor` | 18 / 21 / 20 per jenis | FR-ADM-013 | `GET /api/imports/templates/{kind}`, `POST /api/imports` (dry run → `ImportJob`), `POST /api/imports/{id}/commit`, `GET /api/imports` |
| `insightsApi.metrics(year)` | 22 | FR-ADM-011 | `GET /api/metrics?ta=` (+ `?format=csv`) |
| `insightsApi.audit(filter, original)` | 23 (+24 untuk nilai asli) | FR-ADM-008, VIS-8 | `GET /api/audit?…&original=1` |
| `insightsApi.logShowOriginal` | 24 | FR-ADM-008 | dicatat server |

## 5. Celah kontrak: data yang dibaca langsung dari store

Prinsip CLAUDE.md §4 ("halaman tidak pernah menyentuh `localStorage` langsung") terpenuhi, tetapi 24 berkas di `pages/`, `layout/`, dan `components/` (ditambah `state/useAuth.ts`) **membaca** store (`useDb`/`getDb` dari `@/data/local/store`) secara sinkron untuk daftar dan pilihan. Di backend, setiap baris di bawah perlu endpoint baca. `DataGate` (`components/DataGate`) hanya menyimulasikan satu panggilan agar skeleton/galat tetap tampil.

| Berkas | Data yang dibaca | Usulan endpoint |
|---|---|---|
| `layout/Sidebar.tsx`, `layout/Topbar.tsx`, `layout/Workspace.tsx`, `state/useAuth.ts` | Holding, izin, jabatan dalam cakupan, nama Pejabat, pencarian global | `GET /api/me`, `GET /api/positions/{id}`, `GET /api/search?q=` |
| `components/NotificationPanel`, `pages/notifications/NotificationsPage.tsx` | Notifikasi pengguna | `GET /api/notifications` (sudah ada di `notificationApi.list`, belum dipakai) |
| `pages/register/RegisterPage.tsx`, `RiskCard.tsx`, `DataUmumSection.tsx` | Read model terfilter dari `buildRegisterView` (sinkron, bukan `registerApi.view`); selain itu register TA sebelumnya (banner salin), kuartal, nama pengguna, template & formulir Data Umum, `wouldFlagNoMitigation` | `GET /api/registers/{pos}/{ta}` (= `registerApi.view`) ditambah info TA sebelumnya |
| `pages/master/*` (Jabatan, Tahap, Template, TemplateEditor, Usulan, Data Umum, Skala) | Jenis jabatan, jabatan, tahap, template + hitungan pemakaian (`templateUsage`), usulan, formulir, versi pita & pilihan | `GET /api/position-types`, `/positions`, `/stages`, `/risk-templates?type=&stage=`, `/proposals`, `/data-umum-forms`, `/score-band-versions` |
| `pages/admin/*` (Pengguna, Peran, Penugasan, Tahun Anggaran, Jabatan Saya, Audit, Metrik) | Pengguna + holding, peran + izin, penugasan, TA + kuartal + status arsip (`archiveStatus`, `quarterProblems`), filter audit | `GET /api/users`, `/roles`, `/monitoring-assignments`, `/fiscal-years`, `/me/positions` |
| `pages/board/ThreadPage.tsx` | Peserta untuk @sebut (`threadParticipants`), izin 25 | `GET /api/register-risks/{id}/participants` |
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
