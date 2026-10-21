# Backend B2 — Master Data & Administrasi: Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua penulisan dan pembacaan Master Data (jabatan, tahap, template, Data Umum, skala penilaian) dan Administrasi (pengguna, peran, penugasan pemantauan, tahun anggaran, jabatan saya, impor CSV) berjalan di backend. Halaman `/master/*` (kecuali usulan) dan `/pengaturan/*`, `/jabatan-saya` membaca dan menulis lewat API.

**Architecture:** Logika `masterApi`, `adminApi`, `calendarApi`, dan `importApi` prototipe diporting 1:1 ke service Django (`services.py` per app). Pesan galat, kode galat, dan aksi audit sama persis dengan prototipe. Uji kasus `data/api/master.test.ts` dan `admin.test.ts` menjadi uji API pytest. Pembacaan memakai **endpoint koleksi** berbentuk tipe domain (`GET /api/v1/collections/positions`, …) dan hook frontend `useCollections`. Hook ini menggantikan `useDb` di halaman-halaman itu tanpa menulis ulang logika tampilannya. Perubahan peran, holding, delegasi, dan status pengguna menaikkan `auth_epoch` (U-04, U-19).

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16, Celery Beat (registri `scheduler`), React 18 + Zustand, Vitest dengan backend palsu (`src/test/fakeBackend.ts`).

**Spec:** `docs/superpowers/specs/2026-10-21-backend-integration-design.md` (§4.2, §4.3, §4.8, §4.9, §4.10, §5, §6 baris B2). Kontrak: `docs/03_api_contract.md` §4.3 dan §4.8. Rencana sebelumnya: `docs/superpowers/plans/2026-10-21-backend-b1-fondasi.md`.

## Global Constraints

- Semua dari B0/B1 berlaku: prefix `/api/v1/` tanpa garis miring di akhir, JSON camelCase, amplop galat `{code, message, details}`, UUID (data demo `uuid5`), `simario.core.clock.now()`, PostgreSQL sungguhan di uji, komit tanpa atribusi, versi npm persis.
- **Port 1:1.** Setiap service mengikuti fungsi prototipe bernama sama di `frontend/src/data/api/{master,admin,calendar,importer}.ts`: urutan validasi, kode dan pesan `ApiError` persis, aksi audit (`tambah_jabatan`, `nonaktifkan_jabatan`, `ganti_kata_sandi`, …), `before`/`after`, dan notifikasi (`eventKey`) persis. Bila prototipe dan PRD berbeda, PRD menang dan catat di ledger.
- Izin selalu lewat kode 1–26 (`require_permission`), tidak pernah nama peran (RB-ADM-002). `acting_as` audit konfigurasi: `superadmin` bila punya izin 22, selain itu `pengelola` (sama dengan `requireActor` prototipe). Tindakan konten Pejabat (Tunjuk/Cabut Operator, izin 11) memakai `check_action` dan `acting_as` dari holding.
- Setiap mutasi: satu `transaction.atomic`, audit di dalamnya; `ApiError` dilempar sebelum menulis apa pun.
- **Uji hanya yang terkait** (preferensi pengguna 21 Okt 2026): tiap langkah menjalankan berkas uji tugas itu + `ruff`/`mypy`/`lint`/`build`; suite penuh hanya di checkpoint bila pengguna setuju.
- **Di luar B2:** usulan risiko `/master/usulan` (`RiskProposal`, `rejectProposal`, `saveTemplate(fromProposalId)`) pindah ke **B3** bersama register, karena `RiskProposal` merujuk `RegisterRisk`. Metrik dan jejak audit (`/metrik`, `/jejak-audit`) tetap di **B8**.

## Review Focus

1. **Operasi yang bergantung pada data register** (hitungan "Dipakai N jabatan", hapus template/tahap, dampak penonaktifan jabatan, jenis jabatan dengan register berjalan) selama register masih lokal (B3). Backend menjawab dari `simario/registers/usage.py` (stub nol di B2, diisi B3), jadi demo menampilkan "dapat dihapus". Ini tercatat sebagai U-21 dan tidak boleh membuat galat. Uji: Task 2 `test_usage_stub_reports_zero`.
2. **Sesi pengguna yang hak aksesnya baru berubah**: Alih Pejabat, cabut Operator, peran manual diubah, pengguna dinonaktifkan. Permintaan berikutnya pengguna itu 401, dan `/me` berikutnya mencerminkan hak baru. Uji: Task 7 `test_replace_official_ends_sessions_of_affected_users`, Task 6 `test_deactivated_user_session_ends`.
3. **Dua pengelola mengubah hal yang sama**: dua draf pita, atau dua Pejabat ditetapkan ke jabatan tunggal. Constraint basis data dan validasi di dalam transaksi menolak yang kedua dengan pesan prototipe, bukan 500. Uji: Task 5 `test_second_draft_is_refused`, Task 7 `test_concurrent_assign_to_single_official_position`.
4. **CSV impor dengan BOM, CRLF, pemisah `;`, atau baris kosong di akhir** (hasil ekspor Excel). Uji coba dan Terapkan memberi galat per baris yang sama dengan prototipe, dan tidak menulis apa pun sampai bersih. Uji: Task 10 `test_excel_style_csv`.
5. **Halaman membaca koleksi yang belum termuat atau gagal** (`useCollections`): skeleton saat memuat dan galat + "Coba Lagi", tidak pernah layar kosong atau crash. Uji: Task 11 `useCollections.test.ts`.

---

### Task 1: Endpoint koleksi dan `useCollections`

**Files:**
- Create: `backend/simario/core/permissions.py`, `backend/simario/core/collections.py`, `backend/simario/core/collection_views.py`; serializer koleksi di app masing-masing (`org/serializers.py`, `calendar/serializers.py`, `reference/serializers.py`, `accounts/serializers.py`)
- Create: `frontend/src/data/http/collections.ts`, `frontend/src/lib/useCollections.ts`
- Modify: `frontend/src/test/fakeBackend.ts` (rute koleksi dari store lokal)
- Test: `backend/tests/core/test_collections.py`, `frontend/src/lib/useCollections.test.ts`

**Interfaces:**
- Produces:
  - `core.permissions.require_permission(user: User, *codes: int) -> Actor`: setidaknya satu kode, selain itu `ApiError("forbidden", "Anda tidak memiliki akses untuk tindakan ini.")`. `Actor` = dataclass `user`, `at` (`clock.now()`), `today`, `acting_as` (`superadmin` bila izin 22, selain itu `pengelola`).
  - `GET /api/v1/collections/<name>` untuk `name` ∈ `orgUnits`, `positionTypes`, `positions`, `users`, `occupancies`, `delegates`, `roles`, `rolePermissions`, `userRoles`, `assignments` (dengan `supports`), `fiscalYears`, `quarters`, `quarterAssessors`, `stages`, `dataUmumForms`, `riskTemplates`, `mitigationTemplates`, `scoreBandVersions`, `scoreBands`, `scoreOptions`. Jawaban berupa daftar baris berbentuk tipe `frontend/src/domain/types.ts` (camelCase; `User` tanpa `password`; `PositionOccupancy.decreeFile` dari `decree_object_key`; `Quarter.fiscalYear` angka). Tanpa paginasi. Hanya untuk pengguna masuk. *(Keputusan rencana: data personel internal terbaca oleh semua pengguna masuk, seperti prototipe; dicatat sebagai risiko R-11 untuk ditinjau di B9.)*
  - `collectionsApi.get<K extends keyof DB>(name: K): Promise<DB[K]>`.
  - `useCollections<K extends keyof DB>(names: K[]): { db: Pick<DB, K> | null; loading: boolean; error: string | null; retry(): void; reload(): Promise<void> }`. `reload` dipanggil halaman setelah mutasi. Hasil disimpan per nama di store zustand bersama, sehingga dua halaman tidak saling menimpa.

- [ ] **Step 1: Uji yang gagal** (pytest, data demo):
  - `test_collection_positions_shape`: 12 baris, Andi's PPK A-1 `code == "PPKA1"`, kunci `orgUnitId`, `positionTypeId`.
  - `test_collection_users_has_no_password`.
  - `test_collection_requires_session`: 401.
  - `test_unknown_collection_is_404`.
  - `test_assignments_include_supports`.
  - `test_require_permission_actor_label` (Nur Aini → `pengelola`, Admin DKB → `superadmin`).
  - Vitest: `useCollections` memuat dua koleksi; `loading` lalu `db`; galat → `error` + `retry` memuat ulang.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi.** Satu `ListAPIView` generik dengan peta `name → (queryset, serializer)` di `core/collections.py`. Serializer koleksi dibuat sekali per model dan dipakai ulang oleh `/me` (`PositionSerializer`, `QuarterSerializer` B1). Backend palsu menjawab `GET /api/v1/collections/<name>` dengan `getDb()[name]`.
- [ ] **Step 4: Jalankan** uji tugas ini → PASS; regenerasi `openapi.yaml` + `npm run api:types`; ruff, mypy, lint.
- [ ] **Step 5: Komit** `feat: add collection read endpoints for reference and admin data`

---

### Task 2: Stub pemakaian register dan dampak jabatan

**Files:**
- Create: `backend/simario/registers/__init__.py`, `backend/simario/registers/apps.py`, `backend/simario/registers/usage.py` (tanpa model)
- Test: `backend/tests/registers/test_usage_stub.py`

**Interfaces:**
- Produces (diisi di B3; tanda tangan dikunci sekarang):
  - `template_usage(template_id: UUID, fiscal_year: int) -> int`
  - `template_ever_used(template_id: UUID) -> bool`
  - `stage_used(stage_id: UUID) -> bool`
  - `running_registers_of_positions(position_ids: list[UUID]) -> int`
  - `published_registers(position_id: UUID) -> list[dict]` (`{"fiscal_year": int, "active_risks": int}`)
  - Semuanya mengembalikan 0, `False`, atau `[]` di B2. Docstring modul menyebut B3 dan U-21.

- [ ] **Step 1: Uji yang gagal** `test_usage_stub_reports_zero`.
- [ ] **Step 2: Jalankan** → FAIL. **Step 3: Implementasi.** **Step 4: Jalankan** → PASS.
- [ ] **Step 5: Komit** `chore: add register usage stubs for master data checks`

---

### Task 3: MST — jenis jabatan dan jabatan

**Files:**
- Create: `backend/simario/org/services.py`, `backend/simario/org/views.py`, `backend/simario/org/urls.py`
- Test: `backend/tests/org/test_positions_api.py`

**Interfaces:**
- Consumes: `require_permission` (Task 1), `usage` (Task 2), `record` (B1), `bump_auth_epoch` (B1).
- Produces:
  - `PATCH /api/v1/position-types/{id}` `{active}` — izin 17. Port `setPositionTypeActive` (`type_in_use` + `details.positions`/`runningRegisters`).
  - `POST /api/v1/positions`, `PUT /api/v1/positions/{id}` — izin 18. Port `savePosition` + `validatePosition` (INV-2, identitas per jenis). Mengembalikan `{id}`.
  - `GET /api/v1/positions/{id}/impact` — port `positionImpact`.
  - `POST /api/v1/positions/{id}/deactivate` `{reason}` dan `POST /api/v1/positions/{id}/reactivate` — izin 18. Port `deactivatePosition` (mengakhiri Operator dengan `end_reason` sesuai prototipe + notifikasi FR-NTF-011 + `bump_auth_epoch` untuk setiap Operator yang berakhir) dan `reactivatePosition`.
  - `org.services.end_delegates(delegates, reason, actor)` dipakai ulang Task 7.

- [ ] **Step 1: Uji yang gagal**, porting kasus `master.test.ts`:
  - `test_lini1_user_cannot_write_master_data`.
  - `test_type_in_use_refuses_deactivation`.
  - `test_duplicate_code_within_unit`.
  - `test_deactivate_position_ends_operators_and_audits`, termasuk Operator berakhir, notifikasi, audit `nonaktifkan_jabatan`, dan sesi Operator 401.
- [ ] **Step 2–4:** FAIL → implementasi → PASS; ruff, mypy.
- [ ] **Step 5: Komit** `feat: move positions and position types to the backend`

---

### Task 4: MST — tahap, template, dan formulir Data Umum

**Files:**
- Create: `backend/simario/reference/services.py`, `backend/simario/reference/views.py`, `backend/simario/reference/urls.py`
- Test: `backend/tests/reference/test_stages_templates_api.py`, `test_data_umum_api.py`

**Interfaces:**
- Produces (izin sesuai prototipe: tahap 15, template 12, Data Umum 16):
  - `POST /api/v1/stages` `{positionTypeId, name}`, `PATCH /api/v1/stages/{id}` `{name?|active?}`, `DELETE /api/v1/stages/{id}`, `PUT /api/v1/position-types/{id}/stage-order` `{orderedIds}`. Port `addStage`, `renameStage`, `setStageActive`, `deleteStage` (pakai `usage.stage_used`), `reorderStages`.
  - `POST /api/v1/risk-templates`, `PUT /api/v1/risk-templates/{id}` (`{positionTypeId, stageId, riskType, description, mitigations[]}`, **tanpa** `fromProposalId` di B2), `PATCH /api/v1/risk-templates/{id}` `{active}`, `DELETE /api/v1/risk-templates/{id}`. Port `saveTemplate` (kode baru mengikuti pola prototipe; mitigasi berurutan; RB-MST-001: register tidak tersentuh), `setTemplateActive`, `deleteTemplate` (`usage.template_ever_used`).
  - `GET /api/v1/risk-templates/usage?fiscalYear=` → `{templateId: count}` (port `templateUsage` lewat `usage.template_usage`).
  - `POST /api/v1/position-types/{id}/data-umum-forms` `{defaultObjective, fields[], objectiveEnabled}`. Port `saveDataUmumForm` (versi baru, validasi label dan pilihan, versi lama nonaktif).

- [ ] **Step 1: Uji yang gagal**, porting:
  - `test_stage_names_unique_per_type_and_used_stage_not_deleted`: nama unik per jenis; tahap terpakai tidak bisa dihapus. Pemakaian dipalsukan dengan `monkeypatch` pada `usage.stage_used`.
  - `test_reorder_saves_immediately`.
  - `test_used_template_cannot_be_deleted`: monkeypatch `template_ever_used`.
  - `test_edit_wording_keeps_code`.
  - `test_data_umum_validates_and_versions`.
  - `test_objective_optional_and_off_by_default`.
- [ ] **Step 2–4:** FAIL → implementasi → PASS.
- [ ] **Step 5: Komit** `feat: move stages, templates and data umum forms to the backend`

---

### Task 5: MST — skala penilaian, pilihan, dan tugas `score_bands`

**Files:**
- Create: `backend/simario/domain/score_options.py` (port `validateOptions`, `sortOptions`, `optionFor`; `snapToOption` tidak dibutuhkan)
- Modify: `backend/simario/reference/services.py`, `views.py`, `urls.py`; `shared/test-vectors/score-bands.json` (aturan `validateOptions`)
- Create: `backend/simario/reference/tasks.py` (tugas terjadwal)
- Test: `backend/tests/reference/test_score_bands_api.py`, `backend/tests/domain/test_score_bands_vectors.py`, `frontend/src/domain/scoreBands.vectors.test.ts`

**Interfaces:**
- Produces (izin 14):
  - `POST /api/v1/score-band-versions` `{effectiveFrom}` membuat draf (salin pita + pilihan versi aktif).
  - `PUT /api/v1/score-band-versions/{id}` memperbarui draf (`bands`, `options`, `effectiveFrom`).
  - `POST /api/v1/score-band-versions/{id}/schedule` (port `saveBandVersion`: `bands_invalid`/`options_invalid` dengan `details`; status menjadi `scheduled`, atau `active` bila tanggal berlaku ≤ hari ini).
  - `DELETE /api/v1/score-band-versions/{id}`.
  - `PATCH /api/v1/score-bands/{predicate}` `{guidance}` (versi aktif).
  - `PATCH /api/v1/score-options/{id}` `{label}` (versi aktif; pesan galat prototipe).
  - Tugas `score_bands` di `scheduler`: versi `scheduled` dengan `effective_from ≤ as_of` menjadi `active` dan yang lama menjadi `retired` (INV-3). Triwulan yang jendela pertamanya sudah dibuka mengunci `score_band_version`. Port `activateScoreBands`.
  - Draf kedua saat draf sudah ada → galat prototipe, bukan 500 (constraint atau pengecekan di dalam transaksi).

- [ ] **Step 1: Uji yang gagal**, porting 9 kasus skala di `master.test.ts`:
  - celah 1,9–2,0 ditolak;
  - dijadwalkan lalu aktif hanya pada tanggalnya;
  - triwulan mengunci versi;
  - predikat tanpa kalimat ditolak;
  - salin/hapus kalimat bersama draf;
  - sunting teks hanya di versi aktif + audit;
  - urutan = peringkat;
  - menolak versi yang bukan draf;
  - ditambah `test_second_draft_is_refused`.
  - Vektor `validateOptions` dari kasus TS yang sama, dijalankan di dua sisi.
- [ ] **Step 2–4:** FAIL → implementasi → PASS.
- [ ] **Step 5: Komit** `feat: move score bands and statements to the backend`

---

### Task 6: ADM — pengguna, peran manual, kata sandi sementara, cari pegawai

**Files:**
- Create: `backend/simario/accounts/admin_services.py`, `backend/simario/accounts/admin_views.py`, `backend/simario/accounts/keycloak.py`
- Modify: `backend/simario/accounts/urls.py`, `backend/simario/accounts/oidc.py` (U-19), `infra/keycloak/realm-export.json` (service account `simario` + peran `view-users`), `.env.example`
- Test: `backend/tests/accounts/test_users_api.py`, `test_staff_search.py`

**Interfaces:**
- Produces (izin 21 kecuali disebut):
  - `POST /api/v1/users` (port `addUser`; kata sandi sementara untuk akun lokal dikembalikan **sekali** di jawaban `{id, temporaryPassword?}`).
  - `POST /api/v1/users/{id}/deactivate` (port `deactivateUser`, termasuk penolakan Pengisi Pokja dengan pesan prototipe, berakhirnya holding/Operator, `bump_auth_epoch`) dan `POST /api/v1/users/{id}/reactivate`.
  - `PUT /api/v1/users/{id}/roles` `{roleIds}` — izin 22, port `setManualRoles`, `bump_auth_epoch`.
  - `POST /api/v1/users/{id}/reset-password` → `{temporaryPassword}`, port `resetPassword` (audit tanpa nilai, `must_change_password`).
  - `GET /api/v1/staff?q=` → `[{nip, fullName, email, orgUnitId}]` (OQ-11). Lewat Keycloak Admin REST dengan client credentials `simario` (service account, peran realm-management `view-users`). Bila `OIDC_*` kosong atau Keycloak tak terjangkau: 503 `server` dengan pesan "Pencarian pegawai belum tersedia."
  - U-19: `SimarioOIDCBackend.get_user` mengembalikan `None` untuk pengguna nonaktif.

- [ ] **Step 1: Uji yang gagal**:
  - `test_add_local_user_returns_temporary_password_once`.
  - `test_pokja_filler_cannot_be_deactivated` (port).
  - `test_deactivated_user_session_ends`.
  - `test_manual_roles_bump_epoch`.
  - `test_reset_password_audit_has_no_values`.
  - `test_staff_search_uses_keycloak`: `requests` di-monkeypatch; NIP diambil dari atribut `nip`.
  - `test_staff_search_unavailable_message`.
  - `test_inactive_sso_user_is_not_restored`.
- [ ] **Step 2–4:** FAIL → implementasi (impor ulang realm) → PASS; uji manual `GET /api/v1/staff?q=galih` terhadap Keycloak lokal.
- [ ] **Step 5: Komit** `feat: move user administration to the backend`

---

### Task 7: ADM — penetapan Pejabat, Alih Pejabat, Pengisi, Operator, tugas `delegations`

**Files:**
- Modify: `backend/simario/org/services.py`, `views.py`, `urls.py`; `backend/simario/org/tasks.py` (baru)
- Test: `backend/tests/org/test_holdings_api.py`

**Interfaces:**
- Produces:
  - `POST /api/v1/occupancies` — izin 21, port `assignPosition`. Jabatan tunggal yang sudah berpejabat ditolak dengan `occupied` (pesan prototipe). Pemeriksaannya memakai `select_for_update` pada jabatan.
  - `POST /api/v1/positions/{id}/replace-official` — izin 21, port `replaceOfficial`: Operator pejabat lama berakhir (`official_changed`), notifikasi, dan `bump_auth_epoch` untuk pejabat lama, pejabat baru, dan setiap Operator yang berakhir.
  - `POST /api/v1/positions/{id}/filler` `{toOccupancyId}` — port `moveFiller` (`filler_changed`).
  - `POST /api/v1/positions/{id}/delegates` dan `POST /api/v1/delegates/{id}/revoke` — `check_action(11)` pada jabatan itu (Pejabat/Pengisi), port `appointOperator` (FR-NTF-011, pengguna baru `created_via="delegation"` bila belum ada, lewat data `staff`) dan `revokeOperator`. Keduanya `bump_auth_epoch`.
  - `GET /api/v1/me/positions` → kartu Pejabat/Operator untuk `/jabatan-saya` (port data yang kini dibaca `MyPositionsPage`).
  - Tugas `delegations`: delegasi lewat `end_date` → `end_reason="expired"` + notifikasi sesuai prototipe (port `expireDelegations`).

- [ ] **Step 1: Uji yang gagal**, porting kasus `admin.test.ts`:
  - `test_assign_to_occupied_single_position_refused`.
  - `test_replace_official_ends_operators`.
  - `test_replace_official_ends_sessions_of_affected_users`.
  - `test_andi_appoints_galih_who_can_sign_in`: Galih dibuat dari direktori pegawai; masuk lewat `dev/impersonate`; `/me` menunjukkan Operator.
  - `test_concurrent_assign_to_single_official_position`: dua `assignPosition` berurutan dalam transaksi terpisah → yang kedua `occupied`.
  - `test_delegations_task_expires_and_notifies`.
- [ ] **Step 2–4:** FAIL → implementasi → PASS.
- [ ] **Step 5: Komit** `feat: move holdings and operator delegation to the backend`

---

### Task 8: ADM — peran dan izin, penugasan pemantauan

**Files:**
- Modify: `backend/simario/org/services.py`, `views.py`, `urls.py`
- Test: `backend/tests/org/test_roles_assignments_api.py`

**Interfaces:**
- Produces:
  - `POST /api/v1/roles` `{name}`, `DELETE /api/v1/roles/{id}`, dan `PUT /api/v1/roles/{id}/permissions/{code}` `{enabled, scope}` — izin 22. Port `addRole`, `deleteRole`, `setPermission`: Superadmin terkunci, izin 10 dijaga, peran terpakai, INV-5 (minimal satu pengelola peran). Pemegang peran itu kena `bump_auth_epoch`.
  - `POST /api/v1/monitoring-assignments` (massal: `{targetPositionIds[], leadPositionId, supports[], quarterFromId, quarterToId, decreeNo}`) dan `DELETE /api/v1/monitoring-assignments/{id}` — izin 20. Port `addAssignments` (INV-14: satu lead per jabatan per triwulan yang bertumpuk) dan `removeAssignment`. Pemegang jabatan Lini 2 terkait kena `bump_auth_epoch`, karena cakupannya berubah.

- [ ] **Step 1: Uji yang gagal**, porting:
  - `test_keeps_one_role_manager` (INV-5).
  - `test_superadmin_locked_permission_10_guarded_in_use_role`.
  - `test_second_lead_overlapping_quarter_refused`.
  - `test_assignment_change_updates_lini2_scope`: `/me` Siti dan `can_read_position` berubah.
- [ ] **Step 2–4:** FAIL → implementasi → PASS.
- [ ] **Step 5: Komit** `feat: move roles and monitoring assignments to the backend`

---

### Task 9: ADM — tahun anggaran, triwulan, pengecualian Lini 3, tugas `calendar`

**Files:**
- Create: `backend/simario/calendar/services.py`, `views.py`, `urls.py`, `tasks.py`; `backend/simario/assessments/__init__.py` + `usage.py` (stub, diisi B5); `backend/simario/domain/calendar.py` (tambah `default_quarters`, `add_workdays`, `lateness_at`, dan validasi INV-9 yang dipakai `updateQuarter`) + vektor di `shared/test-vectors/calendar.json`
- Test: `backend/tests/calendar/test_fiscal_years_api.py`, `backend/tests/domain/test_calendar_vectors.py`, `frontend/src/domain/calendar.vectors.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/fiscal-years` `{year}` (triwulan bawaan §2.5), `PATCH /api/v1/fiscal-years/{year}`, dan `PATCH /api/v1/quarters/{id}` `{…, confirmPastDeadline}` — izin 19. Port `createFiscalYear`, `updateFiscalYear`, `updateQuarter` (INV-9 dan pesan prototipe).
  - `POST /api/v1/quarters/{id}/assessors/{positionId}/exclude` `{reason}` — izin 19, port `excludeAssessor`. Pemeriksaan "sudah menuntaskan sesuatu" lewat `usage`-style stub `simario/assessments/usage.py` `assessor_has_finalised(quarter_id, position_id) -> bool` (False di B2, diisi B5).
  - `POST /api/v1/fiscal-years/{year}/archive` — izin 26, port `archiveManually`.
  - `GET /api/v1/fiscal-years/{year}/archive-status` → `{status, blockers, baseHardLimit, projected}` (port `archiveStatus`, `quarterProblems`).
  - Tugas `calendar`: status `open → closing`, set penilai Lini 3 saat `lini3_opens_on`, arsip pada batas keras.
  - `calendar.services.on_archive(fn: Callable[[FiscalYear, datetime], None])`: registri efek samping arsip yang diisi register (B3), penilaian (B5), dan lembar (B7). Di B2 arsip hanya mengubah `FiscalYear`.

- [ ] **Step 1: Uji yang gagal**:
  - `test_create_year_with_default_quarters_and_inv9` (port).
  - `test_exclude_assessor_only_before_finalising` (port; stub dipalsukan).
  - `test_calendar_task_opens_lini3_assessor_set`.
  - `test_archive_runs_registered_hooks`.
  - Vektor `defaultQuarters`, `addWorkdays`, `latenessAt` di dua sisi.
- [ ] **Step 2–4:** FAIL → implementasi → PASS.
- [ ] **Step 5: Komit** `feat: move fiscal years and quarters to the backend`

---

### Task 10: ADM — impor CSV dan `ImportJob`

**Files:**
- Create: `backend/simario/imports/{__init__,apps,models,services,views,urls}.py` + migrasi
- Test: `backend/tests/imports/test_imports_api.py`

**Interfaces:**
- Produces:
  - Model `ImportJob`: `kind` (`jabatan`|`pejabat`|`penugasan`), `status` (`dry_run`|`applied`), `rows`, `valid`, `errors` JSON, `created_by`, `created_at`, `applied_at`, `content` (teks CSV).
  - `GET /api/v1/imports/templates/{kind}` → CSV (port `csvTemplate`).
  - `GET /api/v1/imports/kinds` (port `kindsFor`: izin 18/21/20 per jenis).
  - `POST /api/v1/imports` `{kind, text}` → `ImportJob` hasil uji coba (port `dryRun`: galat per baris dan kolom, pesan persis).
  - `POST /api/v1/imports/{id}/commit` — menerapkan bila tanpa galat (port `apply`, memanggil service Task 3/7/8 agar audit dan `bump_auth_epoch` sama). Bila masih ada galat: `errors` (422, `details` = daftar baris).
  - `GET /api/v1/imports` → riwayat dari `ImportJob`.
  - Parser menerima BOM, CRLF, pemisah `,` atau `;`, dan baris kosong di akhir.

- [ ] **Step 1: Uji yang gagal**:
  - `test_errors_per_row_and_nothing_written_until_clean` (port).
  - `test_excel_style_csv`.
  - `test_apply_creates_positions_and_audits`.
  - `test_kinds_follow_permissions`.
- [ ] **Step 2–4:** FAIL → implementasi → PASS.
- [ ] **Step 5: Komit** `feat: move csv import to the backend`

---

### Task 11: Frontend — Master Data lewat API

**Files:**
- Create: `frontend/src/data/http/master.ts`
- Modify: `frontend/src/data/repository.ts` (`masterApi` dari HTTP, kecuali `rejectProposal` dan `saveTemplate(fromProposalId)` yang tetap lokal sampai B3); `frontend/src/pages/master/{PositionsPage,StagesPage,TemplatesPage,TemplateEditor,DataUmumPage,ScoreBandsPage,ScoreOptionsCard}.tsx` (`useDb` → `useCollections` + `reload()` setelah mutasi); `frontend/src/test/fakeBackend.ts` (rute master memanggil `masterApi` lokal dari `data/api/master.ts`)
- Test: `frontend/src/pages/master/master.test.tsx` (async), `frontend/src/lib/useCollections.test.ts`

**Interfaces:**
- Consumes: endpoint Task 1–5; `useCollections` (Task 1).
- Produces: `masterApi` HTTP dengan tanda tangan sama. Halaman master menampilkan skeleton saat koleksi dimuat dan `InlineAlert` + "Coba Lagi" saat gagal. `/master/usulan` tetap memakai store lokal (B3).

- [ ] **Step 1: Uji yang gagal**: uji halaman master yang ada dibuat async (`findBy…`); `useCollections.test.ts`: keadaan memuat dan galat (Review Focus #5).
- [ ] **Step 2–4:** FAIL → implementasi → PASS (`npx vitest run src/pages/master src/lib`); lint, build.
- [ ] **Step 5: Uji manual** (Nur Aini, data demo): ubah nama tahap, buat draf pita bercelah → ditolak, nonaktifkan template → hilang dari daftar aktif, simpan formulir Data Umum versi baru. Muat ulang halaman → perubahan bertahan (dari backend).
- [ ] **Step 6: Komit** `feat: read and write master data through the backend`

---

### Task 12: Frontend — Administrasi lewat API

**Files:**
- Create: `frontend/src/data/http/admin.ts`, `calendar.ts`, `importer.ts`
- Modify: `frontend/src/data/repository.ts` (`adminApi`, `calendarApi`, `importApi` dari HTTP); `frontend/src/pages/admin/{UsersPage,RolesPage,AssignmentsPage,FiscalYearsPage,MyPositionsPage,ImportPage,RowMenu}.tsx` (`useCollections`); `frontend/src/layout/Workspace.tsx`, `Sidebar.tsx` bila masih membaca holding/nama Pejabat dari store; `frontend/src/test/fakeBackend.ts`
- Test: `frontend/src/pages/admin/admin.test.tsx` (async)

**Interfaces:**
- Produces: `adminApi`, `calendarApi`, `importApi` HTTP dengan tanda tangan sama. Setelah mutasi yang mengubah hak pengguna yang sedang masuk (misalnya Andi menunjuk Operator), `useMe.refresh()` dipanggil. `/metrik` dan `/jejak-audit` tetap lokal (B8).

- [ ] **Step 1: Uji yang gagal**: `admin.test.tsx` async; "Andi menunjuk Galih Pratama dari Jabatan Saya" lewat API; "Pengisi Pokja tidak bisa dinonaktifkan" menampilkan pesan backend.
- [ ] **Step 2–4:** FAIL → implementasi → PASS (`npx vitest run src/pages/admin`); lint, build.
- [ ] **Step 5: Uji manual** (Admin DKB, Andi): Alih Pejabat PPK A-1 → Operator lama berakhir dan sesinya diarahkan ke `/login?alasan=sesi-berakhir`; Andi menunjuk Galih → Galih bisa masuk; impor CSV jabatan dengan satu galat → laporan per baris, lalu perbaiki → Terapkan.
- [ ] **Step 6: Komit** `feat: run administration through the backend`

---

### Task 13: Dokumen dan checkpoint B2

**Files:**
- Modify: `docs/03_api_contract.md` (§4.3, §4.8, §5 diputuskan; endpoint koleksi), `docs/01_backend.md` (§1 status; tugas `score_bands`, `delegations`, `calendar` kini di backend), `docs/02_frontend.md` (`useCollections`), `docs/04_risk_and_debt.md` (U-01 berkurang; U-04 dan U-19 selesai → §5; baru U-21 stub pemakaian register sampai B3, R-11 data personel terbaca semua pengguna masuk), `docs/05_local_dev_and_testing.md` (service account Keycloak, impor), `docs/06_user_stories.md` (status ADM/MST), `CLAUDE.md` (B2: centang; catat usulan → B3)

- [ ] **Step 1: Dokumen** sesuai daftar.
- [ ] **Step 2: Gerbang**: uji tugas B2 (pytest `tests/org tests/reference tests/accounts tests/calendar tests/imports tests/core tests/registers`; Vitest `src/pages/master src/pages/admin src/lib src/data/http`), ruff, mypy, lint, build. Tanyakan pengguna sebelum menjalankan suite penuh.
- [ ] **Step 3: Komit** `feat: move master data and administration to the backend (checkpoint B2)`, hanya berkas B2.
- [ ] **Step 4: Laporan checkpoint** lalu berhenti: "Lanjut ke Tahap B3?"
