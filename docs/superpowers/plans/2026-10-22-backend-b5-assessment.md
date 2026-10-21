# Backend B5 — Penilaian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move quarterly assessment (NIL) to Django: the assessment page and Lini 3 queue as read models with VIS-1/5/9 in selectors, cell saving with evidence files, Tandai Siap / Tuntaskan / Buka Kembali, comparison opening (`comparisons` task, after every finalise), Berulang, explanations, the Superadmin blind view, and the INV-16/17 API tests.

**Architecture:** `simario.assessments` gains selectors, services, views and the `comparisons` scheduled task, porting `frontend/src/data/api/assessment.ts`, `data/local/comparisons.ts` and `domain/rules/{assessment,comparison}.ts` 1:1. Pure rules go to `simario/domain/{assessment,comparison}.py` with shared vectors. Evidence files reuse `simario.board.files` (upload, scan, presigned download) with `owner_kind="assessment"`. `assessments/usage.py` (U-21) gets real bodies. The demo reset `as_of` trims data like `seed/asOf.ts`. The frontend swaps `assessmentApi` to HTTP.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16, Celery; React 18 + Vitest.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§4.8 `comparisons` + U-07 triggers, §4.9 vectors, §5 INV-16/17, §6 B5)

## Global Constraints

- Permission codes only (5 Lini 1 assess, 9 Lini 3 assess, 23 blind view, 10 confidential…, exactly as `assessment.ts` `actorFor`); Pejabat-only actions through `access.check_action`.
- VIS-1 (blind Lini 3 drafts), VIS-5/VIS-9 (late directorate) and INV-17 (confidential) in selectors, never in serializers or the client.
- Predicates compared, not scores (RB-NIL-003); explanation mandatory only when Lini 1 higher (RB-NIL-006); lateness fixed once at finalise/send; INV-18 frozen after opening.
- Error copy and audit action names verbatim from `assessment.ts` (`simpan_penilaian`, `siap_penilaian`, `tuntaskan_penilaian`, `buka_kembali_penilaian`, `kirim_penjelasan`, `lihat_buta`, …); notifications and `eventKey`s as `comparisons.ts`.
- Scores never leave the API except where the prototype shows them (the viewer's own `selectedValue`); cells carry `optionLabel`.
- Clock: `simario.core.clock`. Commits without Co-Authored-By. Related tests only (full suites at the end of B9).

## Review Focus

1. INV-16: a Lini 3 assessor (and Lini 1, Lini 2, readers) never receives another directorate's draft or unopened assessment, not even its predicate or option label; Superadmin only with `?blind=1` + permission 23, logged. Test: Task 2 `test_inv16_blind_drafts_never_served`.
2. INV-17: confidential evidence on assessments returns only a count without permission 10. Test: Task 2 `test_inv17_confidential_evidence_hidden`.
3. Opening idempotent under clock jumps: running `comparisons` twice, or after jumping weeks ahead, opens each result once and sends each notification once. Test: Task 4 `test_comparisons_idempotent_after_jump`.
4. Concurrent finalise of two assessors on the same risk-quarter opens results once (row lock on RiskQuarter). Test: Task 4 `test_finalise_locks_risk_quarter`.
5. Reopen after the comparison opened, or saving a frozen cell, is refused with the prototype message. Test: Task 3.

---

### Task 1: Assessment and comparison rules + vectors

Files: `backend/simario/domain/{assessment,comparison}.py`, `shared/test-vectors/assessment.json` (generated from the TS implementation on the demo seed at several clock points), `backend/tests/domain/test_assessment_vectors.py`, `frontend/src/domain/rules/assessment.vectors.test.ts`.
Produces Python ports of `windowOpen`, `bandVersionFor`, `predicateIn`, `optionLabelOf`, `quarterRisks`, `resultOpened`, `assessmentFrozen`, `comparisonStatusAt`, `finaliseLateness`, `explanationLateness`, `pendingExplanationLateness`, `lini3Overdue`, `evaluateOpening` (over a mutable Db), `previousRiskQuarter`, `isRecurring`, `compareAssessments`, `explanationDueOn`.
- [ ] Vectors pass in Vitest and pytest.
- Commit `feat: share assessment rules with the backend`.

### Task 2: Read models + INV-16/17

Files: `backend/simario/assessments/{selectors,serializers,views,urls}.py`, `config/urls.py`; Tests `tests/assessments/test_assessment_view.py`, `test_queue_view.py`.
Produces `GET /api/v1/positions/{pos}/assessments/{ta}/{tw}[?blind=1]` (`AssessmentView`), `GET /api/v1/assessment-queue[?quarterId=]` (`QueueView`), `GET /api/v1/positions/{pos}/assessments/{ta}/{tw}/finalise-preview?assessorPositionId=` (`FinalisePreview`).
- [ ] Tests: modes lini1/lini3/reader; window not open; `test_inv16_blind_drafts_never_served`; `test_inv17_confidential_evidence_hidden`; late directorate (VIS-9); blind view refused without permission 23; queue statuses incl. `belum_terbit`.
- Commit `feat: serve assessments and the lini 3 queue from the backend`.

### Task 3: Mutations

Files: `backend/simario/assessments/services.py`, views/urls; Modify `board/files.py` only to accept `owner_kind="assessment"`; Test `tests/assessments/test_assessment_api.py`, `test_explanations_api.py`.
Produces `PATCH /risk-quarters/{rq}/assessments/{assessorPos}` (CellPatch), `POST …/files` (multipart), `DELETE /attachments/{id}` for assessment evidence, `POST /positions/{pos}/quarters/{q}/assessments/{assessorPos}/ready|finalise`, `POST /assessments/{id}/reopen`, `PATCH /results/{id}/explanation`, `POST /positions/{pos}/explanations/ready|send` `{resultIds}`, `POST /positions/{pos}/quarters/{q}/blind-view`.
- [ ] Ports of every check, audit and notification; Operator ready vs Pejabat finalise; `no_evidence` flag; lateness at finalise/send; frozen refusals.
- Commit `feat: assess risks through the backend`.

### Task 4: `comparisons` task, Berulang, usage

Files: `backend/simario/assessments/{comparisons,tasks,usage}.py`; Tests `tests/assessments/test_comparisons.py`, `test_usage.py`.
Produces `run_comparisons(as_of, rq_ids=None)` registered as scheduler `comparisons` + Celery task, called after finalise (and after `drop_assessor`); recurrence + notifications FR-NTF-007/008/009 as `comparisons.ts`; `usage.py` real bodies (U-21).
- [ ] Tests: partial vs full opening; Tidak dinilai Lini 1 at deadline; Berulang across fiscal years; `test_comparisons_idempotent_after_jump`; `test_finalise_locks_risk_quarter`; usage functions.
- Commit `feat: open comparisons in the backend`.

### Task 5: Demo reset as of a date

Files: `backend/simario/devtools/seed.py` (`_as_of` trimming ported from `seed/asOf.ts`); Test `tests/devtools/test_reset_as_of.py`.
- [ ] Reset at 2027-03-18T09:00: TW I results gone, assessments finalised later gone, quarter band versions unlocked, risk-quarters recomputed; at 2027-04-03 partial opening reproducible by `run_comparisons`.
- Commit `feat: reset demo data to an earlier date in the backend`.

### Task 6: Frontend assessment via API

Files: `frontend/src/data/http/assessment.ts`, `repository.ts`, `pages/assessment/{AssessmentPage,AssessmentRow,QueuePage}.tsx` (real files, async preview), `data/http/migrated.ts` (+`penilaian`), fake backend routes `test/fakeAssessmentRoutes.ts`; Tests `pages/assessment/assessment.test.tsx` async, `migrated.test.ts`.
- Commit `feat: run assessments through the backend`.

### Task 7: Docs + checkpoint B5

Docs 01–06, CLAUDE.md ticks + note (U-21 resolved); related gates; final review (most capable model) + one fix pass; commit `feat: move quarterly assessment to the backend (checkpoint B5)`; continue to B6 without waiting (user instruction).
