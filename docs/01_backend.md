# 01 — Backend

> Status dokumen: 21 Okt 2026 · PRD v2.9 · kode `frontend/` per komit `7bebb66`.

## 1. Status: backend belum ada

**Belum ada kode backend di repositori ini.** Tidak ada folder `backend/`, tidak ada proyek Django, migrasi, Celery, atau konfigurasi Docker. Semua yang biasanya dikerjakan server saat ini disimulasikan di browser oleh lapisan data frontend:

| Tanggung jawab server | Di mana sekarang (prototipe) |
|---|---|
| Endpoint API | `frontend/src/data/repository.ts` + `frontend/src/data/api/*.ts` |
| Basis data | `frontend/src/data/local/store.ts` (zustand + immer) → `localStorage` `simario:v1:<koleksi>` |
| Pemeriksaan izin | `requireActor()` (`data/local/actor.ts`), `checkAction()` (`domain/rules/access.ts`) |
| Serializer dengan aturan visibilitas | Fungsi `build*` di `data/api/*` (mis. `buildAssessment`, `buildBoard`, `buildSheetView`) |
| Jejak audit & notifikasi | `writeAudit`, `writeNotification` (`data/local/writers.ts`) |
| Tugas terjadwal (Celery Beat) | `data/local/scheduler.ts` |
| Data awal (fixture) | `frontend/src/data/seed/*` + `docs/seed/*.json` |
| Autentikasi | Pemilih persona & akun lokal seed (`authApi`), tanpa Keycloak |
| Jam server | Tanggal simulasi `state/clock.ts` |

Dokumen ini menjelaskan **target backend** menurut PRD dan **apa yang perlu dipindahkan** dari prototipe. Semua yang bertanda *usulan* belum diputuskan dan perlu disetujui sebelum dibangun.

## 2. Stack target (PRD §2.1)

| Aspek | Ketentuan |
|---|---|
| Kerangka | Django 5 + Django REST Framework |
| Asinkron & terjadwal | Celery + Redis; Celery Beat untuk pengingat tenggat, pembukaan perbandingan, deteksi Berulang, arsip |
| Basis data | PostgreSQL 16 |
| Penyimpanan objek | MinIO, terpisah dari basis data, untuk lampiran dan berkas SK/surat |
| Autentikasi | Keycloak (OIDC), realm "Otorita IKN" di sso.ikn.go.id; NIP sebagai pengenal tetap; akun lokal sebagai cadangan |
| Pemindaian berkas | ClamAV sebelum berkas dapat diunduh (NFR-010) |
| Penyebaran | Docker Compose di belakang nginx; staging dan produksi terpisah; lingkungan internal OIKN |

Kebutuhan non-fungsional yang menjadi tanggung jawab backend (PRD §2.3): HTTPS, sanitasi XSS (isi komentar teks biasa), CSRF, kata sandi lokal ber-hash, pembatasan percobaan masuk (NFR-002); audit hanya-tambah dengan redaksi VIS-8 (NFR-007); sesi 60 menit (NFR-008); format & ukuran berkas diverifikasi di server dari isinya (NFR-009); URL pre-signed 5 menit setelah cek izin dan konfidensialitas (NFR-011); kuota 1 GB per jabatan Lini 1 per TA (NFR-012); retensi minimal 5 TA (NFR-013); cadangan harian, RPO 24 jam, RTO 8 jam (NFR-014); target konkurensi 120 pengguna sampai jabatan di-seed (NFR-006).

## 3. Struktur aplikasi Django (usulan)

Usulan pembagian app mengikuti modul PRD §1.7 dan berkas `data/api/*` agar pemindahan bisa per modul:

| App (usulan) | Entitas utama | Asal logika di prototipe |
|---|---|---|
| `accounts` | `User`, sesi, Keycloak, akun lokal | `authApi` (`repository.ts`), `state/session.ts` |
| `org` | `OrgUnit`, `PositionType`, `Position`, `PositionOccupancy`, `PositionDelegate`, `Role`, `Permission`, `RolePermission`, `UserRole`, `MonitoringAssignment`, `MonitoringSupport` | `api/admin.ts`, `api/master.ts` (jabatan), `domain/permissions.ts`, `domain/rules/access.ts` |
| `calendar` | `FiscalYear`, `Quarter`, `QuarterAssessor` | `api/calendar.ts`, `domain/calendar.ts` |
| `reference` | `Stage`, `DataUmumForm`, `RiskTemplate`, `MitigationTemplate`, `RiskProposal`, `ScoreBandVersion`, `ScoreBand`, `ScoreOption` | `api/master.ts`, `domain/scoreBands.ts` |
| `registers` | `Register`, `RegisterStageDeclaration`, `RegisterRisk`, `RegisterMitigation` | `api/register.ts`, `api/registerView.ts` (read model per pembaca), `domain/rules/register.ts` |
| `board` | `Comment`, `Mention`, `ThreadSubscription`, `ThreadView`, `Attachment` | `api/thread.ts`, `api/board.ts`, `domain/rules/board.ts` |
| `assessments` | `RiskQuarter`, `Assessment`, `ComparisonResult` | `api/assessment.ts`, `local/comparisons.ts`, `domain/rules/assessment.ts`, `domain/rules/comparison.ts`, `domain/rules/visibility.ts` |
| `sheets` | `PrintSnapshot`, `PrintPhotoSelection` | `api/sheets.ts`, `domain/rules/sheetPayload.ts`, `domain/rules/sheets.ts` |
| `notifications` | `Notification` | `notificationApi`, `local/reminders.ts`, `local/writers.ts` |
| `audit` | `AuditLog` | `local/writers.ts`, `api/insights.ts` (`buildAudit`, `redact`) |
| `insights` | `PageTiming`, metrik | `api/insights.ts` (`buildMetrics`, `metricsCsv`) |
| `imports` | `ImportJob` | `api/importer.ts` |
| `home` | (read model saja) | `api/home.ts`, `api/history.ts` |

Prinsip pemindahan:

- Aturan murni di `frontend/src/domain/rules/` adalah **spesifikasi yang dapat dieksekusi**. Tulis ulang di Python dengan kasus uji yang sama (berkas `*.test.ts` menjadi acuan), atau pertahankan sebagai paritas uji dua sisi.
- Pemeriksaan selalu tiga lapis (RB-ADM-001): izin (kode 1–26) → holding/penugasan/aturan lini pada jabatan **yang bertindak** (INV-25) → Pejabat/Pengisi untuk tindakan akhir (INV-12, INV-24). Jangan pernah memeriksa nama peran (RB-ADM-002).
- Visibilitas VIS-1…9 diterapkan di **serializer/selector** dan diuji khusus sebelum modul penilaian dianggap selesai (PRD Lampiran E: INV-16, INV-17).
- Setiap mutasi menulis `AuditLog` dalam transaksi yang sama.

## 4. Model data: PRD vs prototipe

Entitas acuan: PRD §2.8.1 (snake_case). Prototipe: `frontend/src/domain/types.ts` (camelCase) dengan koleksi di `frontend/src/data/db.ts`. Konversi nama: `snake_case` di Django ↔ `camelCase` di TypeScript (lihat [03_api_contract.md §2](03_api_contract.md#2-konvensi)).

### 4.1 Koleksi prototipe → tabel

| Koleksi (`db.ts`) | Entitas PRD | | Koleksi | Entitas PRD |
|---|---|---|---|---|
| `orgUnits` | `OrgUnit` | | `registers` | `Register` |
| `positionTypes` | `PositionType` | | `declarations` | `RegisterStageDeclaration` |
| `positions` | `Position` | | `risks` | `RegisterRisk` |
| `users` | `User` | | `mitigations` | `RegisterMitigation` |
| `occupancies` | `PositionOccupancy` | | `comments` | `Comment` (+ `Mention`) |
| `delegates` | `PositionDelegate` | | `subscriptions` | `ThreadSubscription` |
| `roles` | `Role` | | `threadViews` | `ThreadView` |
| `rolePermissions` | `RolePermission` | | `riskQuarters` | `RiskQuarter` |
| `userRoles` | `UserRole` | | `assessments` | `Assessment` |
| `assignments` | `MonitoringAssignment` (+ `MonitoringSupport`) | | `results` | `ComparisonResult` |
| `fiscalYears` | `FiscalYear` | | `attachments` | `Attachment` |
| `quarters` | `Quarter` | | `snapshots` | `PrintSnapshot` |
| `quarterAssessors` | `QuarterAssessor` | | `notifications` | `Notification` |
| `stages` | `Stage` | | `audit` | `AuditLog` |
| `dataUmumForms` | `DataUmumForm` | | `preferences` | `UserPreference` (+ `PrintPhotoSelection`) |
| `riskTemplates` | `RiskTemplate` | | `scoreBandVersions` | `ScoreBandVersion` |
| `mitigationTemplates` | `MitigationTemplate` | | `scoreBands` | `ScoreBand` |
| `proposals` | `RiskProposal` | | `scoreOptions` | `ScoreOption` |

Tidak ada di prototipe: `Permission` (katalog statis di `domain/permissions.ts`), `PageTiming`, `ImportJob`, `ScaleCriteriaVersion`/`ScaleCriteriaRow`/`RiskLevelMapping` (disiapkan PRD, belum dipakai).

### 4.2 Perbedaan bentuk yang harus diputuskan saat membangun backend

| Entitas | Prototipe | PRD | Saran |
|---|---|---|---|
| `User` | `password` teks polos (seed), `orgUnitId`; tanpa `keycloakSub` | `keycloak_sub`, kata sandi ber-hash | Ikuti PRD; tambah `org_unit_id` bila tetap ditampilkan di Pengguna |
| `PositionType` | `code`, `identitySchema` berupa array `{key,label,kind}` | `identity_schema` JSONB | JSONB berisi array yang sama |
| `Position` | `shortName` (KEP, PAI), `deactivatedAt`, `deactivationReason` | tidak ada | Tambahkan (dipakai chip predikat & nonaktif beralasan) |
| `PositionOccupancy` / `PositionDelegate` | `decreeFile` / `letterFile` = nama berkas | `decree_object_key` / `letter_object_key` | Kunci objek MinIO |
| `UserRole` | tanpa `source_ref` | `source_ref` | Ikuti PRD |
| `MonitoringAssignment` | `supports[]` tertanam | tabel `MonitoringSupport` | Tabel terpisah |
| `DataUmumForm` | `fields[]`, **`objectiveEnabled`** | `schema` JSONB, Tujuan isian tetap wajib | `objective_enabled` adalah **keputusan pengguna yang berbeda dari PRD** — perbarui PRD atau konfirmasi ulang |
| `RiskTemplate` / `MitigationTemplate` | `code` stabil (mis. `PPK-T4-FR-03`), `order`, `updatedAt`; tanpa `usage_count`, `default_impact/likelihood` | punya `usage_count`, impact/likelihood | Pertahankan `code` sebagai kunci unik; `usage_count` dihitung (lihat `templateUsage`) |
| `ScoreBandVersion` | `number`; status `draft`/`scheduled`/`active`/`retired` | `effective_from`, `status` | Status `scheduled` ditambahkan Tahap 3 |
| `ScoreBand` | `guidance` per pita; `lowerExclusive` boleh null (0 tertutup) | panduan per predikat | Simpan panduan di pita |
| `RegisterRisk` | `order`, flag `template_inactive`; tanpa `impact`/`likelihood`/`score` | kolom disiapkan, tidak dipakai | Sediakan kolomnya, nullable |
| `Comment` | `mentionUserIds[]` | tabel `Mention` | Tabel `Mention` |
| `RiskQuarter` | tanpa `no_step_flag` (dihitung `isQuiet`) | `no_step_flag` | Kolom tersimpan + diperbarui saat Langkah/tarik |
| `Assessment` | `updatedAt` | — | Tambahkan (dipakai autosave & `seedAsOf`) |
| `Attachment` | tanpa `object_key`; `blobKey` (IndexedDB, belum dipakai) | `object_key` | Kunci MinIO |
| `PrintSnapshot` | pilihan foto ikut di payload | `photo_attachment_ids` | Ikuti PRD |
| `PrintPhotoSelection` | disimpan sebagai `UserPreference` dengan `userId = '*'` | tabel sendiri | Tabel sendiri |
| `Notification` | **`eventKey`** untuk idempotensi | tidak ada | Tambahkan, unik per (`user_id`, `event_key`) |
| `AuditLog` | `actingAs` juga `superadmin`/`pengelola`/`sistem` | `acting_as` | Tetapkan enum final |
| `ImportJob` | tidak ada; riwayat dibaca dari audit `impor_*` | tabel | Tabel |
| `PageTiming` | tidak ada | tabel (Tujuan 8) | Bangun bersama instrumentasi |
| Format waktu | `ISODateTime` = `YYYY-MM-DDTHH:mm` tanpa zona | — | `timestamptz`; tetapkan zona tampilan (lihat R-06 di [04_risk_and_debt.md](04_risk_and_debt.md)) |

### 4.3 Invarian yang harus dijaga di basis data

| Invarian | Penegakan yang disarankan |
|---|---|
| INV-1 `Register` unik (`position_id`, `fiscal_year`) | `UniqueConstraint` |
| INV-2 `Position.code` unik per `org_unit_id` | `UniqueConstraint` |
| INV-15 `Assessment` unik (`risk_quarter_id`, `assessor_position_id`) | `UniqueConstraint` |
| INV-3 tepat satu `ScoreBandVersion` aktif, pita menutup 0–4 tanpa celah | Partial unique index + validasi service (`validateBands`) |
| INV-26 setiap predikat punya ≥1 `ScoreOption`; nilai/label unik | Validasi service (`validateOptions`) + constraint unik |
| INV-4, INV-11, INV-13, INV-14 (holding, delegasi, penugasan) | Validasi service dalam transaksi + constraint parsial |
| INV-6 `AuditLog` tanpa UPDATE/DELETE | Trigger PostgreSQL |
| INV-7, INV-18, INV-19, INV-21, INV-22, INV-23 (kekekalan) | Service menolak + trigger opsional untuk kolom kunci |
| INV-16, INV-17 (buta & konfidensial) | Serializer + uji API khusus |

## 5. Tugas terjadwal

Prototipe mendaftarkan tugas di `data/local/scheduler.ts` (`registerTask`) dan menjalankan semuanya saat aplikasi mulai dan setiap jam simulasi digeser (`main.tsx`, tombol DevPanel). Hanya `runComparisons` yang juga dipanggil langsung setelah event (`assessmentApi.finalise`, `calendarApi.excludeAssessor`); `RiskQuarter` untuk risiko yang terbit di tengah triwulan dibuat langsung oleh `registerApi.publish`. Di backend, tiap tugas menjadi task Celery idempoten (Beat harian/per jam) dan sebagian juga dipanggil langsung setelah event.

| Nama tugas | Fungsi | Isi | Pemicu event | PRD |
|---|---|---|---|---|
| `attachment-scan` | `finishAttachmentScans` | `pending` → `clean` (prototipe: juga `setTimeout` 2 detik) | Unggah | NFR-010 |
| `risk-quarters` | `ensureRiskQuarters` | Buat `RiskQuarter` untuk risiko yang dinilai di triwulan yang sudah mulai | Terbit | RB-REG-006 |
| `score-bands` | `activateScoreBands` | Versi `scheduled` menjadi `active` pada tanggal berlaku; triwulan mengunci versinya saat jendela pertama dibuka | — | FR-MST-007 |
| `comparisons` | `runComparisons` (`local/comparisons.ts`) | Pembukaan perbandingan penuh/sebagian, "Tidak dinilai Lini 1", Berulang, notifikasi FR-NTF-007/008/009 | Tuntaskan, kecualikan penilai | §2.5, FR-NIL-007/009/011 |
| `reminders` | `runReminders` (`local/reminders.ts`) | Buka jendela, H-7, H-1; penjelasan H-1; 14 hari sebelum arsip; tidak memunculkan peristiwa > 3 hari yang lalu | — | FR-NTF-005/006/009/012 |
| `sheet-freeze` | `runSheetFreeze` (`api/sheets.ts`) | Versi lembar otomatis (`auto_freeze`) dan `superseded_by` | — (prototipe: hanya saat aplikasi mulai / jam digeser; backend sebaiknya juga setelah kirim penjelasan dan hasil terlambat dibuka) | FR-LBR-009 |
| `calendar` | `runCalendar` (`api/calendar.ts`) | Status TA `open`→`closing`, set penilai Lini 3 saat `lini3_opens_on`, arsip pada batas keras | — | §2.5, FR-ADM-007 |
| `delegations` | `expireDelegations` (`api/admin.ts`) | Delegasi lewat tanggal akhir → `expired` | — | FR-ADM-010 |

Catatan: semua tugas harus idempoten dan aman bila jam "melompat" (pengujian prototipe sering menggeser tanggal jauh ke depan).

## 6. Autentikasi & sesi

| Ketentuan PRD | Prototipe | Backend |
|---|---|---|
| FR-AUT-001 SSO Keycloak, cocok lewat `nip` | Pemilih persona memanggil `authApi.signInSso(nip)`; pesan "belum terdaftar" + audit sudah sesuai teks PRD | OIDC; klaim NIP dari token; tidak pernah membuat akun dari login (RB-AUT-003) |
| FR-AUT-002 akun lokal, kunci 5×/15 menit | `authApi.signInLocal`, lockout disimpan di sesi browser | Hash kata sandi, throttling di server |
| FR-AUT-003/004 ganti kata sandi | `authApi.changePassword` (min. 12 karakter, beda dari awal) | Sama + akhiri sesi lain |
| FR-AUT-005 atur ulang oleh Superadmin | `adminApi.resetPassword` (kata sandi sementara ditampilkan sekali) | Sama; audit tanpa nilai |
| FR-AUT-008 60 menit tidak aktif | `AppShell` memantau aktivitas → `/login?alasan=sesi-berakhir` | Sesi server; perubahan peran/holding membatalkan sesi (**belum ada di prototipe**) |
| OQ-11 cari pegawai di Keycloak | `adminApi.searchStaff` dari `staffDirectory` seed | Lookup realm Keycloak |

## 7. Berkas & lampiran

Prototipe hanya menyimpan metadata `Attachment` (nama, ukuran, MIME, `scanStatus`, `isConfidential`); isi berkas tidak disimpan, gambar tampil sebagai placeholder, unduhan berupa berkas contoh. Validasi klien: maksimal 10 berkas, 20 MB, ekstensi `pdf docx xlsx png jpg jpeg mp4`, kuota 1 GB (`domain/rules/board.ts`). Backend wajib: verifikasi MIME dari isi, ClamAV, karantina + notifikasi + audit bila gagal, URL pre-signed 5 menit setelah cek cakupan dan VIS-3, bucket tidak publik.

## 8. Daftar kerja pemindahan ke backend

1. Proyek Django + Docker Compose (nginx, Django, PostgreSQL, Redis, Celery worker/beat, MinIO, ClamAV, Keycloak dev).
2. Model + migrasi sesuai §4, constraint dan trigger §4.3.
3. Fixture/management command dari `docs/seed/template_risiko_rapim.json` (4 jenis, 14 tahap, 146 risiko, 302 mitigasi) dan `docs/seed/pilihan_penilaian.json`; data contoh persona dari `frontend/src/data/seed/` hanya untuk staging.
4. Endpoint per namespace mengikuti [03_api_contract.md](03_api_contract.md), termasuk endpoint baca yang sekarang belum ada (halaman membaca store langsung).
5. Pindahkan aturan `domain/rules/*` + uji paritas; uji API khusus INV-16/INV-17 sebelum NIL dianggap selesai.
6. Ganti `frontend/src/data/local/call.ts` dan implementasi namespace dengan klien HTTP; hapus DevPanel dari build produksi.
7. Celery Beat untuk §5; polling 30 detik di utas (NFR-015).
8. Keycloak, sesi, CSRF, throttling; hapus akun persona.
9. Cadangan & uji pemulihan sebelum go-live (NFR-014).
