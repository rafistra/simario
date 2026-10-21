# Backend B7 — Lembar & Cetak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the sheets (LBR) to Django: the reader-neutral sheet payload, Lembar Komunikasi and Lembar Mutu views with VIS-9 masking, numbered print snapshots (`SIMARIO/[LK|LM]/…`, provisional watermark), automatic versions (`sheet_freeze`, `superseded_by`), archive versions, photo selection, and real photo files.

**Architecture:** New app `simario.sheets` with `PrintSnapshot` and `SheetPhotoSelection`, porting `frontend/src/data/api/sheets.ts` and `domain/rules/sheetPayload.ts` (to `simario/domain/sheet_payload.py`, shared vectors). Snapshots store the payload JSON and never change (INV-22). `sheet_freeze` runs as a scheduled task and after the events in U-07 (Kirim Penjelasan, late result opening). Photos come from image attachments already in RustFS and are shown through the existing presigned download. The frontend swaps `sheetApi` to HTTP.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16; React 18 + Vitest.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§4.8 `sheet_freeze` + U-07 triggers, §4.9 vectors, §6 B7)

## Global Constraints

- Payload is reader-neutral (VIS-7); masking for a late directorate (VIS-9) is applied per viewer when serving, from the stored payload, as `maskPayloadFor`.
- Snapshot numbers `SIMARIO/LK|LM/<pos code>/<TA>/TW<n>/<seq>` exactly as `snapshotNumber`; a print of a frozen version creates nothing; a print of the running view creates a new snapshot (`trigger=print`, provisional before the first automatic version).
- Copy and audit actions verbatim from `sheets.ts` (`cetak_lembar`, `pilih_foto_lembar`, …).
- Clock: `simario.core.clock`. Commits without Co-Authored-By. Related tests only (full suites at the end of B9).

## Review Focus

1. A late directorate's viewer never receives another directorate's values from a stored snapshot (masking on read). Test: Task 3 `test_frozen_copy_masked_for_late_directorate`.
2. Snapshots are immutable: no endpoint updates or deletes one; reprinting a frozen version does not create a snapshot. Test: Task 3 `test_print_frozen_creates_nothing`.
3. Concurrent prints get distinct sequence numbers. Test: Task 3 `test_snapshot_numbers_unique` (unique constraint + lock).
4. `sheet_freeze` after a far clock jump creates each automatic version once, and `superseded_by` links the previous one. Test: Task 4 `test_freeze_idempotent`.
5. Photo selection accepts only clean image attachments of that position and quarter, at most 5 per section. Test: Task 3 `test_photo_selection_rules`.

---

### Task 1: Payload rules + vectors

Files: `backend/simario/domain/sheet_payload.py` (`build_sheet_payload`, `mask_payload_for`, `mutu_from_payload`, `freeze_ready`, `snapshot_number`), `shared/test-vectors/sheet-payload.json`, tests both sides.
- Commit `feat: share sheet payload rules with the backend`.

### Task 2: Models, migration, demo seed

Files: `backend/simario/sheets/{apps,models}.py` (`PrintSnapshot` with unique `number`, `SheetPhotoSelection` per position × quarter × section), migration, `devtools/seed.py` (`snapshots`, photo preferences → selections), `as_of` trims snapshots; Test `tests/sheets/test_seed.py`.
- Commit `feat: add print snapshots to the backend`.

### Task 3: Sheet view, print, photos, number search

Files: `backend/simario/sheets/{selectors,services,views,urls}.py`; Tests `tests/sheets/test_sheets_api.py`.
Produces `GET /positions/{pos}/sheets/{ta}/{tw}[?snapshot=]`, `PUT /positions/{pos}/sheets/{ta}/{tw}/photos/{section}`, `POST /positions/{pos}/sheets/{ta}/{tw}/print`, `GET /snapshots?number=`.
- Commit `feat: serve sheets and print snapshots from the backend`.

### Task 4: `sheet_freeze` + triggers + archive version

Files: `backend/simario/sheets/tasks.py`, hooks after send explanation and comparison opening, `on_archive` version; Tests `tests/sheets/test_freeze.py`.
- Commit `feat: freeze sheet versions in the backend`.

### Task 5: Frontend sheets via API

Files: `frontend/src/data/http/sheets.ts`, `repository.ts`, `pages/sheets/SheetPage.tsx` (no store reads; real photo URLs), `data/http/migrated.ts` (+`lembar`), fake backend routes; Tests `pages/sheets/sheets.test.tsx`.
- Commit `feat: run sheets through the backend`.

### Task 6: Docs + checkpoint B7

Docs 01–06, CLAUDE.md ticks + note (U-07 resolved); related gates; final review + one fix pass; commit `feat: move sheets and printing to the backend (checkpoint B7)`; continue to B8 without waiting.
