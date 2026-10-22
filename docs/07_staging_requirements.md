# 07 — Kebutuhan server staging (untuk tim infrastruktur OIKN)

> Status dokumen: 22 Okt 2026 · checkpoint B4s · spec integrasi backend §4.11, §7.

Staging dipakai untuk uji coba PPK (data sungguhan, jam nyata, tanpa data contoh) dan UAT. Konfigurasinya sama dengan produksi; hanya isi `.env.prod` yang berbeda. Cara menyebarkan ada di [05_local_dev_and_testing.md §2b](05_local_dev_and_testing.md#2b-staging-dan-produksi).

## 1. Server

| Butir | Minimum | Disarankan | Catatan |
|---|---|---|---|
| OS | Linux x86-64 dengan Docker Engine 24+ dan Docker Compose v2 | Ubuntu 24.04 LTS | Semua layanan berjalan sebagai kontainer |
| CPU | 4 vCPU | 8 vCPU | PostgreSQL, gunicorn, Celery, RustFS, Keycloak |
| RAM | 8 GB | 16 GB | PostgreSQL, gunicorn (3 worker), Celery |
| Disk sistem | 40 GB | 80 GB | Image kontainer, log |
| Disk data | 200 GB | 500 GB | PostgreSQL + RustFS (lampiran: kuota 1 GB per jabatan Lini 1 per TA, NFR-012) |
| Cadangan | Volume terpisah atau penyimpanan cadangan OIKN | Harian, simpan 30 hari | `infra/backup/backup.sh` (pg_dump + objek bucket + manifest) dan `restore.sh` diuji di B9 (NFR-014); besar ≈ ukuran basis data + lampiran |
| Antivirus | Antivirus VM yang sudah dikelola tim infrastruktur OIKN | — | SIMARIO tidak membawa pemindai sendiri (PRD v2.9.2, NFR-010). Mohon pastikan volume data RustFS (`rustfs-data`) tidak dihapus/dikarantina otomatis oleh antivirus — cukup dilaporkan — karena berkas di dalamnya adalah format internal RustFS; lihat R-12 di [04_risk_and_debt.md](04_risk_and_debt.md) |

## 2. Jaringan

- Nama DNS, mis. `simario-staging.ikn.go.id`, mengarah ke server.
- Port masuk **443** (HTTPS) dan **80** (dialihkan ke HTTPS). Tidak ada port lain yang perlu dibuka; PostgreSQL, Redis, dan RustFS hanya di jaringan internal Docker.
- Akses keluar: registry image Docker (atau mirror internal).
- Bila memakai Keycloak OIKN: server dapat menjangkau `sso.ikn.go.id` (backchannel token dan Admin REST).

## 3. Sertifikat TLS

Sertifikat untuk nama DNS di atas (fullchain + private key, PEM), dipasang di direktori `TLS_CERT_DIR` sebagai `fullchain.pem` dan `privkey.pem`. Perpanjangan dilakukan dengan mengganti berkas lalu `docker compose -f docker-compose.prod.yml --env-file .env.prod restart nginx`.

## 4. Keycloak OIKN (sso.ikn.go.id) — bila aksesnya sudah ada

Satu client **confidential** untuk SIMARIO:

| Pengaturan | Nilai |
|---|---|
| Client ID | `simario` (atau nama lain, diisi di `OIDC_CLIENT_ID`) |
| Valid redirect URI | `https://<domain>/oidc/callback/` |
| Valid post logout redirect URI | `https://<domain>/login` |
| Web origin | `https://<domain>` |
| Standard flow | aktif; direct access grants nonaktif |
| Klaim NIP | mapper atribut pengguna `nip` → klaim `nip` di ID token dan userinfo (nama klaim lain → `OIDC_NIP_CLAIM`) |
| Service account | aktif, dengan peran realm-management `view-users` (pencarian pegawai saat menunjuk Operator) |

SIMARIO tidak pernah membuat akun dari SSO (RB-AUT-003): pengguna harus didaftarkan dulu lewat `/pengaturan/pengguna` atau impor CSV. Sampai client ini ada, uji coba memakai akun lokal.

## 5. Yang disiapkan tim SIMARIO

- Repositori (atau paket rilis) berisi `docker-compose.prod.yml`, `infra/nginx/`, `docs/seed/`.
- `.env.prod` dari `.env.prod.example`, dengan rahasia yang dibuat di server (tidak dikirim lewat surel/chat).
- Superadmin pertama: `docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python manage.py create_superadmin --nip … --name …` (kata sandi sementara tampil sekali, wajib diganti saat masuk).
- Data pengguna dan jabatan uji coba dimuat lewat `/pengaturan/impor` (CSV).
