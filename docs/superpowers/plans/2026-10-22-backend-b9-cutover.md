# Backend B9 — Pemutusan mode lokal & kesiapan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app runs on the backend only: no local data mode, no module gate, server preferences and clock, squashed migrations frozen as forward-only, tested backup and restore, and the documentation updated — then the full backend and frontend suites.

**Architecture:** Runtime code stops importing `data/local`, `data/seed`, `data/db.ts` and the `data/api` implementations. Those prototype implementations stay only as the Vitest fake backend, moved to `src/test/fake/` (never bundled; a lint rule forbids importing them outside tests). Their exported *types* move to `src/data/types/` so pages keep the same shapes. Two backend additions replace the last store reads: `GET /positions/{pos}/workspace` (workspace header) and `Preference` (`GET/PUT /preferences`). Migrations are regenerated per app with the audit trigger kept as its own migration.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL 16, RustFS; React 18 + Vitest.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§4.10, §4.11, §6 B9)

## Global Constraints

- No runtime path may read or write `localStorage` for data; per-viewer conveniences go through `preferenceApi` on the server (spec §4.10).
- `state/clock` shows the server clock (`/me` `serverNow`); the DevPanel clock calls `/dev/clock`.
- Migrations after B9: forward only. The audit append-only trigger (INV-6) must survive the squash.
- Backup/restore: PostgreSQL dump + RustFS bucket mirror, restore verified on a fresh volume (NFR-014).
- PRD §2.1 is changed only with the user's consent (RustFS) — not done without it; noted in the report.
- Commits without Co-Authored-By. Full suites at the end of this stage (user instruction).

## Review Focus

1. A production build contains no prototype store code (`simario:v1:` keys, `buildSeed`). Test: Task 4 `scripts/check-bundle.mjs` in CI step.
2. Workspace 404/403 decided by the server for positions created after the seed. Test: Task 1 `test_workspace_scope`.
3. Preferences are per user; one user cannot read or write another's. Test: Task 1 `test_preferences_are_per_user`.
4. The squashed migrations create the same schema and keep the audit trigger. Test: Task 2 `test_audit_rows_cannot_change` still passes on a fresh DB.
5. Restore from backup brings back rows and files. Test: Task 3 manual restore + `infra/backup/verify.py`.

---

### Task 1: Workspace endpoint and server preferences

Files: `backend/simario/org/workspace.py` + views/urls; `backend/simario/accounts/{models,views,urls}.py` (`Preference`); Tests `tests/org/test_workspace.py`, `tests/accounts/test_preferences.py`.
- Commit `feat: serve the workspace header and preferences from the backend`.

### Task 2: Squash and freeze migrations

Regenerate migrations per app; audit trigger migration kept; Test: `tests/audit/*` on a fresh DB; dev DB reset documented.
- Commit `chore: squash migrations before the first deployment`.

### Task 3: Backup and restore

Files: `infra/backup/{backup.sh,restore.sh,verify.py}`, docs/05; manual run against the dev stack.
- Commit `feat: add database and bucket backup and restore`.

### Task 4: Remove the local mode from the app

Files: `frontend/src/layout/{Workspace,Topbar,AppShell}.tsx`, `components/DataGate/*`, `lib/useQuery.ts`, `state/{clock,notifications}.ts`, `dev/*`, `data/repository.ts` (+ `data/http/{preferences,workspace}.ts`), `data/http/migrated.ts` removed, `data/types/*`, `src/test/fake/*` (moved prototype implementations), `netlify.toml` removed, ESLint `no-restricted-imports`, `scripts/check-bundle.mjs`.
- Commit `feat: run the app on the backend only`.

### Task 5: Docs, readiness list, full suites, checkpoint B9

Docs 00–07, `frontend/README.md`, CLAUDE.md ticks + note; full `uv run pytest`, ruff, mypy, `npm run build`, `npm run test`, `npm run lint`; manual TW I flow on the dev stack; final review + one fix pass; commit `feat: run simario on the backend only (checkpoint B9)`.
