# Backend B4s — Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SIMARIO deployable to a staging server from one production-style configuration, tested end to end on this machine, with a trial build that hides modules still running on local data.

**Architecture:** `docker-compose.prod.yml` (shared by staging and production; only `.env` differs) runs gunicorn, Celery worker/beat, PostgreSQL, Redis, RustFS, ClamAV and nginx. nginx serves the built SPA, proxies `/api` and `/oidc` to Django and `/storage` to RustFS (with the Host the download URLs are signed for), and terminates HTTPS. A module gate (`frontend/src/data/http/migrated.ts`, `VITE_HIDE_UNMIGRATED=true`) hides routes and menu items of modules not yet on the backend; Beranda shows only cards of migrated modules in that build.

**Tech Stack:** Docker Compose, nginx 1.27, gunicorn, Django settings, Vite build.

**Spec:** docs/superpowers/specs/2026-10-21-backend-integration-design.md (§4.4 sessions/OIDC, §4.10 module gate, §4.11 environments, §6 B4s, §7)

## Global Constraints

- One compose file for staging and production; differences only in `.env` (`DJANGO_SETTINGS_MODULE`, `SIMARIO_DEV_TOOLS`, domain, secrets, `OIDC_*`).
- No local Keycloak in prod/staging; OIDC active only when `OIDC_*` set. Local accounts work without it.
- Production refuses `SIMARIO_DEV_TOOLS`; staging may enable it for UAT (global clock).
- RustFS never exposed directly; `/storage` only through nginx.
- Secrets never committed; `.env.prod.example` lists every variable.
- Commits without Co-Authored-By. Related tests only.

## Review Focus

1. Security headers and cookies under HTTPS (Secure, HSTS, CSRF trusted origins, proxy SSL header): `manage.py check --deploy` clean for production settings. Test: Task 1.
2. Pre-signed downloads through nginx: Host forwarded matches `S3_PUBLIC_ENDPOINT`. Test: Task 2 smoke script.
3. The trial build never shows a route or menu of an unmigrated module, including deep links. Test: Task 3.
4. Sign-out ends the Keycloak session too when OIDC is on (R-10). Test: Task 4.

---

### Task 1: Staging and production settings
Files: `backend/config/settings/{staging,production}.py`, `base.py` (env-driven `CSRF_TRUSTED_ORIGINS`, `SECURE_PROXY_SSL_HEADER`, secure cookies, HSTS, JSON logging), `.env.prod.example`; Test `backend/tests/core/test_deploy_settings.py` (`check --deploy` on production with sample env; production refuses dev tools).
Commit `feat: harden staging and production settings`.

### Task 2: Production compose, nginx, HTTPS
Files: `docker-compose.prod.yml`, `infra/nginx/{nginx.conf,Dockerfile}` (multi-stage: Vite build → nginx), `infra/nginx/dev-cert.sh` (self-signed for local test), `backend/Dockerfile` (collectstatic), `backend/simario/core/management/commands/wait_for_services.py` if needed; smoke script `infra/smoke.py` (health, local login, upload + download through `/storage`).
- [ ] Manual: `docker compose -f docker-compose.prod.yml --env-file .env.prod.local up -d --build`, run smoke on https://localhost:8443.
Commit `feat: run the production stack locally behind nginx`.

### Task 3: Module gate and temporary Beranda
Files: `frontend/src/data/http/migrated.ts`, `App.tsx`/`layout/nav.ts` (hide unmigrated when `VITE_HIDE_UNMIGRATED`), `pages/home` (cards of migrated modules only); Test `frontend/src/data/http/migrated.test.ts`, nav test.
Commit `feat: hide unmigrated modules in the trial build`.

### Task 4: Sign-out at Keycloak (R-10) and seed_reference independence (U-20)
Files: `backend/simario/accounts/{oidc_config,views}.py` (end-session redirect when OIDC on), `backend/simario/reference/catalog.py` + `simario/core/ids.py` (legacy uuid helper out of devtools), image copies `docs/seed`; Tests `tests/accounts/test_logout_oidc.py`, `tests/reference/test_seed_reference_standalone.py`.
Commit `fix: end the keycloak session on sign-out`.

### Task 5: Docs + checkpoint B4s
`docs/05_local_dev_and_testing.md` (staging deployment guide), `docs/07_staging_requirements.md` (server requirements list for OIKN infra), `01`, `04` (R-10, U-20 resolved), CLAUDE.md ticks; related gates; final review + one fix pass; commit `feat: prepare staging deployment (checkpoint B4s)`; continue to B5 without waiting.
