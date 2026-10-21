# Backend B4 — Papan, Utas, Lampiran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the risk board, threads and attachments (PPN) to Django: board and thread read models with VIS-1/2/3/6/9 in selectors, comment posting with real file upload to RustFS, ClamAV scanning with quarantine, pre-signed downloads through `/storage`, quota, and 30-second polling.

**Architecture:** New app `simario.board` (Comment, Mention, ThreadSubscription, ThreadView, Attachment) ports `frontend/src/data/api/{board,thread}.ts` 1:1. The board's quarter panel and predicate chips read assessment data, so `simario.assessments` gains the `Assessment` and `ComparisonResult` models with demo data now (read-only until B5 adds behaviour). Pure rules go to `simario/domain/{board,visibility}.py` with shared vectors. The frontend swaps `boardApi`/`threadApi` to HTTP; Composer sends real files (multipart).

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16, Celery, RustFS (S3), ClamAV (clamd INSTREAM), python-magic; React 18 + Vitest.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§4.3 polling, §4.7 files, §4.8 `attachment_scan`, §4.9 vectors VIS, §5, §6 B4)

## Global Constraints

- Permission codes only; participation via `access.participation_holding` (§1.5); Langkah Lini 1 + posting quarter only (RB-PPN-004); confidential Lini 3 uploader, switching off needs permission 25.
- VIS rules in selectors (`simario/domain/visibility.py`), never in serializers or the client.
- Files: multipart through Django; extension/size/count/MIME-from-content checked server-side (NFR-009); key `attachments/<position_id>/<fiscal_year>/<uuid>`; `pending` → Celery `attachment_scan` (clamd) → `clean` | `infected` (moved to `quarantine/`, uploader notified, audit). Download `GET /api/v1/attachments/{id}/download` → 302 to a 5-minute pre-signed URL under `/storage/…`; pending/infected never downloadable.
- Quota 1 GB per Lini 1 position per fiscal year from `Attachment.size`.
- Error copy verbatim from `thread.ts`; audit actions `kirim_komentar`, `sunting_komentar`, `tarik_komentar`, `konfidensial_nyala`, `konfidensial_mati`; notifications `mention` and aggregated `new_comments` as the prototype.
- Clock: `simario.core.clock`. Commits without Co-Authored-By. Related tests only.

## Review Focus

1. INV-17 / VIS-3: a viewer without permission 10 never receives confidential attachment metadata or download URLs — only the count. Test: Task 3 `test_confidential_hidden_without_permission_10`.
2. VIS-1/9 in the quarter panel: blind Lini 3 drafts and late directorates see nothing of others. Test: Task 2 vectors + Task 3 `test_late_directorate_sees_no_panel`.
3. Infected upload: never downloadable, moved to quarantine, uploader notified. Test: Task 5 `test_eicar_is_quarantined` (clamd mocked) + manual EICAR against local ClamAV.
4. Edit window 15 minutes on the simulated clock; withdraw keeps the body only in audit (VIS-6). Test: Task 4.
5. Polling `?since=` returns only newer comments and is cheap; the page's banner "[n] komentar baru" uses it. Test: Task 3 `test_thread_since`.

---

### Task 1: Models, migrations, demo seed

Files: `backend/simario/board/{apps,models}.py`; `backend/simario/assessments/models.py` (`Assessment`, `ComparisonResult` per `domain/types.ts`); migrations; `devtools/seed.py` collections `assessments`, `results`, `comments` (+ `Mention` rows from `mentionUserIds`), `attachments` (`size_bytes`→`size`, object key null for seed files), `subscriptions`, `threadViews`.
- [ ] Test `tests/board/test_seed.py`: counts 20 / 9 / 8 / 4 and 86 / 55; a confidential attachment exists.
- Commit `feat: add board and assessment models with demo data`.

### Task 2: Board and visibility rules + vectors

Files: `backend/simario/domain/{board,visibility}.py`, `shared/test-vectors/{board,visibility}.json` (generated from the TS implementation on the demo seed), `backend/tests/domain/test_{board,visibility}_vectors.py`, `frontend/src/domain/{board,visibility}.vectors.test.ts`.
Produces Python ports of `postingQuarter`, `openedResults`, `expectedLini3`, `relatedQuarters`, `hasLangkah`, `isQuiet`, `latestOpened`, `threadParticipants`, `canEditComment`, `isAlwaysSubscribed`, `isFollowing`, `lastActivity`, `storageUsed`, `fileProblem`; `viewerFor`, `isLateDirectorate`, `canSeeAssessment`, `canSeeResult`, `canSeeAttachment`.
- Commit `feat: share board and visibility rules with the backend`.

### Task 3: Read models

Files: `backend/simario/board/{selectors,views,urls}.py`; Test `tests/board/test_board_view.py`, `test_thread_view.py`.
Produces `GET /api/v1/positions/{pos}/board/{ta}` (`BoardView`), `GET /api/v1/register-risks/{id}/thread[?since=]` (`ThreadView`; with `since`: `{comments: n, latestAt}` for the banner), `GET /api/v1/register-risks/{id}/participants?quarterId=`.
- [ ] Tests: published only; markers; `test_confidential_hidden_without_permission_10`; `test_late_directorate_sees_no_panel`; `test_thread_since`; reader not participant → `participation` null.
- Commit `feat: serve the board and threads from the backend`.

### Task 4: Comments, subscriptions, seen

Files: `backend/simario/board/services.py`, views/urls; Test `tests/board/test_comments_api.py`.
Produces `POST /register-risks/{id}/comments` (multipart: JSON `data` + files `files[]`, `confidential[]`), `PATCH /comments/{id}`, `POST /comments/{id}/withdraw`, `PATCH /attachments/{id}` `{isConfidential}`, `PUT|DELETE /register-risks/{id}/subscription`, `POST /register-risks/{id}/seen`.
- [ ] Ports of thread.ts checks and notifications (mention, aggregated new_comments), edit window, withdraw, follow.
- Commit `feat: post comments through the backend`.

### Task 5: Storage, scanning, download, quota

Files: `backend/simario/board/{storage,tasks}.py`; Modify `core/storage.py` (presign with public `/storage` base), settings (`S3_PUBLIC_URL`), `pyproject.toml` (`python-magic`/`puremagic` for content MIME), `docker-compose.yml` only if needed; Test `tests/board/test_attachments_api.py`.
Produces upload to `attachments/<pos>/<ta>/<uuid>`; task `attachment_scan` (Celery + scheduler) via clamd INSTREAM; quarantine; `GET /attachments/{id}/download` → 302.
- [ ] Tests with S3 and clamd mocked: clean → downloadable; `test_eicar_is_quarantined`; MIME mismatch refused; quota.
- [ ] Manual: real upload + EICAR against local RustFS/ClamAV.
- Commit `feat: store and scan attachments in the backend`.

### Task 6: Frontend board and thread via API

Files: `frontend/src/data/http/{board,thread}.ts`, `repository.ts`, `pages/board/{BoardPage,ThreadPage,Composer,CommentItem}.tsx` (real `File` objects, download links), 30-second polling, fake backend routes; Tests `pages/board/board.test.tsx` async.
- Commit `feat: run the board and threads through the backend`.

### Task 7: Docs + checkpoint B4

Docs 01–06, CLAUDE.md ticks; related gates; final review (most capable model) + one fix pass; commit `feat: move the board and threads to the backend (checkpoint B4)`; continue to B4s without waiting (user instruction). The temporary Beranda and module gate (`migrated.ts`) move to B4s with the trial build.
