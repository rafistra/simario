# Backend B6 — Riwayat, Notifikasi, Beranda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move history (RWY), the deadline reminders (NTF `reminders`), the Beranda (BRD) and the position lists `/jabatan` and `/pantauan` to Django, so every Lini 1/2/3 page except Lembar, Metrik and Jejak Audit runs on the backend.

**Architecture:** History and home are read-only views over existing models, so they live in `simario.home` (`selectors`, `views`, `urls`) and `simario.assessments` (`history.py`), porting `frontend/src/data/api/{history,home}.ts`. Lembar Mutu (`domain/rules/sheets.ts`) moves to `simario/domain/sheets.py` with shared vectors, reused by B7. `reminders` ports `data/local/reminders.ts` as a scheduled task. The frontend swaps `historyApi` and `homeApi` to HTTP; the trial Beranda (`TrialHome`) is removed.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16; React 18 + Vitest.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§4.8 `reminders`, §4.9 vectors, §6 B6)

## Global Constraints

- VIS rules in selectors: history cells, Lembar Mutu and Beranda cards apply VIS-1/2/5/9 exactly as `history.ts`/`home.ts` (they call `canSeeAssessment`, `isLateDirectorate`, `latestOpenedQuarter`).
- Scores never shown (PRD v2.8): history cells carry option labels and predicates only.
- Reminders idempotent per event key; nothing raised for moments older than 3 days (`RECENT_DAYS`); copy and kinds verbatim from `reminders.ts`.
- Clock: `simario.core.clock`. Commits without Co-Authored-By. Related tests only (full suites at the end of B9).

## Review Focus

1. History of a late directorate (VIS-9) shows nothing of other assessors for the quarters whose own result has not opened. Test: Task 2 `test_history_late_directorate`.
2. Lembar Mutu predicates computed from the same rows as the prototype (vectors), including "Tidak dinilai" and incomparable rows. Test: Task 1 vectors.
3. Reminders after a far clock jump raise nothing stale and are not duplicated on re-run. Test: Task 4 `test_reminders_idempotent_and_recent_only`.
4. Beranda for every persona kind (Lini 1 Pejabat/Operator, Lini 2, Lini 3, Superadmin, PMD without holding, empty) returns the cards FR-BRD-010 lists. Test: Task 3 `test_home_cards_per_persona`.
5. `/jabatan` and `/pantauan` list only positions in the viewer's scope. Test: Task 3 `test_position_list_scope`.

---

### Task 1: Lembar Mutu rules + vectors

Files: `backend/simario/domain/sheets.py` (`lembar_mutu`, `latest_opened_quarter`), `shared/test-vectors/sheets.json`, `backend/tests/domain/test_sheets_vectors.py`, `frontend/src/domain/sheets.vectors.test.ts`.
- Commit `feat: share lembar mutu rules with the backend`.

### Task 2: History read model

Files: `backend/simario/assessments/history.py`, views/urls; Test `tests/assessments/test_history_view.py`.
Produces `GET /api/v1/positions/{pos}/history/{ta}` (`HistoryView`).
- [ ] Tests: matrix rows × TW; cross-year lineage; `test_history_late_directorate`; out of scope → 403.
- Commit `feat: serve the risk history from the backend`.

### Task 3: Beranda and position lists

Files: `backend/simario/home/{apps,selectors,views,urls}.py`, settings `INSTALLED_APPS`; Test `tests/home/test_home_view.py`.
Produces `GET /api/v1/home[?position=]` (`HomeView`), `GET /api/v1/my-positions` (`PositionListRow[]`).
- [ ] Tests: `test_home_cards_per_persona`, `test_position_list_scope`.
- Commit `feat: serve the home page and position lists from the backend`.

### Task 4: `reminders` task

Files: `backend/simario/notifications/reminders.py` (registered as scheduler `reminders`); Test `tests/notifications/test_reminders.py`.
- [ ] Tests: window opening, H-7, H-1 for Lini 1, Lini 3 and explanations; `test_reminders_idempotent_and_recent_only`.
- Commit `feat: send deadline reminders from the backend`.

### Task 5: Frontend history and home via API

Files: `frontend/src/data/http/{history,home}.ts`, `repository.ts`, `pages/home/HomePage.tsx` (TrialHome removed), `pages/history/HistoryPage.tsx`, `data/http/migrated.ts` (+`beranda`, `riwayat`, `daftar`, `pantauan`), fake backend routes; Tests: existing page tests async.
- Commit `feat: run history and home through the backend`.

### Task 6: Docs + checkpoint B6

Docs 01–06, CLAUDE.md ticks + note; related gates; final review (most capable model) + one fix pass; commit `feat: move history, reminders and home to the backend (checkpoint B6)`; continue to B7 without waiting.
