# Backend B1 — Fondasi: Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identitas, organisasi, kalender, data referensi, audit, notifikasi, jam simulasi, dan sesi berjalan di backend. Frontend masuk lewat backend (Keycloak lokal, akun lokal, atau persona dev), membaca konteks pengguna dari `GET /api/v1/me` dan notifikasi dari API. Modul lain tetap lokal sampai tahapnya.

**Architecture:** Model Django per app (`accounts`, `org`, `calendar`, `reference`, `audit`, `notifications`, `devtools`) dengan UUID. Aturan akses diporting murni ke `simario/domain/access.py` dan diuji dengan vektor bersama terhadap data demo hasil ekspor seed prototipe. Data demo backend = **ekspor otomatis `buildSeed()` prototipe** ke JSON, dengan ID prototipe diubah ke UUID deterministik. Di frontend, lapisan `data/http/` menggantikan `authApi` dan `notificationApi`. Jembatan ID sementara (`legacyIds`) menerjemahkan UUID backend ↔ ID prototipe di batas HTTP, agar modul yang masih lokal tetap bekerja. Jembatan ini dihapus di B9.

**Tech Stack:** Django 5.2, DRF, mozilla-django-oidc, drf-spectacular(-sidecar), PostgreSQL 16, Celery Beat; React 18 + Zustand; tsx (skrip ekspor seed).

**Spec:** `docs/superpowers/specs/2026-10-21-backend-integration-design.md` (§4.2, §4.4, §4.5, §4.6, §4.8, §4.9, §4.10, §5, §6 baris B1). Kontrak: `docs/03_api_contract.md` §2, §3, §4.1, §4.2. Rencana sebelumnya: `docs/superpowers/plans/2026-10-21-backend-b0-kerangka.md`.

## Global Constraints

- Semua dari B0 berlaku: prefix `/api/v1/` **tanpa garis miring di akhir**, JSON camelCase, amplop galat `{code, message, details}`, `TIME_ZONE = "Asia/Makassar"`, uji dengan PostgreSQL sungguhan, komit tanpa atribusi, versi npm persis.
- Primary key UUID dibuat server (`uuid4`); seed demo memakai **`uuid5(NAMESPACE_SIMARIO, "<id prototipe>")`** dengan `NAMESPACE_SIMARIO = uuid.uuid5(uuid.NAMESPACE_DNS, "simario.ikn.go.id")`. Pengecualian: `FiscalYear` ber-PK `year` (int), `Permission` ber-PK `code` (1–26).
- Aturan bisnis memakai `simario.core.clock.now()` / `today()`, tidak pernah `timezone.now()` langsung (kecuali di `clock.py` sendiri).
- Pemeriksaan izin memakai kode 1–26, **tidak pernah nama atau kode peran** (RB-ADM-002). Kode tampilan peran (`PMR`, `PMT`, `PJM`, `PMD`, `SAD`) hanya untuk menu.
- Salinan teks (pesan galat, audit action) **persis** seperti prototipe. Sumbernya `authApi` di `frontend/src/data/repository.ts` dan `writeAudit` di pemanggil terkait.
- Template, tahap, dan kalimat penilaian hanya dibaca dari `docs/seed/template_risiko_rapim.json` dan `docs/seed/pilihan_penilaian.json` (CLAUDE.md §5). Teksnya tidak disalin ke kode.
- Model mengikuti PRD §2.8.1 + tabel "Saran" di `docs/01_backend.md` §4.2 (spec §4.2). `RiskProposal` **tidak** dibuat di B1 (B3).
- Pengguna tidak pernah dibuat dari login SSO (RB-AUT-003). Pencocokan selalu lewat NIP.
- Endpoint `devtools` hanya aktif bila `SIMARIO_DEV_TOOLS`. Bila mati: 404 `not_found`.

## Review Focus

1. **Pengguna tanpa jabatan, atau delegasi yang Pejabat penunjuknya sudah berakhir** (Nur Aini, Admin DKB, Operator yatim). `/me` mengembalikan `holdings: []` / tanpa delegasi itu, dan frontend menampilkan Beranda tanpa jabatan tanpa crash. Uji: Task 11 `test_me_without_holdings`, `test_me_skips_orphan_delegation`.
2. **Peran atau holding berubah saat sesi aktif.** `bump_auth_epoch` membuat permintaan berikutnya 401 `unauthenticated`, lalu frontend mengarah ke `/login?alasan=sesi-berakhir`. Uji: Task 9 `test_auth_epoch_bump_ends_session`; Task 14 `test_unauthenticated_redirects_to_login`.
3. **SSO dengan NIP yang tidak terdaftar atau pengguna nonaktif.** Pengguna tidak dibuat, audit `masuk_ditolak_belum_terdaftar` tercatat, dan halaman login menampilkan pesan PRD. Uji: Task 10 `test_unknown_nip_is_rejected_and_audited`, `test_inactive_user_is_rejected`.
4. **Reset atau seed diulang dua kali**, termasuk saat audit hanya-tambah dijaga trigger. Reset tetap berhasil (TRUNCATE), dan seed kedua menghasilkan jumlah baris yang sama. Uji: Task 7 `test_seed_demo_twice_is_identical`; Task 5 `test_audit_update_is_rejected`.
5. **Entitas buatan backend tanpa padanan ID prototipe, dan UUID di dalam string (`targetUrl`).** Jembatan meloloskan UUID yang tidak dikenal tanpa diubah dan menerjemahkan UUID yang dikenal di dalam URL. Uji: Task 13 `legacyIds.test.ts`.

---

### Task 1: Tindak lanjut minor B0 (backend & compose)

**Files:**
- Modify: `backend/simario/core/errors.py`, `middleware.py`, `health.py`, `storage.py`, `views.py`, `urls.py`; `backend/config/settings/base.py`, `config/urls.py`; `backend/pyproject.toml`; `docker-compose.yml`; `.env.example`; `backend/openapi.yaml`
- Test: `backend/tests/core/test_errors.py`, `test_health.py`

**Interfaces:**
- Produces: `STATUS_BY_CODE` bertambah `login_failed` 401, `locked_out` 423, `method_not_allowed` 405, `throttled` 429, `bad_request` 400 (pesan bawaan: "Metode tidak didukung.", "Terlalu banyak permintaan. Coba lagi nanti.", "Permintaan tidak dapat diproses."); `ApiError(code, …)` melempar `ValueError` bila `code` tidak ada di tabel dan `status` tidak diberikan; `GET /api/v1/health/live` → 200 `{"status": "ok"}` tanpa pemeriksaan dependensi.

- [ ] **Step 1: Uji yang gagal**: `test_parse_error_is_validation` (badan JSON rusak → 422 `validation` "Isian belum valid.", tidak ada teks dekoder JSON), `test_method_not_allowed_envelope` (POST ke `health` → 405 `method_not_allowed`, pesan Indonesia), `test_unknown_api_error_code_raises` (`ApiError("archieved", "x")` → `ValueError`), `test_handler_calls_set_rollback` (monkeypatch `rest_framework.views.set_rollback`, harus dipanggil satu kali untuk `ApiError`), `test_bare_api_path_returns_envelope` (GET `/api` → 404 JSON), `test_health_live` (200 tanpa memanggil `CHECKS`).
- [ ] **Step 2: Jalankan**: `uv run pytest tests/core -q` → yang baru FAIL.
- [ ] **Step 3: Implementasi**:
  - `ParseError`/`UnsupportedMediaType` → `validation` 422; `MethodNotAllowed` → `method_not_allowed`; `Throttled` → `throttled`; `APIException` lain → `bad_request` dengan pesan bawaan.
  - Panggil `set_rollback()` di setiap jalur yang mengembalikan `Response`.
  - Middleware memperlakukan `request.path == "/api"` sama dengan awalan `/api/`.
  - `DATABASES["default"]["OPTIONS"] = {"connect_timeout": 2}`; boto3 `retries={"total_max_attempts": 1, "mode": "standard"}`.
  - Tambah `drf-spectacular-sidecar`, lalu `SPECTACULAR_SETTINGS` `SWAGGER_UI_DIST="SIDECAR"`, `SWAGGER_UI_FAVICON_HREF="SIDECAR"`, `REDOC_DIST="SIDECAR"` + app `drf_spectacular_sidecar`.
- [ ] **Step 4: Compose & `.env.example`**:
  - Healthcheck `api`: `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health/live', timeout=3)"`.
  - Healthcheck `worker`: `celery -A config inspect ping -d celery@$$HOSTNAME`.
  - `beat` tanpa healthcheck (catat di `docs/05`).
  - `clamav` dipublikasikan `127.0.0.1:3310:3310` agar API di host bisa memeriksanya.
  - `.env.example`: hapus `DJANGO_SETTINGS_MODULE` (tidak berpengaruh untuk proses host; bawaan `manage.py` = `local`), tambah baris komentar `# SIMARIO_ENV_FILE=…` yang menjelaskan fungsinya.
- [ ] **Step 5: Jalankan** suite backend + ruff + mypy → lulus; regenerasi `openapi.yaml` + `npm run api:types`; `docker compose up -d --build` → `api` dan `worker` `healthy`.
- [ ] **Step 6: Komit** `fix: resolve b0 review follow-ups`

---

### Task 2: Ekspor seed prototipe ke JSON

**Files:**
- Create: `frontend/scripts/export-seed.ts`
- Create (dihasilkan, dikomit): `backend/simario/devtools/fixtures/demo.json`, `frontend/src/data/http/legacy-ids.json`
- Modify: `frontend/package.json` (devDependency `tsx` persis, skrip `seed:export`), `frontend/.prettierignore`, `frontend/eslint.config.js` (abaikan `legacy-ids.json` bila perlu)
- Test: `frontend/scripts/export-seed.test.ts`

**Interfaces:**
- Produces:
  - `demo.json` = `{"generatedFrom": "frontend/src/data/seed", "permissions": PERMISSIONS, "staffDirectory": staffDirectory, "db": buildSeed()}`. ID prototipe tidak diubah; kunci camelCase seperti TS.
  - `legacy-ids.json` = objek `{"<id prototipe>": "<uuid5>"}` untuk **setiap** ID di semua koleksi `buildSeed()` (field `id`, ditambah `year` FiscalYear sebagai string bila diperlukan, tidak di-UUID-kan).
  - `uuid5` dihitung dengan `node:crypto` (SHA-1, RFC 4122 versi 5) memakai namespace di Global Constraints.

- [ ] **Step 1: Uji yang gagal** `export-seed.test.ts`: `uuid5("usr-andi")` = nilai yang dihitung Python `uuid.uuid5(uuid.uuid5(uuid.NAMESPACE_DNS, "simario.ikn.go.id"), "usr-andi")` (tulis nilainya literal di uji setelah menghitungnya sekali dengan `uv run python -c …`); `buildExport().db.users.length === buildSeed().users.length`; `legacyIds["pos-ppk-a1"]` adalah UUID versi 5.
- [ ] **Step 2: Jalankan** `npx vitest run scripts/export-seed.test.ts` → FAIL.
- [ ] **Step 3: Implementasi** `export-seed.ts`: ekspor `uuid5(name: string): string`, `buildExport(): DemoExport`, `buildLegacyIds(db: DB): Record<string, string>`, dan `main()` yang menulis kedua berkas (JSON 2 spasi, diakhiri baris baru). Skrip `"seed:export": "tsx scripts/export-seed.ts"`; `tsx` membaca `paths` tsconfig untuk `@/` dan `@seed/` (tambahkan `tsconfig.node.json`/`include` bila perlu).
- [ ] **Step 4: Jalankan** uji → PASS; `npm run seed:export`; `npm run lint`, `npm run build` lulus.
- [ ] **Step 5: Komit** `chore: export prototype seed for the backend`

---

### Task 3: Model `accounts` dan `org`

**Files:**
- Create: `backend/simario/core/models.py` (`UUIDModel` abstrak), `backend/simario/accounts/{__init__,apps,models,managers}.py`, `backend/simario/org/{__init__,apps,models}.py`, migrasi `0001_initial` keduanya
- Modify: `backend/config/settings/base.py` (`INSTALLED_APPS`, `AUTH_USER_MODEL = "accounts.User"`)
- Test: `backend/tests/org/test_models.py`

**Interfaces:**
- Produces (nama field snake_case dari `frontend/src/domain/types.ts` + kolom "Saran"):
  - `accounts.User(AbstractBaseUser)`: `id` UUID, `nip` unik (`USERNAME_FIELD`), `email`, `full_name`, `is_local_account`, `must_change_password`, `created_via` (`admin`|`delegation`), `is_active`, `org_unit` FK null, `auth_epoch` int 0, `last_position` FK `org.Position` null (FR-AUT-009), `keycloak_sub` null. Tanpa `PermissionsMixin`. Manager `UserManager.create_user(nip, password=None, **fields)`.
  - `accounts.LoginLockout`: `nip` unik, `fails` int, `until` datetime null.
  - `org`: `OrgUnit`, `PositionType` (`code` unik, `line` 1–3, `default_role` FK, `allows_multiple_officials`, `identity_schema` JSON, `has_templates`, `is_builtin`, `active`), `Position` (`code`, `name`, `org_unit`, `position_type`, `identity` JSON, `active`, `deactivated_at`, `deactivation_reason`, `short_name`; **unik (`org_unit`, `code`)** INV-2), `PositionOccupancy` (`position`, `user`, `is_filler`, `start_date`, `end_date`, `decree_no`, `decree_date`, `decree_object_key` null), `PositionDelegate` (`position`, `user`, `appointed_by` FK occupancy, `letter_no`, `letter_date`, `letter_object_key`, `start_date`, `end_date`, `end_reason`), `Role` (`code` unik, `name`, `is_locked`), `Permission` (PK `code` 1–26, `group`, `label`, `scope_kind`, `requires_official`, `is_drafting`, `is_content_action`), `RolePermission` (unik `role`+`permission`, `scope` null), `UserRole` (`user`, `role`, `source` `manual`|`position`, `source_ref` null). `MonitoringAssignment` dan `MonitoringSupport` dibuat di Task 4 (bergantung pada `calendar.Quarter`).

- [ ] **Step 1: Reset basis data lokal.** `AUTH_USER_MODEL` tidak bisa diganti setelah migrasi `auth` B0 diterapkan: `docker compose stop api worker beat` → `docker compose rm -sf db` → `docker volume rm simario_pgdata` → `docker compose up -d db`. Basis data B0 hanya berisi migrasi bawaan; **pengguna menyetujui langkah ini lewat persetujuan rencana**.
- [ ] **Step 2: Uji yang gagal**: `test_position_code_unique_per_org_unit` (kode sama di unit lain boleh, di unit sama `IntegrityError`), `test_user_nip_unique`, `test_role_permission_unique`, `test_user_has_no_django_permissions_api` (`not hasattr(User, "is_superuser")`).
- [ ] **Step 3: Jalankan** → FAIL (app belum ada).
- [ ] **Step 4: Implementasi** model + `makemigrations accounts org`.
- [ ] **Step 5: Jalankan** → PASS; ruff, mypy; `docker compose up -d` → `migrate` sukses.
- [ ] **Step 6: Komit** `feat: add accounts and organisation models`

---

### Task 4: Model `calendar` dan `reference`

**Files:**
- Create: `backend/simario/calendar/{__init__,apps,models}.py`, `backend/simario/reference/{__init__,apps,models}.py`, migrasi
- Test: `backend/tests/reference/test_models.py`

**Interfaces:**
- Produces:
  - `calendar.FiscalYear` (PK `year`, `status` `open`|`closing`|`archived`, `tolerance_days`, `archive_grace_days`, `archived_at`, `archived_by`).
  - `calendar.Quarter` (`fiscal_year` FK, `number` 1–4, unik bersama `fiscal_year`; `starts_on`, `ends_on`, `lini1_opens_on`, `lini1_deadline`, `lini3_opens_on`, `lini3_deadline`, `explanation_workdays`, `score_band_version` FK null).
  - `calendar.QuarterAssessor` (unik `quarter`+`position`, `excluded`, `exclusion_reason`, `excluded_by` FK user null).
  - `org.MonitoringAssignment` (`target_position`, `lead_position`, `quarter_from`, `quarter_to` FK `calendar.Quarter`, `decree_no`) dan `org.MonitoringSupport` (`assignment`, `position`, `domain` `budget_performance`|`procurement`) — migrasi `org/0002`.
  - `reference`: `Stage` (`position_type`, `name`, `order`, `active`, `code` null unik, berisi kode tahap dari berkas Rapim), `DataUmumForm` (`position_type`, `version`, `fields` JSON, `objective_enabled`, `default_objective`, `active`, `created_at` date null; unik `position_type`+`version`), `RiskTemplate` (`code` unik, `position_type`, `stage`, `risk_type` `kinerja_anggaran`|`ketidakpatuhan`|`kecurangan`, `description`, `order`, `active`, `updated_at`), `MitigationTemplate` (`code` unik, `risk_template`, `description`, `order`, `active`), `ScoreBandVersion` (`number` unik, `effective_from`, `status` `draft`|`scheduled`|`active`|`retired`; **partial unique `status='active'`** INV-3), `ScoreBand` (`version`, `lower_exclusive` decimal(2,1) null, `upper_inclusive` decimal(2,1), `predicate`, `order`, `guidance`), `ScoreOption` (`version`, `value` decimal(2,1), `label`, `order`; unik `version`+`value` dan `version`+`label`).

- [ ] **Step 1: Uji yang gagal**: `test_monitoring_assignment_spans_quarters` (lead + dua support tersimpan, `quarter_from`/`quarter_to` merujuk Quarter), `test_only_one_active_score_band_version` (versi aktif kedua → `IntegrityError`; `draft` kedua boleh), `test_quarter_number_unique_per_year`, `test_score_option_value_unique_per_version`, `test_template_code_unique`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi** + migrasi.
- [ ] **Step 4: Jalankan** → PASS; ruff, mypy.
- [ ] **Step 5: Komit** `feat: add calendar and reference models`

---

### Task 5: Audit hanya-tambah dan notifikasi idempoten

**Files:**
- Create: `backend/simario/audit/{__init__,apps,models,services}.py` + migrasi (`0002_append_only_trigger` dengan `RunSQL`), `backend/simario/notifications/{__init__,apps,models,services}.py` + migrasi
- Test: `backend/tests/audit/test_audit.py`, `backend/tests/notifications/test_notify.py`

**Interfaces:**
- Produces:
  - `audit.AuditLog`: `id`, `at`, `actor` FK user null, `acting_as` (`pejabat`|`operator`|`superadmin`|`pengelola`|`sistem`|null), `acting_position` FK null, `action`, `entity_type`, `entity_id` (string), `before` JSON null, `after` JSON null.
  - `audit.services.record(*, action: str, entity_type: str, entity_id: str, actor: User | None = None, acting_as: str | None = None, acting_position: Position | None = None, before: Any = None, after: Any = None, at: datetime | None = None) -> AuditLog`. `at` bawaan = `clock.now()`.
  - `notifications.Notification`: `id`, `user` FK, `kind`, `text`, `target_url`, `read_at` null, `created_at`, `event_key`; **unik (`user`, `event_key`)**.
  - `notifications.services.notify(*, user: User, kind: str, text: str, target_url: str, event_key: str, at: datetime | None = None) -> Notification | None`. Mengembalikan `None` bila `event_key` sudah ada untuk pengguna itu.
  - Trigger PostgreSQL `audit_auditlog_append_only` (BEFORE UPDATE OR DELETE … RAISE EXCEPTION). TRUNCATE tidak terkena (dipakai reset dev, Task 7).

- [ ] **Step 1: Uji yang gagal**: `test_record_writes_row`, `test_audit_update_is_rejected` dan `test_audit_delete_is_rejected` (`django.db.DatabaseError`, di dalam `transaction.atomic()`), `test_notify_is_idempotent_per_event_key` (dua panggilan → satu baris, panggilan kedua `None`), `test_same_event_key_for_two_users_creates_two`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi** (`record` dan `notify` memakai `clock.now()` dari Task 6; untuk sementara impor `simario.core.clock.now`, yang Task 6 tulis. Bila Task 5 dikerjakan lebih dulu, buat `clock.now()` yang mengembalikan `timezone.now()` dan Task 6 melengkapinya).
- [ ] **Step 4: Jalankan** → PASS; ruff, mypy.
- [ ] **Step 5: Komit** `feat: add append-only audit log and idempotent notifications`

---

### Task 6: Jam simulasi dan registri tugas terjadwal

**Files:**
- Create: `backend/simario/core/clock.py`, `backend/simario/core/scheduler.py`, `backend/simario/devtools/{__init__,apps,models}.py` + migrasi
- Modify: `backend/simario/core/tasks.py`, `backend/config/settings/base.py` (`CELERY_BEAT_SCHEDULE`, app `simario.devtools`)
- Test: `backend/tests/core/test_clock.py`, `backend/tests/core/test_scheduler.py`

**Interfaces:**
- Produces:
  - `devtools.DevClock` (singleton `pk=1`): `sim_base` datetime, `real_base` datetime.
  - `clock.now() -> datetime` (aware, Asia/Makassar). Bila `settings.SIMARIO_DEV_TOOLS` dan ada `DevClock`: `sim_base + (real_now - real_base)`. Selain itu waktu nyata.
  - `clock.today() -> date`.
  - `clock.set_now(at: datetime) -> None`, yang menolak dengan `RuntimeError` bila dev tools mati.
  - `clock.parse_local(value: str) -> datetime`, yang membaca `YYYY-MM-DDTHH:mm` sebagai WITA.
  - `scheduler.register(name: str) -> Callable[[F], F]` (dekorator untuk `fn(as_of: datetime) -> None`), `scheduler.run_all(as_of: datetime) -> list[str]` (mengembalikan nama tugas yang dijalankan, sesuai urutan pendaftaran). B1 belum mendaftarkan tugas domain.
  - Task Celery `simario.core.tasks.run_scheduled` → `run_all(clock.now())`, dijadwalkan Beat setiap 15 menit (`CELERY_BEAT_SCHEDULE`).

- [ ] **Step 1: Uji yang gagal**: `test_now_follows_dev_clock` (setel `2027-04-06T09:00` → `now()` di antara 09:00 dan 09:01 WITA), `test_now_is_real_time_without_dev_tools` (`settings.SIMARIO_DEV_TOOLS=False` → `DevClock` diabaikan), `test_set_now_refused_without_dev_tools`, `test_parse_local_is_wita` (`utcoffset() == +8 jam`), `test_run_all_calls_registered_in_order` (daftarkan dua fungsi uji lewat registri terisolasi, hapus setelah uji).
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan** → PASS; ruff, mypy.
- [ ] **Step 5: Komit** `feat: add simulated clock and scheduled task registry`

---

### Task 7: `seed_reference` dan `seed_demo`

**Files:**
- Create: `backend/simario/reference/catalog.py`, `backend/simario/reference/management/commands/seed_reference.py`, `backend/simario/devtools/seed.py`, `backend/simario/devtools/management/commands/seed_demo.py`
- Test: `backend/tests/reference/test_seed_reference.py`, `backend/tests/devtools/test_seed_demo.py`

**Interfaces:**
- Consumes: model Task 3–6, `demo.json` (Task 2).
- Produces:
  - `catalog.py`: konstanta sistem yang dinilai **data referensi produksi**: `PERMISSIONS` (26 baris, nilai = `frontend/src/domain/permissions.ts`), `ROLES` + `ROLE_PERMISSIONS` bawaan, `POSITION_TYPES`, `DATA_UMUM_FORMS`, `SCORE_BAND_V1` (pita aktif) — nilai = koleksi bersangkutan di `demo.json` versi dasarnya.
  - `seed_reference` (idempoten, **hanya membuat yang belum ada**, tidak pernah menimpa): katalog di atas + tahap/template/mitigasi dari `docs/seed/template_risiko_rapim.json` (ID `uuid5("stg-<kode>")`, `uuid5("tpl-<kode>")`, `uuid5("mtpl-<kode>")` seperti `frontend/src/data/seed/reference.ts`) + pilihan penilaian versi 1 dari `docs/seed/pilihan_penilaian.json`.
  - `devtools.seed.legacy_uuid(prototype_id: str) -> uuid.UUID` dan `to_uuids(value: Any, known: set[str]) -> Any`: mengganti setiap string yang **sama dengan** ID prototipe yang dikenal, dan setiap ID yang dikenal **di dalam** string berbentuk URL (`target_url`), menjadi UUID.
  - `devtools.seed.load_demo(as_of: datetime | None = None) -> dict[str, int]`: TRUNCATE semua tabel app (CASCADE), muat koleksi B1 dari `demo.json` (`orgUnits`, `positionTypes`, `positions`, `users`, `occupancies`, `delegates`, `roles`, `rolePermissions`, `userRoles`, `assignments` + `supports`, `fiscalYears`, `quarters`, `quarterAssessors`, `stages`, `dataUmumForms`, `riskTemplates`, `mitigationTemplates`, `scoreBandVersions`, `scoreBands`, `scoreOptions`, `notifications`, `audit`) dan `permissions`; kata sandi akun lokal di-hash `make_password`; setel `DevClock` ke `as_of` atau `2027-04-06T09:00` WITA. Mengembalikan jumlah baris per koleksi. Dengan `as_of`: notifikasi dan audit sesudah `as_of` tidak dimuat (aturan `seedAsOf` di `frontend/src/data/seed/asOf.ts` untuk dua koleksi ini; koleksi lain menyusul di tahapnya).
  - `seed_demo [--as-of YYYY-MM-DDTHH:mm]` memanggil `load_demo`; `CommandError` bila `SIMARIO_DEV_TOOLS` mati.

- [ ] **Step 1: Uji yang gagal**:
  - `test_seed_reference_counts`: 4 jenis berpola template, 14 tahap aktif dari Rapim, 146 template, 302 mitigasi, 26 izin.
  - `test_seed_reference_never_overwrites`: ubah `description` satu template → jalankan ulang → tetap.
  - `test_seed_reference_matches_demo_text`: untuk setiap template dan mitigasi, `description` dan `uuid5` sama dengan baris `demo.json`.
  - `test_catalog_matches_demo`: izin, peran, izin peran, dan jenis jabatan sama dengan `demo.json`; perbedaan demo yang diketahui (tahap `stg-PPK-LEGACY-PL` nonaktif, template `KPA-T1-KA-04` nonaktif, pita versi 2 draf, formulir Data Umum PPK versi 2) didaftar eksplisit di uji.
  - `test_seed_demo_counts_match_export`: jumlah per koleksi B1 = panjang di `demo.json`.
  - `test_seed_demo_twice_is_identical`.
  - `test_seed_demo_ids_are_legacy_uuids`: `User` Andi ber-id `legacy_uuid("usr-andi")`.
  - `test_notification_target_url_uses_uuids`: tidak ada `pos-ppk-a1` tersisa di `target_url`.
  - `test_seed_demo_as_of_drops_later_rows`.
  - `test_seed_demo_refused_without_dev_tools`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan** → PASS; `docker compose exec api python manage.py seed_demo` sukses; ruff, mypy.
- [ ] **Step 5: Komit** `feat: seed reference and demo data from the prototype export`

---

### Task 8: Aturan akses Python + vektor bersama

**Files:**
- Create: `backend/simario/domain/access.py`, `backend/simario/domain/calendar.py`, `shared/test-vectors/access.json`, `shared/test-vectors/calendar.json`, `backend/tests/domain/test_access_vectors.py`, `backend/tests/domain/test_calendar_vectors.py`, `frontend/src/test/vectors.ts`, `frontend/src/domain/rules/access.vectors.test.ts`, `frontend/src/domain/calendar.vectors.test.ts`
- Modify: `backend/tests/vectors.py` (fixture `$demo`), `frontend/src/domain/scoreBands.vectors.test.ts` (memakai `loadVectors`), `shared/test-vectors/README.md`

**Interfaces:**
- Produces:
  - `Db = Mapping[str, list[dict[str, Any]]]`: koleksi bernama snake_case (`position_types`, `role_permissions`, …) berisi baris snake_case; ID string; tanggal string `YYYY-MM-DD`. Sama dengan `DB` prototipe setelah konversi kunci.
  - `access.py`, porting 1:1 `frontend/src/domain/rules/access.ts`: `holdings_of(db, user_id, today) -> list[Holding]`, `effective_role_ids`, `permission_scopes(db, user_id, today) -> dict[int, str | None]`, `has_permission`, `assigned_lini2`, `lini1_positions_in_scope`, `can_view_position`, `can_read_position`, `participation_holding`, `check_action`, `finalising_official(db, position_id, today) -> dict | None`, `officials_of`, `position_line`. `Holding` = TypedDict `kind`, `id`, `position_id`, `capacity`, `line`, `is_filler`. Katalog izin dibaca dari argumen `permissions` (daftar baris katalog), bukan konstanta global, agar vektor dan ORM memakai sumber yang sama.
  - `calendar.py`: `quarter_containing(quarters, day) -> dict | None`.
  - Konvensi vektor baru: nilai `input` `"$demo"` = basis data demo (TS: `buildSeed()`; Python: `demo.json["db"]` dengan kunci snake_case). `$permissions` = katalog izin. Keluaran `Map` ditulis sebagai daftar pasangan `[[code, scope], …]` urut kode.
  - `frontend/src/test/vectors.ts`: `loadVectors(json, extraFixtures?)`, yang mengganti nama fixture dan `$demo`/`$permissions` secara generik (temuan minor B0 #13).

- [ ] **Step 1: Tulis `access.json`** dari setiap kasus di `frontend/src/domain/rules/access.test.ts` (holding Pejabat/Operator, delegasi kedaluwarsa, peran turunan, cakupan Lini 1 sendiri/ditugaskan/semua, INV-12/24/25 `check_action`, Pengisi Pokja, `finalising_official`, partisipasi §1.5, `can_read_position` Lini 2 per TA dari `data/api/readAccess.test.ts`). Satu kasus per pernyataan `expect`. Tambah `calendar.json` untuk `quarterContaining` (hari pertama, hari terakhir, di luar semua triwulan).
- [ ] **Step 2: Uji TS** dengan `loadVectors` → PASS (fungsi TS sudah ada). Ubah `scoreBands.vectors.test.ts` agar memakai `loadVectors`.
- [ ] **Step 3: Uji Python** → FAIL (modul belum ada).
- [ ] **Step 4: Implementasi `access.py` dan `calendar.py`.**
- [ ] **Step 5: Jalankan** → PASS di dua sisi; ruff, mypy, `npm run lint`.
- [ ] **Step 6: Komit** `feat: port access rules with shared test vectors`

---

### Task 9: Sesi, akun lokal, kata sandi, `auth_epoch`

**Files:**
- Create: `backend/simario/accounts/{services,views,urls,serializers,middleware}.py`
- Modify: `backend/config/urls.py`, `backend/config/settings/base.py`
- Test: `backend/tests/accounts/test_local_login.py`, `test_password.py`, `test_session.py`

**Interfaces:**
- Consumes: `record` (Task 5), `clock` (Task 6), `seed_demo` untuk fixture uji (atau factory).
- Produces:
  - `GET /api/v1/auth/config` (AllowAny, `ensure_csrf_cookie`) → `{"devTools": bool, "oidcEnabled": bool}` (`oidcEnabled` = `OIDC_ISSUER` terisi).
  - `POST /api/v1/auth/login` `{nip, password}` (AllowAny, `csrf_protect`) → 200 `{"ok": true, "userId": "<uuid>"}`. Galat: `login_failed` "NIP atau kata sandi tidak sesuai"; `locked_out` dengan pesan kunci persis prototipe ("Akun dikunci sementara setelah 5 kali gagal masuk. Coba lagi dalam {n} menit."); `login_failed` "Akun Anda tidak aktif. Hubungi Superadmin.". Kunci 5× / 15 menit di `LoginLockout`, dihitung dengan `clock.now()`.
  - `POST /api/v1/auth/password` `{oldPassword?, newPassword}` (sesi wajib): kode/pesan persis `authApi.changePassword` (`not_local`, `old_password`, `too_short` minimal 12, `same`). Audit `ganti_kata_sandi` tanpa nilai; `must_change_password=False`; `auth_epoch` naik dan sesi saat ini diperbarui (sesi lain berakhir, FR-AUT-003).
  - `POST /api/v1/auth/logout` → 204.
  - `accounts.services.sign_in(request, user) -> None` (dipakai lokal, OIDC, impersonate): `login()` + `session["auth_epoch"] = user.auth_epoch`; `bump_auth_epoch(user: User) -> None`.
  - `AuthEpochMiddleware` (setelah `AuthenticationMiddleware`): sesi dengan epoch berbeda di-logout. Permintaan API berikutnya 401 `unauthenticated`.
  - `SESSION_COOKIE_AGE = 3600`, `SESSION_SAVE_EVERY_REQUEST = True`, `SESSION_COOKIE_HTTPONLY = True`, `SESSION_COOKIE_SAMESITE = "Lax"`, `CSRF_COOKIE_SAMESITE = "Lax"`.

- [ ] **Step 1: Uji yang gagal**:
  - `test_local_login_succeeds_for_local_account`.
  - `test_wrong_password_message`.
  - `test_fifth_failure_locks_for_15_minutes`.
  - `test_lock_expires_with_simulated_clock` (geser `DevClock` 16 menit).
  - `test_inactive_local_account_rejected`.
  - `test_sso_only_user_cannot_use_local_login` → `login_failed`.
  - `test_login_requires_csrf` (`APIClient(enforce_csrf_checks=True)` tanpa token → 403 `forbidden`).
  - `test_change_password_rules` (empat kode).
  - `test_change_password_audits_without_values` (`before`/`after` tanpa kata sandi).
  - `test_auth_epoch_bump_ends_session` (`bump_auth_epoch` → GET `/api/v1/me` → 401; Task 11 menyediakan `/me`, jadi di sini pakai endpoint uji yang membutuhkan sesi).
  - `test_session_expiry_is_60_minutes`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan** → PASS; regenerasi `openapi.yaml`; ruff, mypy.
- [ ] **Step 5: Komit** `feat: add local sign-in, password change and session epoch`

---

### Task 10: SSO Keycloak (OIDC)

**Files:**
- Create: `backend/simario/accounts/oidc.py`, `backend/scripts/oidc_smoke.py`
- Modify: `backend/pyproject.toml` (`mozilla-django-oidc`), `backend/config/settings/base.py`, `backend/config/urls.py`, `docker-compose.yml` (Keycloak `KC_HOSTNAME`, `KC_HOSTNAME_BACKCHANNEL_DYNAMIC`; env `api` `OIDC_BACKCHANNEL_URL`), `.env.example`, `frontend/scripts/export-seed.ts` (pengguna realm), `infra/keycloak/realm-export.json` (dihasilkan sebagian)
- Test: `backend/tests/accounts/test_oidc.py`

**Interfaces:**
- Produces:
  - URL `oidc/` → `mozilla_django_oidc.urls` (`/oidc/authenticate/`, `/oidc/callback/`; jalur peramban, boleh bergaris miring).
  - Endpoint OIDC dari `OIDC_ISSUER` (publik, untuk `authorization`) dan `OIDC_BACKCHANNEL_URL` (bawaan = `OIDC_ISSUER`; untuk `token`, `userinfo`, `certs`). Di compose `api`: `OIDC_BACKCHANNEL_URL=http://keycloak:8080/realms/otorita-ikn`. Keycloak `KC_HOSTNAME=http://localhost:8080` + `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`, agar `iss` tetap `localhost`. `OIDC_RP_SIGN_ALGO="RS256"`, `OIDC_RP_SCOPES="openid"`.
  - `SimarioOIDCBackend(OIDCAuthenticationBackend)`: `filter_users_by_claims` → pengguna dengan `nip == claims[OIDC_NIP_CLAIM]`. `create_user` tidak pernah membuat pengguna: audit `masuk_ditolak_belum_terdaftar` (entity `User`, id = NIP) dan menandai `request.session["oidc_failure"] = "belum-terdaftar"`. Pengguna nonaktif → `"tidak-aktif"`. Login sukses lewat `sign_in` (Task 9) dan mengisi `keycloak_sub` bila kosong.
  - `SimarioCallbackView`: `failure_url` = `/login?alasan=<oidc_failure|sso-gagal>`; `success_url` = `next` yang aman atau `/`.
  - Skrip ekspor (Task 2) menambah pengguna realm: setiap pengguna aktif `demo.json` + setiap entri `staffDirectory` (untuk menguji "belum terdaftar"). `username` = NIP, atribut `nip`, nama depan/belakang dari `fullName`, kata sandi `simario-demo` (khusus lokal, tercatat di `docs/05`). Skrip mengganti hanya larik `users` di `realm-export.json`.

- [ ] **Step 1: Uji yang gagal** (backend dipanggil langsung dengan klaim palsu):
  - `test_known_nip_signs_in`.
  - `test_unknown_nip_is_rejected_and_audited` (tidak ada `User` baru; audit ada; `oidc_failure == "belum-terdaftar"`).
  - `test_inactive_user_is_rejected`.
  - `test_failure_redirect_carries_reason` (`/login?alasan=belum-terdaftar`).
  - `test_backchannel_defaults_to_issuer`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi**; `npm run seed:export`; `docker compose rm -sf keycloak && docker compose up -d keycloak` (realm diimpor ulang).
- [ ] **Step 4: Jalankan** uji → PASS. Lalu `uv run python scripts/oidc_smoke.py <NIP Andi> simario-demo` → `requests.Session` mengikuti `/oidc/authenticate/` lewat `http://localhost:5173`, mengirim formulir login Keycloak, dan berakhir dengan `GET /api/v1/me` 200 berisi NIP itu. Dengan NIP `staffDirectory[0]` → berakhir di `/login?alasan=belum-terdaftar`.
- [ ] **Step 5: Komit** `feat: sign in through keycloak by nip`

---

### Task 11: `GET /me`, jabatan aktif, dan API notifikasi

**Files:**
- Create: `backend/simario/accounts/selectors.py`, `backend/simario/org/serializers.py`, `backend/simario/calendar/serializers.py`, `backend/simario/notifications/{views,urls,serializers,selectors}.py`
- Modify: `backend/simario/accounts/views.py`, `urls.py`
- Test: `backend/tests/accounts/test_me.py`, `backend/tests/notifications/test_api.py`

**Interfaces:**
- Consumes: `access.py`, `calendar.py` (Task 8), `clock` (Task 6).
- Produces:
  - `accounts.selectors.load_access_db() -> Db` (memuat semua baris org/akun yang dibutuhkan `access.py`, ID sebagai string UUID) dan `build_me(user: User) -> dict`.
  - `GET /api/v1/me` → `MeResponse`:

```json
{
  "user": {"id", "nip", "email", "fullName", "isLocalAccount", "mustChangePassword", "orgUnitId"},
  "serverNow": "2027-04-06T09:00:00+08:00",
  "today": "2027-04-06",
  "devTools": true,
  "holdings": [{"kind", "id", "positionId", "capacity", "line", "isFiller",
                "position": Position, "unitCode", "officialName", "roleView"}],
  "activePositionId": "<uuid>|null",
  "permissions": [{"code": 1, "scope": "unit"}],
  "roleViews": ["PMR", "SAD"],
  "currentQuarter": Quarter | null
}
```

  Dideklarasikan sebagai serializer DRF (`MeSerializer`, `PositionSerializer`, `QuarterSerializer`) dan dipasang di `@extend_schema`, agar `schema.d.ts` memuat `MeResponse`, `Position`, dan `Quarter`. `Position` dan `Quarter` = bentuk camelCase tipe `frontend/src/domain/types.ts`. `roleView` per holding = kode peran bawaan jenis jabatannya (menu saja). `roleViews` diurutkan `PMR, PMT, PJM, PMD, SAD`. `activePositionId` = `user.last_position` bila masih dipegang, selain itu holding pertama.
  - `PUT /api/v1/me/active-position` `{positionId}` → 204; jabatan yang tidak dipegang → 403 `forbidden`.
  - `GET /api/v1/notifications?page=` (milik sendiri, terbaru dulu, `PagePagination`), `POST /api/v1/notifications/{id}/read` (204; milik orang lain → 404), `POST /api/v1/notifications/read-all` (204).

- [ ] **Step 1: Uji yang gagal** (dengan `seed_demo`):
  - `test_me_for_andi`: holding Pejabat PPK A-1, `officialName` Andi, izin 1 ada, `currentQuarter.number == 2` pada 6 Apr 2027.
  - `test_me_for_rafi_operator`: `officialName` = Andi.
  - `test_me_without_holdings` (Nur Aini: `holdings == []`, `roleViews` memuat `PMD`).
  - `test_me_skips_orphan_delegation`: buat delegasi yang Pejabat penunjuknya sudah berakhir.
  - `test_me_requires_session` → 401 `unauthenticated`.
  - `test_active_position_persists`.
  - `test_active_position_rejects_unheld`.
  - `test_notifications_are_own_and_newest_first`.
  - `test_mark_read_other_users_notification_is_404`.
  - `test_read_all`.
  - `test_me_holdings_match_access_vectors`: hasil `build_me` untuk Andi sama dengan `holdings_of` atas `demo.json` setelah ID dipetakan `legacy_uuid`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan** → PASS; regenerasi `openapi.yaml`; ruff, mypy.
- [ ] **Step 5: Komit** `feat: add me endpoint and notification api`

---

### Task 12: Endpoint `devtools`

**Files:**
- Create: `backend/simario/devtools/{views,urls,serializers}.py`
- Modify: `backend/config/urls.py` (include hanya bila `SIMARIO_DEV_TOOLS`)
- Test: `backend/tests/devtools/test_api.py`

**Interfaces:**
- Consumes: `clock.set_now`, `scheduler.run_all`, `load_demo`, `sign_in`, `record`.
- Produces (semua AllowAny + CSRF, hanya bila `SIMARIO_DEV_TOOLS`):
  - `GET /api/v1/dev/personas` → `[{userId, nip, fullName, active, holdings: [{positionName, line, capacity}], roleViews}]` (padanan `describe()` di `LoginPage.tsx`) + `unregistered: {nip, fullName}` dari `staffDirectory[0]`.
  - `POST /api/v1/dev/impersonate` `{nip}` → logika persis `authApi.signInSso`: NIP tidak dikenal → audit `masuk_ditolak_belum_terdaftar` + `login_failed` dengan pesan "Akun Anda belum terdaftar di SIMARIO. …"; nonaktif → "Akun Anda tidak aktif. Hubungi Superadmin."; sukses → `sign_in` + `{"ok": true, "userId"}`.
  - `POST /api/v1/dev/clock` `{at: "YYYY-MM-DDTHH:mm"}` → `set_now`, `run_all`, lalu `{"serverNow", "ran": [nama tugas]}`.
  - `POST /api/v1/dev/reset` `{asOf?: "YYYY-MM-DDTHH:mm"}` → `load_demo(as_of)` lalu logout sesi pemanggil → `{"counts": {...}}`.
  - Latensi, "gagalkan panggilan berikutnya", dan luring disimulasikan **di klien** (`client.ts`, Task 13). Spec §4.5 menyebut endpoint backend; efeknya bagi pengguna sama dan alat dev tidak perlu tahu sisi mana yang melayani. *(Keputusan rencana ini.)*

- [ ] **Step 1: Uji yang gagal**:
  - `test_impersonate_known_nip`.
  - `test_impersonate_unknown_nip_audits`.
  - `test_impersonate_inactive_message`.
  - `test_clock_sets_now_and_runs_tasks`.
  - `test_reset_reloads_and_signs_out`.
  - `test_personas_lists_users_and_unregistered`.
  - `test_dev_endpoints_404_without_dev_tools` (`override_settings(SIMARIO_DEV_TOOLS=False)` + muat ulang URLconf).
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan** → PASS; regenerasi `openapi.yaml` (endpoint dev tetap ada di skema lokal; ditandai tag `dev`); ruff, mypy.
- [ ] **Step 5: Komit** `feat: add dev endpoints for personas, clock and reset`

---

### Task 13: Lapisan HTTP frontend dan jembatan ID

**Files:**
- Create: `frontend/src/data/errors.ts`, `frontend/src/data/http/client.ts`, `legacyIds.ts`, `auth.ts`, `me.ts`, `notifications.ts`, `dev.ts`; uji `client.test.ts`, `legacyIds.test.ts`, `auth.test.ts`; `frontend/src/test/fetchMock.ts`
- Modify: `frontend/src/data/local/call.ts` (impor `ApiError` dari `data/errors.ts`), `frontend/src/data/repository.ts`, `npm run api:types`

**Interfaces:**
- Produces:
  - `data/errors.ts`: `class ApiError(code, message, details?)` (dipindah; `repository.ts` dan `local/call.ts` mengimpor dari sini).
  - `client.ts`: `apiFetch<T>(path: string, init?: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> }): Promise<T>`.
    - Basis `/api/v1`; `credentials: 'same-origin'`; header `X-CSRFToken` dari cookie `csrftoken` untuk metode selain GET.
    - Badan galat → `ApiError(code, message, details)`. Galat jaringan → `ApiError('offline', 'Anda sedang luring. Periksa jaringan Anda, lalu coba lagi.')`.
    - `401` dengan `code === 'unauthenticated'` memanggil `setUnauthenticatedHandler(fn)`.
    - Menghormati `useDevSettings` (`latency`, `offline`, `failNext`) dengan perilaku dan pesan sama seperti `local/call.ts`.
    - Menerapkan `toBackendIds` pada `body`/`query` dan `toLocalIds` pada jawaban.
  - `legacyIds.ts`: `toBackendIds<T>(v: T): T`, `toLocalIds<T>(v: T): T` — rekursif. String yang sama dengan ID yang dikenal diganti. UUID di dalam string (regex UUID) diganti bila dikenal. Yang tidak dikenal dibiarkan. Sumber: `legacy-ids.json` (Task 2). **Dihapus di B9.**
  - `auth.ts` (`authApi` HTTP, tanda tangan sama dengan `repository.ts`):
    - `signInSso(nip)` → `POST /dev/impersonate` → `SsoOutcome`, dengan `login_failed` dipetakan ke `{ok:false, message}`.
    - `signInLocal(nip, password)` → `POST /auth/login` → `SsoOutcome`, dengan `login_failed`/`locked_out` dipetakan ke `{ok:false, message}`.
    - `startSso(next: string): void` → `window.location.assign('/oidc/authenticate/?next=' + encodeURIComponent(next))`.
    - `changePassword(userId, input)` → `POST /auth/password`.
    - `signOut()` → `POST /auth/logout`.
    - `config()` → `GET /auth/config`.
  - `me.ts`: `meApi.get(): Promise<MeResponse>`, `meApi.setActivePosition(positionId: string): Promise<void>`. Tipe `MeResponse` dari `schema.d.ts`.
  - `notifications.ts`: `notificationApi.list(userId)` (mengambil semua halaman), `markRead(id)`, `markAllRead(userId)`.
  - `dev.ts`: `devApi.personas()`, `impersonate(nip)`, `setClock(at)`, `reset(asOf?)`.
  - `repository.ts`: `authApi` dan `notificationApi` diekspor ulang dari `data/http/`; namespace lain tetap lokal.

- [ ] **Step 1: Uji yang gagal**:
  - `client.test.ts`: amplop galat → `ApiError` dengan code/message/details; CSRF terkirim pada POST; 401 `unauthenticated` memanggil handler, 401 `login_failed` tidak; `failNext` menghasilkan galat `server` sekali; `latency` menunda.
  - `legacyIds.test.ts`: `usr-andi` ↔ UUID; UUID tak dikenal tidak berubah; `targetUrl` `/jabatan/<uuid PPK A-1>/papan/2027` → `/jabatan/pos-ppk-a1/papan/2027`; objek bersarang dan larik.
  - `auth.test.ts`: `signInLocal` mengubah `locked_out` menjadi `{ok:false, message}` dengan pesan server.
- [ ] **Step 2: Jalankan** `npx vitest run src/data/http` → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan** → PASS; `npm run lint`, `npm run build`.
- [ ] **Step 5: Komit** `feat: add http client and id bridge for migrated namespaces`

---

### Task 14: Frontend memakai `/me`, login backend, notifikasi, dan DevPanel

**Files:**
- Create: `frontend/src/state/me.ts`, `frontend/src/test/meFromLocal.ts`
- Modify: `frontend/src/state/useAuth.ts`, `frontend/src/state/session.ts`, `frontend/src/test/setup.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx` (penjaga rute menunggu `/me`), `frontend/src/pages/auth/LoginPage.tsx`, `ChangePasswordPage.tsx`, `frontend/src/layout/AppShell.tsx` (batas tidak aktif → `authApi.signOut`), `layout/Sidebar.tsx` (pemilih jabatan → `meApi.setActivePosition`), `frontend/src/components/NotificationPanel/NotificationPanel.tsx`, `frontend/src/pages/notifications/NotificationsPage.tsx`, `frontend/src/dev/DevPanel.tsx`; uji terkait
- Test: `frontend/src/state/useAuth.test.ts`, pembaruan `pages/notifications/notifications.test.tsx`, `layout/AppShell.test.tsx`, `pages/auth/*.test.tsx`

**Interfaces:**
- Consumes: semua dari Task 13; `MeResponse` (Task 11).
- Produces:
  - `useMe` (zustand): `{ me: MeResponse | null; status: 'idle' | 'loading' | 'ready' | 'anonymous' | 'error'; refresh(): Promise<void>; clear(): void }`. Setelah `ready`, `useSession.signIn(me.user.id)` (ID sudah lokal lewat jembatan) bila berbeda, agar modul lokal tetap mengenali aktor. `useClock.setNow(me.serverNow)` bila `me.devTools`.
  - `useAuth()` / `useMaybeAuth()` membangun `AuthContext` dari `useMe`. Bentuknya tetap: `user` (tipe `MeUser`), `today`, `holdings`, `active` (holding aktif + `position`, `unitCode`, `officialName`), `permissions` (`Map`), `can`, `roleViews`, `roleView` (= pilihan sesi ∨ `active.roleView` ∨ terakhir), `currentQuarter`, `currentFiscalYear`. `buildAuthContext` lokal pindah ke `test/meFromLocal.ts` sebagai `meFromLocal(db, userId, day): MeResponse`.
  - `test/setup.ts`: `fetch` dipalsukan (`fetchMock.ts`). `/api/v1/me` dijawab `meFromLocal(getDb(), useSession.userId, today)`, dan perubahan `useSession.userId` di uji langsung mengisi `useMe`, agar uji halaman yang ada tetap memakai `useSession.signIn('usr-andi')`.
  - `LoginPage`:
    - "Masuk dengan SSO" → `authApi.startSso(kembali ?? '/')`.
    - Bila `config().devTools`, tampil tombol teks "Masuk sebagai persona (mode pengembangan)" yang membuka pemilih yang ada, berisi data dari `devApi.personas()` dan memanggil `authApi.signInSso(nip)`.
    - `?alasan=belum-terdaftar` / `tidak-aktif` / `sso-gagal` menampilkan pesan PRD yang sama dengan jalur prototipe.
    - Setelah sukses: `useMe.refresh()` lalu navigasi seperti sekarang.
  - `main.tsx` asinkron: `?sebagai=<id prototipe>` → cari NIP di basis data lokal → `devApi.impersonate(nip)`; `?waktu=` → `devApi.setClock` + jam lokal; `&data=sesuai` → `devApi.reset(at)` + reset lokal. Lalu `useMe.refresh()`, lalu render.
  - `DevPanel`: "Masuk sebagai" → `devApi.impersonate`; geser tanggal → `devApi.setClock` + jam lokal; "Sesuaikan data ke tanggal ini" dan "Atur ulang data contoh" → `devApi.reset` + reset lokal + `useMe.refresh()`.
  - `NotificationPanel` dan `NotificationsPage` membaca `notificationApi.list` lewat `useQuery` (dua berkas ini keluar dari daftar U-01). Lonceng hanya menampilkan notifikasi backend; notifikasi yang ditulis modul lokal tidak tampil sampai modulnya pindah (diterima selama transisi, spec §4.10).

- [ ] **Step 1: Uji yang gagal**:
  - `useAuth.test.ts`: `MeResponse` Rafi → `active.capacity === 'operator'`, `officialName` Andi; `roleView` mengikuti pilihan sesi.
  - `test_unauthenticated_redirects_to_login`: handler 401 → navigasi `/login?alasan=sesi-berakhir` dan `useMe.status === 'anonymous'`.
  - `notifications.test.tsx` versi HTTP: daftar dari mock, "Tandai semua dibaca" memanggil `POST /notifications/read-all`.
  - `LoginPage`: pesan `belum-terdaftar` dari `?alasan`; tombol persona hanya bila `devTools`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan** `npm run test`, `npm run lint`, `npm run build` → lulus.
- [ ] **Step 5: Uji manual** (`docker compose up -d`, `seed_demo`, `npm run dev`):
  - Masuk lewat Keycloak sebagai Andi (`simario-demo`).
  - Masuk lewat persona sebagai Rafi, Siti, Hendra, Nur Aini, dan Admin DKB: sidebar, pemilih jabatan, dan menu sama seperti prototipe.
  - Akun lokal: login dengan sandi salah lima kali → terkunci.
  - SSO NIP belum terdaftar → pesan PRD.
  - Geser tanggal di DevPanel → `/me.today` dan jam lokal ikut.
  - Lonceng menampilkan notifikasi Andi dan "Tandai dibaca" bertahan setelah muat ulang.
  - Tanpa galat konsol.
- [ ] **Step 6: Komit** `feat: sign in and load user context from the backend`

---

### Task 15: Dokumen dan checkpoint B1

**Files:**
- Modify: `docs/03_api_contract.md`, `docs/01_backend.md`, `docs/05_local_dev_and_testing.md`, `docs/02_frontend.md`, `docs/04_risk_and_debt.md`, `docs/00_arsitektur.md`, `CLAUDE.md`

- [ ] **Step 1: Dokumen**:
  - `03` §3 dan §4.1–4.2: endpoint `/me`, `auth/*`, `notifications`, `dev/*` diputuskan; kode `login_failed`/`locked_out`; jalur `oidc/`.
  - `01` §1: model B1 ada; `RiskProposal` di B3.
  - `05` §2a: `npm run seed:export`, `seed_demo`/`seed_reference`, sandi persona Keycloak `simario-demo`, impor ulang realm, uji asap OIDC.
  - `02`: `data/http/`, jembatan ID, `useMe`.
  - `04`: U-04 sebagian selesai (epoch ada, pemicu di B2); U-01 berkurang dua berkas; risiko baru "jembatan ID sementara" (Rendah, dihapus B9).
  - `00` §6: keputusan A-13 (data demo = ekspor seed prototipe) dan A-14 (jembatan ID sementara).
- [ ] **Step 2: Jalankan semua gerbang**: frontend `build`/`test`/`lint`; backend `pytest`/`ruff check`/`ruff format --check`/`mypy`; `docker compose ps` sehat; uji asap OIDC.
- [ ] **Step 3: Centang B1 di CLAUDE.md** dan komit `feat: move identity and user context to the backend (checkpoint B1)`. Komit hanya berkas B1 (`git add` per jalur; penghapusan `Simario.pen` dan screenshot milik pengguna tidak ikut).
- [ ] **Step 4: Laporan checkpoint** (Bahasa Indonesia): yang selesai, cara mencoba (persona + sandi + URL), uji, perbedaan dari spec (simulasi latensi/galat di klien; tombol SSO kini ke Keycloak dan pemilih persona menjadi tombol mode pengembangan), dan yang tertunda. Lalu tanya: "Lanjut ke Tahap B2?"
