# Backend B0 — Kerangka: Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kerangka backend yang berjalan lokal: proyek Django dengan gerbang kualitas, konvensi API (galat, camelCase, paginasi), pipeline OpenAPI → tipe TS, semua layanan di Docker Compose, realm Keycloak lokal, vektor uji bersama, dan CLAUDE.md yang mengizinkan backend.

**Architecture:** `backend/` adalah proyek Django 5.2 yang dikelola `uv` dan dijalankan di host untuk uji/lint, serta di container untuk layanan. `docker-compose.yml` di root menjalankan PostgreSQL, Redis, RustFS, ClamAV, Keycloak, API, worker, dan beat. Frontend tetap `npm run dev` di host dengan proxy ke container. Belum ada model domain; B0 hanya fondasi yang dipakai B1–B9.

**Tech Stack:** Python 3.12, Django 5.2, DRF, drf-spectacular, djangorestframework-camel-case, django-environ, psycopg 3, Celery 5.5 + django-celery-beat, django-storages + boto3, pytest-django, ruff, mypy + django-stubs; PostgreSQL 16, Redis 7, RustFS, ClamAV 1.x, Keycloak 26; openapi-typescript 7.

**Spec:** `docs/superpowers/specs/2026-10-21-backend-integration-design.md` (§3, §4.1, §4.3, §4.9, §4.11, §6 baris B0)

## Global Constraints

- Python `>=3.12,<3.13` (`backend/.python-version` = `3.12`); Django `>=5.2,<5.3`; DRF `>=3.15`; Celery `>=5.5,<5.6`; image `postgres:16`, `redis:7`, `clamav/clamav:1.4`, `quay.io/keycloak/keycloak:26.<patch>`, `rustfs/rustfs:<tag stabil terbaru, ditulis persis>`. Versi persis dikunci di `uv.lock`; paket npm baru ditulis **persis** (tanpa `^`), seperti `frontend/package.json`.
- Prefix API `/api/v1/`; JSON camelCase; Python snake_case.
- Badan galat `{"code": str, "message": str, "details": any|null}`; `message` Bahasa Indonesia siap tampil.
- `TIME_ZONE = "Asia/Makassar"`, `USE_TZ = True`, `LANGUAGE_CODE = "id"`.
- Uji backend memakai PostgreSQL sungguhan (service `db` compose), tidak pernah SQLite.
- Rahasia tidak dikomit; semua variabel terdaftar di `.env.example`.
- Kode, nama berkas, komentar: bahasa Inggris. Dokumen dan teks UI: Bahasa Indonesia.
- Komit `tipe: deskripsi` (Inggris, imperatif, huruf kecil), **tanpa** `Co-Authored-By` atau atribusi apa pun.
- Jangan mengubah perilaku frontend selain `vite.config.ts` (proxy, alias) dan skrip `package.json`.

## Review Focus

1. **Variabel lingkungan wajib tidak ada** (`.env` belum disalin) → Django gagal dengan `ImproperlyConfigured` yang menyebut nama variabelnya, bukan traceback samar. Uji: Task 2 `test_missing_secret_key_names_variable`.
2. **Produksi/staging dengan alat dev menyala** → settings `production` menolak `SIMARIO_DEV_TOOLS=true` saat dimuat. Uji: Task 2 `test_production_rejects_dev_tools`.
3. **Path `/api/…` yang tidak ada atau galat tak terduga** → JSON berbentuk amplop galat (404 `not_found`, 500 `server`), bukan halaman HTML Django. Uji: Task 3 `test_unknown_api_path_returns_envelope`, `test_unhandled_exception_returns_server_envelope`.
4. **Skema OpenAPI basi** (endpoint berubah, `openapi.yaml`/`schema.d.ts` tidak diregenerasi) → `pytest` dan `npm run lint` gagal. Uji: Task 4 `test_committed_schema_is_current` + `api:check`.
5. **Layanan belum siap saat API mulai** (PostgreSQL/RustFS lambat; ClamAV butuh menit untuk `freshclam`) → API menunggu `db`/`redis`/`storage` sehat; `/api/v1/health/` menjawab 503 `degraded` dengan pemeriksaan yang gagal, bukan crash. Uji: Task 2 `test_health_degraded_when_check_fails`; verifikasi Task 5.

---

### Task 1: Aturan kerja backend di CLAUDE.md dan dokumen

**Files:**
- Modify: `CLAUDE.md` (§1, §3, §4, §9, §10, §12; tambah bagian "Tahapan Backend")
- Modify: `docs/01_backend.md` (§1 status, §2.1 butir jam simulasi)
- Modify: `.gitignore`

**Interfaces:**
- Produces: daftar tahap B0–B9 + B4s di CLAUDE.md dengan centang "Hasil" yang diperbarui tiap checkpoint (Task 8 mencentang B0).

- [ ] **Step 1: Ubah CLAUDE.md**
  - §1: ganti "**Tanpa backend.** Data disimpan di `localStorage`…" dengan: prototipe frontend selesai (Tahap 0–10); integrasi backend berjalan di branch `feat/backend-integration` menurut spec `docs/superpowers/specs/2026-10-21-backend-integration-design.md`; mode `localStorage` tetap jalan sampai B9 lalu dihapus. Spec ini masuk daftar "Sumber kebenaran" §2 setelah PRD.
  - §3: tambah pohon `backend/`, `shared/test-vectors/`, `infra/` dari spec §4.1.
  - §4: tambah satu butir: selama transisi namespace dipindah dari implementasi lokal ke `data/http/` per tahap; tidak ada flag sumber data.
  - §9 aturan checkpoint butir 2: tambahkan `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .` (dari `backend/`); butir 3 (bandingkan dengan `.pen`) berlaku hanya bila tahap mengubah halaman.
  - Tambah bagian `## 9b. Tahapan Backend` dengan B0, B1, B2, B3, B4, B4s, B5, B6, B7, B8, B9 — judul, status `⬜ belum` (B0 `🟨 berjalan`), dan "Hasil" berupa isi kolom "Isi" tabel spec §6 sebagai butir `- [ ]`. Untuk B0, butirnya adalah judul Task 1–7 rencana ini. Pesan komit checkpoint: `feat: <ringkasan> (checkpoint Bn)`.
  - §10: tambah blok perintah backend (`docker compose up -d`, `uv run pytest`, `uv run ruff check .`, `uv run mypy .`, `uv run python manage.py spectacular --file openapi.yaml --validate`), satu perintah per blok.
  - §12: ganti "Jangan memanggil API eksternal atau menambah backend." dengan "Jangan memanggil layanan eksternal selain yang ada di `docker-compose.yml`. Jangan menyimpang dari keputusan §4 spec integrasi backend tanpa bertanya ke pengguna." Tambah: "Di backend, aturan bisnis memakai `simario.core.clock.now()`, tidak pernah `timezone.now()`/`datetime.now()` langsung."
- [ ] **Step 2: Ubah `docs/01_backend.md`**: §1 kalimat pertama menjadi "Kerangka backend sedang dibangun (tahap B0); belum ada model domain."; §2.1 pola integrasi butir 4 diganti: jam simulasi global (`DevClock`), aktif bila `SIMARIO_DEV_TOOLS`; di staging mati saat uji coba PPK dan boleh menyala untuk UAT (spec §4.5).
- [ ] **Step 3: Tambah ke `.gitignore`**: `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `backend/staticfiles/`.
- [ ] **Step 4: Verifikasi**: `grep -n "Tanpa backend\|menambah backend" CLAUDE.md` tidak mengembalikan apa pun.
- [ ] **Step 5: Komit**

```bash
git add CLAUDE.md docs/01_backend.md .gitignore
git commit -m "docs: update working rules for backend integration"
```

---

### Task 2: Proyek Django, settings, health check, gerbang kualitas

**Files:**
- Create: `backend/pyproject.toml`, `backend/uv.lock`, `backend/.python-version`, `backend/manage.py`
- Create: `backend/config/__init__.py`, `urls.py`, `wsgi.py`, `asgi.py`, `backend/config/settings/{__init__,base,local,test,staging,production}.py`
- Create: `backend/simario/__init__.py`, `backend/simario/core/{__init__,apps,health,views,urls}.py`
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/core/test_health.py`, `backend/tests/core/test_settings.py`
- Create: `docker-compose.yml` (hanya service `db` dulu; Task 5 melengkapi), `.env.example`

**Interfaces:**
- Produces: `simario.core.health.CHECKS: dict[str, Callable[[], bool]]` dengan kunci `database`, `redis`, `storage`, `clamav`; `GET /api/v1/health/`; settings membaca variabel di bawah; `config/urls.py` meng-`include("simario.core.urls")` di bawah `api/v1/`.

Variabel (`.env.example`, nilai untuk proses di host): `DJANGO_SETTINGS_MODULE=config.settings.local`, `DJANGO_SECRET_KEY=dev-only-change-me`, `DATABASE_URL=postgres://simario:simario@localhost:5432/simario`, `REDIS_URL=redis://localhost:6379/0`, `S3_ENDPOINT_URL=http://localhost:9000`, `S3_ACCESS_KEY=simario`, `S3_SECRET_KEY=simario-secret`, `S3_BUCKET=simario`, `CLAMAV_HOST=localhost`, `CLAMAV_PORT=3310`, `SIMARIO_DEV_TOOLS=true`, `ALLOWED_HOSTS=localhost,127.0.0.1`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_NIP_CLAIM=nip`, `OIDC_REDIRECT_URI` (nilai OIDC dari Task 6). `base.py` membaca `<root repo>/.env` bila ada (`environ.Env.read_env`); variabel lingkungan proses menang (dipakai compose untuk host `db`, `redis`, dan seterusnya).

- [ ] **Step 1: Inisialisasi proyek**: `uv init --app --python 3.12` di `backend/`; dependensi `django`, `djangorestframework`, `drf-spectacular`, `djangorestframework-camel-case`, `django-environ`, `psycopg[binary]`, `redis`, `celery`, `django-celery-beat`, `django-storages[s3]`, `boto3`, `gunicorn`; grup dev `pytest`, `pytest-django`, `ruff`, `mypy`, `django-stubs[compatible-mypy]`, `djangorestframework-stubs`. Konfigurasi di `pyproject.toml`: ruff `line-length = 100`, `select = ["E","F","I","B","UP","DJ"]`; mypy `strict = true` dengan plugin `mypy_django_plugin.main` + `mypy_drf_plugin.main`, `django_settings_module = "config.settings.test"`; pytest `DJANGO_SETTINGS_MODULE = "config.settings.test"`, `testpaths = ["tests"]`.
- [ ] **Step 2: Service `db` di `docker-compose.yml`**: `postgres:16`, `POSTGRES_DB/USER/PASSWORD = simario`, volume `pgdata`, port `5432:5432`, healthcheck `pg_isready -U simario`. Jalankan `docker compose up -d db`.
- [ ] **Step 3: Tulis uji yang gagal**

```python
# tests/core/test_health.py
def test_health_ok(client, monkeypatch):
    for name in ("redis", "storage", "clamav"):
        monkeypatch.setitem(CHECKS, name, lambda: True)
    res = client.get("/api/v1/health/")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok", "storage": "ok", "clamav": "ok"}}

def test_health_degraded_when_check_fails(client, monkeypatch):
    for name in ("redis", "storage"):
        monkeypatch.setitem(CHECKS, name, lambda: True)
    monkeypatch.setitem(CHECKS, "clamav", lambda: False)
    res = client.get("/api/v1/health/")
    assert res.status_code == 503
    assert res.json()["status"] == "degraded"
    assert res.json()["checks"]["clamav"] == "error"

# tests/core/test_settings.py — muat modul settings di subprocess (`python -c "import config.settings.production"`) dengan env terkendali
def test_production_rejects_dev_tools(): ...   # SIMARIO_DEV_TOOLS=true → returncode != 0, stderr memuat "SIMARIO_DEV_TOOLS"
def test_missing_secret_key_names_variable(): ...  # tanpa DJANGO_SECRET_KEY → stderr memuat "DJANGO_SECRET_KEY"
```

- [ ] **Step 4: Jalankan, pastikan gagal**: `uv run pytest tests/core -v` → FAIL (modul/URL belum ada).
- [ ] **Step 5: Implementasi**
  - `settings/base.py`: `INSTALLED_APPS` termasuk `rest_framework`, `drf_spectacular`, `django_celery_beat`, `simario.core`; `DATABASES = {"default": env.db("DATABASE_URL")}`; zona waktu & bahasa sesuai Global Constraints; `SIMARIO_DEV_TOOLS = env.bool("SIMARIO_DEV_TOOLS", default=False)`.
  - `local.py`: `DEBUG = True`. `test.py`: turunan `local`, `SIMARIO_DEV_TOOLS = True`. `staging.py`: `DEBUG = False`, `SIMARIO_DEV_TOOLS` dari env. `production.py`: `DEBUG = False`; `raise ImproperlyConfigured("SIMARIO_DEV_TOOLS must be false in production")` bila env bernilai true.
  - `core/health.py`: `check_database() -> bool` (`connection.ensure_connection()`), `check_redis() -> bool` (`redis.Redis.from_url(...).ping()`), `check_storage() -> bool` (boto3 `head_bucket` ke `S3_BUCKET`), `check_clamav() -> bool` (TCP ke `CLAMAV_HOST:CLAMAV_PORT`, kirim `zPING\0`, harapkan `PONG`); masing-masing menangkap semua galat → `False`, timeout 2 detik. `CHECKS` memetakan nama → fungsi; view membaca `CHECKS` saat dipanggil (agar `monkeypatch.setitem` berlaku).
  - `core/views.py`: `health(request) -> Response` (APIView/`@api_view(["GET"])`, `permission_classes = []`, dikecualikan dari skema OpenAPI dengan `@extend_schema(exclude=True)`).
- [ ] **Step 6: Jalankan, pastikan lulus**: `uv run pytest tests/core -v` → PASS.
- [ ] **Step 7: Gerbang kualitas**: `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .` → tanpa galat.
- [ ] **Step 8: Komit**

```bash
git add backend docker-compose.yml .env.example
git commit -m "feat: add django project with settings and health check"
```

---

### Task 3: Konvensi API — amplop galat, camelCase, paginasi

**Files:**
- Create: `backend/simario/core/errors.py`, `backend/simario/core/pagination.py`
- Modify: `backend/config/settings/base.py` (`REST_FRAMEWORK`), `backend/config/urls.py` (handler 404/500 untuk `/api/`)
- Test: `backend/tests/core/test_errors.py`, `backend/tests/core/test_conventions.py`, `backend/tests/core/urls_testonly.py`

**Interfaces:**
- Produces:
  - `class ApiError(APIException)`: `__init__(self, code: str, message: str, details: Any = None, status: int | None = None)`; status bawaan dari `STATUS_BY_CODE`.
  - `STATUS_BY_CODE: dict[str, int]` = `unauthenticated` 401; `forbidden` 403; `not_found` 404; `validation`, `empty`, `bands_invalid`, `options_invalid`, `errors`, `old_password`, `too_short`, `same`, `not_local` 422; `archived`, `locked`, `final`, `sent`, `excluded`, `not_started`, `occupied`, `type_in_use`, `nothing` 409; `server` 500.
  - `api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None` — dipasang di `REST_FRAMEWORK["EXCEPTION_HANDLER"]`.
  - `PagePagination` (25 per halaman) dan `CommentPagination` (50), keduanya menghasilkan `{"results": [...], "page": int, "pageSize": int, "total": int}`, parameter `?page=`.
  - Renderer/parser camelCase dari `djangorestframework_camel_case` sebagai bawaan DRF.

Pemetaan galat bawaan (salinan dari prototipe `data/local/actor.ts` bila ada; sisanya baru, tandai di laporan checkpoint):
- `NotAuthenticated`/`AuthenticationFailed` → `unauthenticated`, "Sesi Anda berakhir. Silakan masuk kembali."
- `PermissionDenied` → `forbidden`, "Anda tidak memiliki akses untuk tindakan ini."
- `Http404`/`NotFound`/path `/api/` tak dikenal → `not_found`, "Data tidak ditemukan." *(baru)*
- `ValidationError` DRF → `validation`, "Isian belum valid." *(baru)*, `details` = galat per isian (camelCase)
- galat lain di bawah `/api/` → `server`, "Terjadi kesalahan pada server. Silakan coba lagi." *(baru)*; detail galat dicatat ke log, tidak dikirim

- [ ] **Step 1: Tulis uji yang gagal** (`urls_testonly.py` berisi view uji: melempar `ApiError("archived", "Tahun anggaran sudah diarsipkan.")`, melempar `RuntimeError`, `ValidationError({"fiscal_year": ["wajib"]})`, mengembalikan `{"fiscal_year": 2027}`, dan daftar 30 item berpaginasi)

```python
def test_api_error_envelope(client):            # 409, {"code": "archived", "message": "Tahun anggaran sudah diarsipkan.", "details": None}
def test_validation_details_are_camel_case(client):  # 422, code "validation", details == {"fiscalYear": ["wajib"]}
def test_unknown_api_path_returns_envelope(client):  # GET /api/v1/tidak-ada/ → 404, code "not_found", Content-Type application/json
def test_unhandled_exception_returns_server_envelope(client):  # 500, code "server", tidak ada "RuntimeError" di badan
def test_response_is_camel_case(client):         # {"fiscalYear": 2027}
def test_request_body_is_snake_cased(client):    # POST {"fiscalYear": 2027} → view menerima request.data["fiscal_year"] == 2027
def test_page_pagination_shape(client):          # ?page=2 → results 5 item, page 2, pageSize 25, total 30
```

Uji memakai `@pytest.mark.urls("tests.core.urls_testonly")`; path uji tetap di bawah `/api/v1/`.
- [ ] **Step 2: Jalankan, pastikan gagal**: `uv run pytest tests/core/test_errors.py tests/core/test_conventions.py -v` → FAIL.
- [ ] **Step 3: Implementasi** sesuai Interfaces. 404/500 di luar DRF untuk path `/api/`: `handler404`/`handler500` di `config/urls.py` yang mengembalikan `JsonResponse` amplop bila `request.path.startswith("/api/")`.
- [ ] **Step 4: Jalankan, pastikan lulus** → PASS; `uv run ruff check . && uv run mypy .` bersih.
- [ ] **Step 5: Komit**

```bash
git add backend
git commit -m "feat: add api error envelope, camelcase and pagination conventions"
```

---

### Task 4: Pipeline OpenAPI → tipe TypeScript

**Files:**
- Modify: `backend/config/settings/base.py` (`SPECTACULAR_SETTINGS`), `backend/config/urls.py`
- Create: `backend/openapi.yaml` (dihasilkan, dikomit), `backend/tests/core/test_openapi.py`
- Create: `frontend/src/data/http/schema.d.ts` (dihasilkan, dikomit)
- Modify: `frontend/package.json` (skrip + devDependency), `frontend/.prettierignore`

**Interfaces:**
- Consumes: `ApiError`, renderer camelCase (Task 3).
- Produces: `GET /api/v1/schema/` (YAML OpenAPI 3); `GET /api/v1/docs/` (Swagger UI, hanya bila `DEBUG`); `npm run api:types`; `npm run api:check`; `npm run lint` gagal bila tipe basi. Komponen skema `ApiError` (`code`, `message`, `details`) untuk dipakai endpoint B1+.

- [ ] **Step 1: Tulis uji yang gagal**

```python
def test_schema_endpoint(client):              # GET /api/v1/schema/ → 200, badan memuat "openapi: 3"
def test_committed_schema_is_current():        # call_command("spectacular", "--file", tmp, "--validate") ; isi tmp == backend/openapi.yaml
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi**: `SPECTACULAR_SETTINGS = {"TITLE": "SIMARIO API", "VERSION": "1", "SCHEMA_PATH_PREFIX": "/api/v1", "COMPONENT_SPLIT_REQUEST": True, "POSTPROCESSING_HOOKS": ["drf_spectacular.hooks.postprocess_schema_enums", "drf_spectacular.contrib.djangorestframework_camel_case.camelize_serializer_fields"]}`; daftarkan serializer `ApiErrorSerializer` sebagai komponen. Hasilkan `uv run python manage.py spectacular --file openapi.yaml --validate`.
- [ ] **Step 4: Jalankan, pastikan lulus** → PASS.
- [ ] **Step 5: Frontend**: tambah `openapi-typescript` versi 7 persis; skrip `"api:types": "openapi-typescript ../backend/openapi.yaml -o src/data/http/schema.d.ts"`, `"api:check": "openapi-typescript ../backend/openapi.yaml -o src/data/http/schema.d.ts --check"`; `lint` menjadi `eslint . && prettier --check . && npm run api:check`; `src/data/http/schema.d.ts` di `.prettierignore` dan diabaikan ESLint. Jalankan `npm run api:types`.
- [ ] **Step 6: Verifikasi**: `npm run lint`, `npm run build`, `npm run test` (dari `frontend/`) lulus; ubah sementara satu karakter `TITLE`, regenerasi `openapi.yaml` tanpa `api:types` → `npm run api:check` gagal; kembalikan.
- [ ] **Step 7: Komit**

```bash
git add backend frontend/package.json frontend/package-lock.json frontend/.prettierignore frontend/eslint.config.js frontend/src/data/http/schema.d.ts
git commit -m "feat: generate openapi schema and typescript types"
```

---

### Task 5: Semua layanan di Docker Compose, Celery, bucket, proxy Vite

**Files:**
- Modify: `docker-compose.yml`
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `backend/config/celery.py`, `backend/simario/core/tasks.py`, `backend/simario/core/management/__init__.py`, `backend/simario/core/management/commands/__init__.py`, `backend/simario/core/management/commands/init_storage.py`
- Modify: `backend/config/__init__.py` (impor app Celery), `backend/config/settings/base.py` (Celery, `STORAGES`), `frontend/vite.config.ts`
- Test: `backend/tests/core/test_celery.py`, `backend/tests/core/test_init_storage.py`

**Interfaces:**
- Consumes: `CHECKS` (Task 2), variabel `.env` (Task 2).
- Produces: app Celery `config.celery.app` (`-A config`); task `simario.core.tasks.ping() -> str`; perintah `manage.py init_storage` (idempoten); `STORAGES["default"]` = `storages.backends.s3.S3Storage` ke `S3_ENDPOINT_URL`/`S3_BUCKET`, `querystring_expire = 300`; proxy Vite `/api` dan `/oidc` → `http://localhost:8000`, `/storage` → `http://localhost:9000` dengan awalan `/storage` dibuang.

Service compose (semua dengan healthcheck; nilai `environment` di compose menimpa host dari `.env` menjadi nama service: `db`, `redis`, `storage`, `clamav`):

| Service | Image / build | Port host | Catatan |
|---|---|---|---|
| `db` | `postgres:16` | 5432 | dari Task 2 |
| `redis` | `redis:7` | 6379 | `redis-cli ping` |
| `storage` | `rustfs/rustfs:<tag>` | 9000, 9001 (konsol) | kredensial = `S3_ACCESS_KEY`/`S3_SECRET_KEY`; volume `rustfs-data` |
| `clamav` | `clamav/clamav:1.4` | — (internal 3310) | `start_period` ≥ 300 detik (unduhan basis data virus pertama) |
| `keycloak` | `quay.io/keycloak/keycloak:26.<patch>` | 8080 | `start-dev --import-realm`, `./infra/keycloak:/opt/keycloak/data/import:ro`, `KC_HEALTH_ENABLED=true`, admin bootstrap dari `.env` |
| `api` | `build: ./backend` | 8000 | `migrate` → `init_storage` → `runserver 0.0.0.0:8000`; `depends_on` `db`, `redis`, `storage` `service_healthy`; bind mount `./backend:/app` + volume anonim `/app/.venv` |
| `worker` | sama dengan `api` | — | `celery -A config worker -l info` |
| `beat` | sama dengan `api` | — | `celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler` |

Healthcheck `storage` dan `clamav` memakai perintah yang didokumentasikan image pada tag yang dipilih (ClamAV: `clamdcheck.sh` bila tersedia; RustFS: endpoint health-nya). Bila image tidak menyediakannya, pakai pemeriksaan TCP ke port layanan. Catat pilihannya di laporan checkpoint.

`Dockerfile`: `python:3.12-slim`, salin `uv` dari image resmi `ghcr.io/astral-sh/uv`, `uv sync --frozen`, `WORKDIR /app`. Tambah variabel `KEYCLOAK_ADMIN_USER`/`KEYCLOAK_ADMIN_PASSWORD` ke `.env.example`.

- [ ] **Step 1: Tulis uji yang gagal**

```python
def test_ping_task_runs_eagerly(settings):   # CELERY_TASK_ALWAYS_EAGER = True; ping.delay().get() == "pong"
def test_init_storage_creates_missing_bucket(monkeypatch):  # klien boto3 palsu: head_bucket melempar ClientError 404 → create_bucket(Bucket="simario") dipanggil sekali
def test_init_storage_is_idempotent(monkeypatch):           # head_bucket sukses → create_bucket tidak dipanggil
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi** sesuai Interfaces dan tabel; `init_storage` memakai `boto3.client("s3", endpoint_url=..., ...)` lewat satu fungsi `s3_client()` di `simario/core/storage.py` agar bisa diganti di uji.
- [ ] **Step 4: Jalankan, pastikan lulus** → PASS; ruff dan mypy bersih.
- [ ] **Step 5: Verifikasi layanan**
  - `cp .env.example .env` lalu `docker compose up -d --build`
  - `docker compose ps` → semua `healthy` (ClamAV boleh `starting` hingga ± 5 menit pada start pertama)
  - `curl -s http://localhost:8000/api/v1/health/` → `{"status":"ok","checks":{"database":"ok","redis":"ok","storage":"ok","clamav":"ok"}}`
  - `docker compose exec worker celery -A config inspect ping` → `pong` dari satu worker
  - dengan `npm run dev`: `curl -s http://localhost:5173/api/v1/health/` → jawaban yang sama
  - `docker compose restart api` dua kali → `init_storage` tidak gagal (idempoten)
- [ ] **Step 6: Komit**

```bash
git add docker-compose.yml .env.example backend frontend/vite.config.ts
git commit -m "feat: run all backend services in docker compose"
```

---

### Task 6: Realm Keycloak lokal

**Files:**
- Create: `infra/keycloak/realm-export.json`
- Modify: `.env.example` (nilai OIDC lokal)

**Interfaces:**
- Produces: realm `otorita-ikn` (display name "Otorita IKN"), client `simario` (confidential, standard flow saja), mapper atribut pengguna `nip` → klaim `nip` (ID token, access token, userinfo). B1 menambahkan pengguna persona dan memakai nilai berikut di `.env.example`: `OIDC_ISSUER=http://localhost:8080/realms/otorita-ikn`, `OIDC_CLIENT_ID=simario`, `OIDC_CLIENT_SECRET=simario-local-secret` (khusus lokal), `OIDC_NIP_CLAIM=nip`, `OIDC_REDIRECT_URI=http://localhost:5173/oidc/callback/`.

Isi realm: `sslRequired: "none"`; user profile mengizinkan atribut `nip` (atribut terkelola, tanpa validasi tambahan); client `simario`: `redirectUris` `["http://localhost:5173/oidc/callback/"]`, `webOrigins` `["http://localhost:5173"]`, `directAccessGrantsEnabled: false`, `secret` sama dengan `.env.example`. Tanpa pengguna di B0.

- [ ] **Step 1: Tulis realm** (cara termudah: buat lewat konsol admin Keycloak lokal, lalu ekspor dengan `kc.sh export --realm otorita-ikn` dan buang bagian yang tidak perlu).
- [ ] **Step 2: Verifikasi impor**: `docker compose down keycloak && docker compose up -d keycloak`; `curl -s http://localhost:8080/realms/otorita-ikn/.well-known/openid-configuration` → `"issuer":"http://localhost:8080/realms/otorita-ikn"`; konsol admin menampilkan client `simario` dengan mapper `nip`.
- [ ] **Step 3: Komit**

```bash
git add infra/keycloak/realm-export.json .env.example
git commit -m "feat: add local keycloak realm for otorita ikn"
```

---

### Task 7: Vektor uji bersama — pita skor sebagai contoh pertama

**Files:**
- Create: `shared/test-vectors/README.md`, `shared/test-vectors/score-bands.json`
- Create: `backend/simario/domain/__init__.py`, `backend/simario/domain/score_bands.py`, `backend/tests/vectors.py`, `backend/tests/domain/test_score_bands_vectors.py`
- Create: `frontend/src/domain/scoreBands.vectors.test.ts`
- Modify: `frontend/vite.config.ts` (alias `@vectors` → `../shared/test-vectors`), `frontend/tsconfig.app.json` (path `@vectors/*`)

**Interfaces:**
- Produces:
  - Format berkas vektor: `{"source": "<berkas TS acuan>", "rules": {"<namaFungsiTS>": [{"name": str, "input": {...}, "expected": any}]}}`; kunci camelCase seperti TS.
  - `tests.vectors.load_vectors(name: str) -> dict[str, list[dict[str, Any]]]` (membaca `shared/test-vectors/<name>.json`, mengubah kunci `input` ke snake_case).
  - `simario.domain.score_bands`: `Predicate = Literal["kurang", "cukup", "terkendali"]`; `BandLike` (TypedDict: `lower_exclusive: float | None`, `upper_inclusive: float`, `order: int`, `predicate: Predicate`); `predicate_for(score: float, bands: Sequence[BandLike]) -> Predicate | None`; `validate_bands(bands: Sequence[BandLike]) -> list[BandProblem]` dengan `BandProblem` = dict `{"kind": "gap"|"overlap"|"range", "from": float, "to": float}`. Perilaku = `frontend/src/domain/scoreBands.ts` (`predicateFor`, `validateBands`).

Kasus wajib di `score-bands.json` (pita aktif: `{lowerExclusive: null, upper 2.0, kurang}`, `{2.0, 3.0, cukup}`, `{3.0, 4.0, terkendali}`):
- `predicateFor`: 0 → `kurang`; 2.0 → `kurang`; 2.1 → `cukup`; 3.0 → `cukup`; 3.1 → `terkendali`; 4.0 → `terkendali`; 4.5 → `null`; −1 → `null`.
- `validateBands`: pita aktif → `[]`; pita kedua `lowerExclusive` 2.5 → `[{kind: "gap", from: 2.0, to: 2.5}]`; pita kedua `lowerExclusive` 1.5 → `[{kind: "overlap", from: 1.5, to: 2.0}]`; pita terakhir `upperInclusive` 3.5 → `[{kind: "gap", from: 3.5, to: 4}]`; daftar kosong → `[{kind: "range", from: 0, to: 4}]`.

- [ ] **Step 1: Tulis `score-bands.json`** dengan kasus di atas dan `README.md` (format, aturan: vektor ditambah dari kasus `*.test.ts`; kedua sisi wajib lulus; vektor tidak diedit untuk membuat satu sisi lulus tanpa persetujuan).
- [ ] **Step 2: Tulis uji di kedua sisi** — Vitest: `describe.each` atas `rules.predicateFor` / `rules.validateBands`, `expect(predicateFor(input.score, input.bands)).toEqual(expected)`; pytest: `@pytest.mark.parametrize` atas `load_vectors("score-bands")`, `assert predicate_for(**case["input"]) == case["expected"]`.
- [ ] **Step 3: Jalankan**: `npm run test -- scoreBands.vectors` → PASS (fungsi TS sudah ada); `uv run pytest tests/domain -v` → FAIL (modul Python belum ada).
- [ ] **Step 4: Implementasi `score_bands.py`** sesuai Interfaces.
- [ ] **Step 5: Jalankan, pastikan lulus**: `uv run pytest tests/domain -v` → PASS; `npm run test`, `npm run lint`, ruff, mypy bersih.
- [ ] **Step 6: Komit**

```bash
git add shared backend frontend/vite.config.ts frontend/tsconfig.app.json frontend/src/domain/scoreBands.vectors.test.ts
git commit -m "test: add shared test vectors for score bands"
```

---

### Task 8: Dokumen dan checkpoint B0

**Files:**
- Modify: `docs/05_local_dev_and_testing.md` (bagian baru "Backend lokal"), `docs/02_frontend.md` (proxy Vite, `api:types`, alias `@vectors`), `docs/03_api_contract.md` (§2 dan §2.1: amplop galat, status HTTP, bentuk paginasi kini **diputuskan**; pesan bawaan baru), `docs/00_arsitektur.md` (§1 baris Backend: "🟨 kerangka (B0)"), `CLAUDE.md` (centang B0, status `✅ selesai`)

- [ ] **Step 1: Tulis "Backend lokal" di `docs/05_…`**: prasyarat (Docker Desktop, `uv`, Node 24), langkah pertama kali (`cp .env.example .env`, `docker compose up -d --build`, tunggu ClamAV), tabel port (5173, 8000, 8080, 9000/9001, 5432, 6379), perintah uji/lint backend, regenerasi skema (`spectacular` → `npm run api:types`), cara reset volume (`docker compose down -v`).
- [ ] **Step 2: Perbarui dokumen lain** sesuai daftar Files.
- [ ] **Step 3: Jalankan semua gerbang**: dari `frontend/`: `npm run build`, `npm run test`, `npm run lint`; dari `backend/`: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`; `docker compose ps` semua sehat; `npm run dev` menampilkan prototipe seperti sebelumnya tanpa galat konsol.
- [ ] **Step 4: Centang B0 di CLAUDE.md** dan komit checkpoint

```bash
git add CLAUDE.md docs
git commit -m "feat: add backend skeleton and local services (checkpoint B0)"
```

- [ ] **Step 5: Laporan checkpoint** (Bahasa Indonesia): apa yang selesai, cara mencoba (perintah + URL health/schema/Keycloak), uji yang ditambahkan, pesan galat bawaan baru yang perlu disetujui, versi image yang dipilih (RustFS, Keycloak), perbedaan dari spec bila ada. Tanyakan: "Lanjut ke Tahap B1?"
