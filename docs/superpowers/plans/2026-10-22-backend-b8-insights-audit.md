# Backend B8 — Metrik & Jejak Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move product metrics (FR-ADM-011, `/metrik` + CSV) and the audit trail (FR-ADM-008, `/jejak-audit`) to Django, with VIS-8 redaction on the server and "Tampilkan nilai asli" behind permission 24, logged.

**Architecture:** New app `simario.insights` (`metrics.py`, `audit_trail.py`, views, urls) porting `frontend/src/data/api/insights.ts`. Metrics read the rule Db (`assessment_db`) with the B6 indexes. The audit trail reads `AuditLog` with filters in SQL, scope by permission 23, then redacts per row (VIS-8) from the assessment freeze state and confidential file names. The frontend swaps `insightsApi` to HTTP; filter choices come from a facets endpoint and the gate collections instead of the local store.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16; React 18 + Vitest.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§6 B8)

## Global Constraints

- Permission codes: 22 metrics, 23 audit (scope sendiri/unit/semua), 24 original values (each use logged as `tampilkan_nilai_asli`).
- VIS-8: blind assessment values (`score`, `predicate`, `note`) read `[disamarkan]` while the assessment is not frozen; confidential file names read `[konfidensial]` without permission 10; scores read as the chosen statement (PRD v2.8). Applied on the server before the rows leave.
- Copy verbatim from `insights.ts`. Metric 8 stays "Data belum cukup".
- Clock: `simario.core.clock`. Commits without Co-Authored-By. Related tests only (full suites at the end of B9).

## Review Focus

1. A blind Lini 3 draft's score never appears in audit rows for a viewer without permission 24 (including `before`/`after` of `simpan_draf_penilaian`). Test: Task 2 `test_audit_redacts_blind_scores`.
2. `?original=1` without permission 24 is refused; with it the call is logged. Test: Task 2 `test_original_needs_24_and_is_logged`.
3. Scope `unit` shows only entries of the viewer's units; `sendiri` only their own. Test: Task 2 `test_audit_scope`.
4. Metrics match the prototype on the demo seed (same numerators/denominators). Test: Task 1 `test_metrics_match_prototype` against a vector generated from `buildMetrics`.
5. CSV export escapes quotes in titles/labels. Test: Task 1 `test_csv_quotes`.

---

### Task 1: Metrics

Files: `backend/simario/insights/{apps,metrics,views,urls}.py`, settings; `shared/test-vectors/metrics.json` (from `buildMetrics` on the demo seed at two dates); Tests `tests/insights/test_metrics.py`, frontend vector test.
Produces `GET /api/v1/metrics/{ta}` (`MetricCard[]`), `GET /api/v1/metrics/{ta}.csv`.
- Commit `feat: serve product metrics from the backend`.

### Task 2: Audit trail

Files: `backend/simario/insights/audit_trail.py`, views/urls; Test `tests/insights/test_audit_trail.py`.
Produces `GET /api/v1/audit[?from&to&actor&position&entityType&action&original=1]` (`AuditRow[]`), `GET /api/v1/audit/facets` (`{actions, entityTypes}`).
- Commit `feat: serve the audit trail from the backend`.

### Task 3: Frontend metrics and audit via API

Files: `frontend/src/data/http/insights.ts`, `repository.ts`, `pages/admin/{AuditPage,MetricsPage}.tsx` (no store reads), `data/http/migrated.ts` (+`metrik`, `audit`), fake routes; Tests `pages/admin/admin.test.tsx` relevant cases.
- Commit `feat: run metrics and the audit trail through the backend`.

### Task 4: Docs + checkpoint B8

Docs 01–06, CLAUDE.md ticks + note; related gates; final review + one fix pass; commit `feat: move metrics and the audit trail to the backend (checkpoint B8)`; continue to B9 without waiting.
