# Backend B3 — Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Register module (REG), risk proposals and `risk_quarters` from the browser prototype to Django, with `registerApi.view` as the single read model.

**Architecture:** New app `simario.registers` (models, selectors, services, views) ports `frontend/src/data/api/register.ts` and `registerView.ts` 1:1 (same checks, error copy, audit actions, notifications). Pure rules go to `simario/domain/register.py` with shared vectors. `RiskProposal` joins `reference`, `RiskQuarter` starts `simario.assessments`. The frontend swaps `registerApi` to `data/http/register.ts`; the Register page reads the server view through a small view cache and reloads it after each mutation.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16, pytest; React 18 + Vitest.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§4.2, §4.3, §4.8, §4.9, §5, §6 B3)

## Global Constraints

- Permission codes only (1–26); content actions through `access.check_action` on the acting position (drafting 2, publish/deactivate 3, proposals 12/13).
- Business time from `simario.core.clock`; WITA.
- Error codes and Indonesian messages verbatim from `register.ts` (`DENY` table, `published`, `has_published`, `has_drafts`, `stage_not_relevant`, `empty`, `nothing`, `gaps`, `archived`, `no_previous`, `not_empty`).
- Audit action names verbatim (`buat_register`, `pilih_risiko`, `hapus_risiko_draf`, `tambah_risiko_sendiri`, `pilih_mitigasi`, `hapus_mitigasi_draf`, `tambah_mitigasi_sendiri`, `nyatakan`, `batalkan_pernyataan`, `ubah_alasan_pernyataan`, `ubah_data_umum`, `tandai_siap_register`, `tandai_siap_tambahan`, `terbitkan_register`, `terbitkan_tambahan`, `nonaktifkan_risiko`, `nonaktifkan_mitigasi`, `salin_register`, `tolak_usulan`, `terima_usulan`), `acting_as` = holding capacity, `acting_position` = register position.
- Demo data keeps uuid5 ids (`legacy_uuid`), so prototype links keep working through the id bridge.
- Commits: `type: imperative lowercase`, no Co-Authored-By. Only B3 files staged.
- Tests: only the related paths (user instruction); full suites at the end of B9.

## Review Focus

1. Reader vs holder visibility (FR-REG-012): readers in scope never receive draft/ready items or a never-published register. Test: Task 3 `test_reader_sees_published_items_only`.
2. Operator vs Pejabat (INV-12/24): Operator drafts and marks ready, cannot publish/deactivate; Pokja member who is not Pengisi cannot draft. Test: Task 4 `test_pokja_member_cannot_draft`, Task 5 `test_operator_cannot_publish`.
3. Publish gates and side effects: gaps block with the numbered list; additions create RiskQuarter rows only for the current quarter, proposals for custom risks, Lini 2 notifications once. Test: Task 5.
4. Archived fiscal year read-only for every mutation. Test: Task 4 `test_archived_year_refuses_edits`.
5. Frontend view refresh: after a mutation the page shows the server state; a failing view load shows the error + "Coba Lagi", not a blank page. Test: Task 7.

---

### Task 1: Models, migrations, demo seed

**Files:** Create `backend/simario/registers/{apps,models}.py` + migrations; `backend/simario/assessments/{apps,models}.py` + migrations; Modify `backend/simario/reference/models.py` (`RiskProposal`), `backend/config/settings/base.py` (INSTALLED_APPS), `backend/simario/devtools/seed.py` (collections `registers`, `declarations`, `risks`, `mitigations`, `proposals`, `riskQuarters`; `dataUmum` keys snake_case except `extra`), `backend/simario/core/collections.py` (rows for those collections), `REST_FRAMEWORK` ignore_fields (`extra` already).
**Interfaces — Produces:** `Register(position, fiscal_year, status, data_umum, data_umum_form, copied_from, published_at/by, updated_at/by, ready_at/by)` unique (position, fiscal_year); `RegisterStageDeclaration(register, stage, risk_type null, kind, reason)`; `RegisterRisk(register, stage, risk_type, risk_template PROTECT null, description_snapshot, is_custom, status, published_at, deactivated_at, deactivated_from_quarter null, deactivation_reason, previous_year_risk null, lineage_id, flags JSON, order, created_at/by, ready_at, impact/likelihood/score null)`; `RegisterMitigation(register_risk CASCADE, mitigation_template SET_NULL, description_snapshot, is_custom, order, status, deactivation_reason, published_at, created_at/by, ready_at)`; `RiskProposal(source_register_risk, description, proposer, status, rejection_reason, created_at)`; `RiskQuarter(register_risk, quarter, comparison_status, first_opened_at, recurring, no_step_flag)` unique (register_risk, quarter).
- [ ] Test `tests/registers/test_seed.py::test_demo_registers_loaded` — counts 6 / 12 / 28 / 53 / 2 / 41, PPK A-1 2027 published, `data_umum["besar_anggaran"]` numeric.
- [ ] FAIL → models + seed → PASS. Commit `feat: add register models and demo data`.

### Task 2: Register rules + shared vectors

**Files:** Create `backend/simario/domain/register.py`, `shared/test-vectors/register.json`, `backend/tests/domain/test_register_vectors.py`, `frontend/src/domain/register.vectors.test.ts`.
**Produces:** `register_stages(db, register) -> list[Row]`, `register_gaps(db, register_id) -> list[Gap]` (same `kind`, `message`, `anchor`, `stage_id`, `risk_type`, `field`), `complete_stages`, `deactivation_quarter(quarters, current)`, `assessed_in_quarter(db, risk, quarter)` over plain dicts (snake_case db from `$demo`).
- [ ] Vectors from the demo: gaps of an empty draft PPK register, PPK A-1 2027 (none), declaration without reason; `deactivationQuarter` TW I→II, TW IV→null; `assessedInQuarter` published/inactive cases.
- [ ] Both sides FAIL → implement → PASS. Commit `feat: share register rules with the backend`.

### Task 3: Read model `GET /api/v1/registers/{pos}/{ta}`

**Files:** Create `backend/simario/registers/{selectors,serializers,views,urls}.py`; Test `backend/tests/registers/test_register_view.py`.
**Produces:** `build_register_view(user, position_id, fiscal_year) -> dict` = prototype `RegisterView` + `previousRegister: bool`, `stagesDone: {complete,total}`, `flagged: RegisterRisk[]` (would publish without mitigation). Read access via `access.can_read_position` → 403 `forbidden`; unknown position 404.
- [ ] Tests: holder sees drafts and gaps; `test_reader_sees_published_items_only` (Siti on PPK A-1 2027, plus an added draft risk hidden); out-of-scope 403; unpublished register for reader → `unpublishedForReader`.
- [ ] FAIL → PASS. Commit `feat: serve the register view from the backend`.

### Task 4: Drafting services

**Files:** Create `backend/simario/registers/services.py`; Modify views/urls; Test `backend/tests/registers/test_drafting_api.py`.
**Produces:** `POST/DELETE /registers/{pos}/{ta}/risks` (`{templateId}` | `{stageId, riskType, description}`), `DELETE /register-risks/{id}`, `POST/DELETE /register-risks/{id}/mitigations` (`{mitigationTemplateId}` | `{text}`), `DELETE /register-mitigations/{id}`, `PUT /registers/{pos}/{ta}/declarations` (`{stageId, riskType, on, force}`), `PATCH …/declarations/reason`, `PATCH /registers/{pos}/{ta}` (Data Umum). Ports `ensureRegister`, `touch`, `touchItem`, `clearDeclarationFor`, `assertStageOpen`.
- [ ] Tests (ports of register.test.ts): `test_pokja_member_cannot_draft`, operator drafts, `test_archived_year_refuses_edits`, template mitigations not pre-ticked, declaration asks (`has_drafts`, `details.count`), ready → draft on next edit.
- [ ] FAIL → PASS. Commit `feat: draft registers through the backend`.

### Task 5: Ready, publish, deactivate, copy, `risk_quarters`, usage

**Files:** Modify services/views/urls; Create `backend/simario/registers/tasks.py`; Replace stubs in `backend/simario/registers/usage.py`; Test `backend/tests/registers/test_publish_api.py`, update `tests/registers/test_usage_stub.py` → `test_usage.py`.
**Produces:** `POST …/mark-ready`, `POST …/publish` (→ `PublishSummary`), `POST /register-risks/{id}/deactivate`, `POST /register-mitigations/{id}/deactivate`, `POST …/copy-from-previous` (→ `CopySummary`); task `risk_quarters`; real `template_usage`, `template_ever_used`, `stage_used`, `running_registers_of_positions`, `published_registers`.
- [ ] Tests: gaps list (`code gaps`, message "Register belum dapat diterbitkan: N hal perlu dilengkapi"); `test_operator_cannot_publish`; additions publish creates RiskQuarter for current quarter, proposal for custom risk, one Lini 2 notification each; deactivate reason + next quarter / TW IV null; copy drafts nothing published; risk_quarters task idempotent; usage counts from demo.
- [ ] FAIL → PASS. Commit `feat: publish registers through the backend`.

### Task 6: Risk proposals

**Files:** Modify `backend/simario/reference/{services,views,urls}.py`; Test `backend/tests/reference/test_proposals_api.py`.
**Produces:** `GET /api/v1/proposals?status=` → rows `{id, description, status, rejectionReason, createdAt, proposerName, positionName, positionTypeId, positionTypeName, stageId, stageName, riskType, mitigations[]}` (izin 13); `POST /proposals/{id}/reject {reason}`; `POST /proposals/{id}/accept` (template body, izin 12+13) → `{id}` via `save_template` + `terima_usulan` + notification.
- [ ] FAIL → PASS. Commit `feat: move risk proposals to the backend`.

### Task 7: Frontend Register via API

**Files:** Create `frontend/src/data/http/register.ts`, `frontend/src/lib/useRegisterView.ts`; Modify `repository.ts`, `pages/register/{RegisterPage,RiskCard,DataUmumSection,StageSection}.tsx`, `App.tsx` (route gate with master collections), `data/api/registerView.ts` (same extra fields locally), `test/fakeBackend.ts`; Test `pages/register/register.test.tsx` async.
- [ ] Tests async; view load error shows "Coba Lagi".
- [ ] Commit `feat: run the register page through the backend`.

### Task 8: Frontend proposals via API

**Files:** `frontend/src/data/http/master.ts` (proposal methods + `proposalApi.list`), `pages/master/ProposalsPage.tsx`, fake backend; Test `pages/master/master.test.tsx`.
- [ ] Commit `feat: review risk proposals through the backend`.

### Task 9: Docs + checkpoint B3

Docs `01`–`06` (REG decided, U-21 partly resolved: register usage real; assessment stub stays), CLAUDE.md ticks; related gates; final review on most capable model, one fix pass; commit `feat: move registers to the backend (checkpoint B3)`; continue to B4 without waiting (user instruction).
