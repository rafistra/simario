# CLAUDE.md — SIMARIO

Panduan kerja untuk Claude di repositori ini. Baca seluruhnya sebelum menulis kode.

## 1. Apa yang dibangun

**SIMARIO** (Sistem Informasi Mitigasi Risiko Otorita IKN) — **prototipe frontend** yang terasa seperti aplikasi asli, untuk demo dan uji pengguna.

- Semua modul PRD masuk cakupan (AUT, BRD, REG, PPN, NIL, RWY, LBR, MST, NTF, ADM), dikerjakan bertahap dengan checkpoint (§9).
- Prototipe frontend selesai (Tahap 0–10): data disimpan di `localStorage` lewat satu lapisan repository.
- **Integrasi backend sedang berjalan** di branch `feat/backend-integration`, menurut spec `docs/superpowers/specs/2026-10-21-backend-integration-design.md` (Django + DRF, PostgreSQL, Celery, RustFS, Keycloak, ClamAV; tahap B0–B9, §9b). Mode `localStorage` tetap jalan selama transisi dan dihapus di B9.

## 2. Sumber kebenaran (urutan prioritas)

1. `docs/PRD_SIMARIO_v2.9.md` — perilaku, aturan, salinan teks (copy), FR/VIS/INV. **PRD menang** bila ada perbedaan.
1a. `docs/superpowers/specs/2026-10-21-backend-integration-design.md` — keputusan integrasi backend yang dikunci (§4 spec). Menyimpang darinya hanya setelah bertanya ke pengguna.
2. `docs/DesignSystem_SIMARIO.md` — warna, tipografi, radius, bayangan, komponen (berbasis Aksara).
3. `Simario.pen` (Pencil) — mockup 99 frame. Bacanya **hanya lewat MCP Pencil** (`mcp__pencil__execute` dengan `Get`/`Print`/`TakeScreenshot`), jangan dengan Read/Grep. Catatan penting di dalamnya:
   - `DesignBrief` (THmWq): keputusan desain, persona, linimasa data contoh.
   - `FrameIndex` (TvVoU): daftar semua frame per modul beserta rutenya.
   - `AccessibilityContract` (lfTFq): kontras, target sentuh, urutan fokus, peran ARIA.
   - Setiap frame punya note di kanannya (StateContract, validasi, izin, FR id) — itulah spesifikasi halaman.
4. `docs/seed/template_risiko_rapim.json` — **template risiko & mitigasi per jenis pemilik risiko dan tahap**, diekstrak dari dek Rapim (`docs/PPT Konsep Pengembangan … (Rapim) (1).pptx`, 12 Okt 2026). Data referensi final (FR-MST-010): 4 jenis (KPA/Kasatker, PPK, Pokja Pemilihan, Pejabat Pengadaan), 14 tahap, 146 risiko, 302 mitigasi, plus Data Umum dan panduan skoring. Koreksi atas cacat dek tercatat di `seedNotes`.
5. `docs/Prompt_Pencil_SIMARIO.md` — konteks pembuatan mockup saja.

Bila PRD dan mockup berbeda, ikuti PRD dan catat perbedaannya di laporan.

### Dokumentasi teknis (`docs/00_…`–`docs/06_…`)

Ringkasan keadaan kode dan rancangan, diturunkan dari PRD dan kode. Baca dokumen yang relevan sebelum mengubah bagian terkait, dan perbarui dalam komit yang sama bila isinya tidak lagi benar. PRD tetap menang bila berbeda; kode adalah keadaan sebenarnya.

| Berkas | Isi | Perbarui bila |
|---|---|---|
| [`docs/00_arsitektur.md`](docs/00_arsitektur.md) | Arsitektur prototipe vs target, lapisan, modul, prinsip, keputusan arsitektur | Lapisan, alur data, atau keputusan arsitektur berubah |
| [`docs/01_backend.md`](docs/01_backend.md) | Status backend (B1 selesai), keputusan stack (Django/Celery/RustFS/Keycloak), model data PRD vs prototipe, tugas terjadwal | Entitas, tugas terjadwal, atau rencana backend berubah |
| [`docs/02_frontend.md`](docs/02_frontend.md) | Stack, struktur folder, rute, pola halaman, komponen, gaya, aksesibilitas | Rute, komponen, atau pola halaman baru |
| [`docs/03_api_contract.md`](docs/03_api_contract.md) | Kontrak `data/repository.ts` per namespace, galat, usulan endpoint REST, data yang masih dibaca langsung dari store | Metode repository ditambah atau diubah |
| [`docs/04_risk_and_debt.md`](docs/04_risk_and_debt.md) | Risiko produk/teknis dan utang teknis (R-P, R, U) | Menemukan atau menyelesaikan risiko/utang |
| [`docs/05_local_dev_and_testing.md`](docs/05_local_dev_and_testing.md) | Menjalankan lokal, persona, DevPanel, pengujian, verifikasi visual, rilis Netlify | Skrip, persona, seed, atau uji berubah |
| [`docs/06_user_stories.md`](docs/06_user_stories.md) | 71 user story PRD (Bahasa Indonesia) dengan status implementasi dan cara mencobanya | Status sebuah cerita berubah |
| [`docs/07_staging_requirements.md`](docs/07_staging_requirements.md) | Kebutuhan server staging untuk tim infrastruktur OIKN (server, jaringan, TLS, client Keycloak) | Konfigurasi staging/produksi berubah |

## 3. Stack & struktur

- **React 18 + Vite + TypeScript** (PRD §2.1), React Router, Zustand, `lucide-react`. Versi dikunci persis di `frontend/package.json` (React 18.3.1, Vite 6.4, React Router 7 — v6 punya kerentanan, v7 tetap mendukung React 18 —, Vitest 5). Alias impor: `@/` → `src/`, `@seed/` → `docs/seed/`.
- CSS biasa berbasis variabel token (tanpa Tailwind, tanpa UI kit). CSS Modules atau satu berkas CSS per komponen.
- Fon: Newsreader, Plus Jakarta Sans, JetBrains Mono (Google Fonts / `@fontsource`).
- Kode berada di `frontend/`. Git diinisialisasi di root `simario2/`.

```
frontend/src/
  styles/        tokens.css (dari Simario.pen: Print(GetVariables())), base.css, print.css
  components/    satu folder per komponen library (nama sama dengan di .pen)
  layout/        AppShell, Sidebar, Topbar, WorkspaceHeader, MobileDrawer
  pages/         per modul: auth, home, register, board, assessment, history, sheets, master, notifications, admin, faults
  domain/        types.ts (entitas PRD §2.8.1), rules/ (fungsi murni aturan bisnis), visibility.ts (VIS-1…9)
  data/          db.ts (koleksi), repository.ts (antarmuka async), local/ (store, call, writers, scheduler), seed/ (data contoh)
  lib/           format, useQuery, useFocusTrap, theme
  state/         session (persona, jabatan aktif, tampilan peran), clock (tanggal simulasi), toast
  dev/           DevPanel (ganti persona, geser tanggal, reset data)
```

Backend (spec §4.1):

```
backend/
  pyproject.toml, uv.lock, manage.py, openapi.yaml (dihasilkan, dikomit)
  config/        settings/{base,local,test,staging,production}.py, urls.py, celery.py
  simario/
    core/        clock, errors (ApiError), pagination, health, storage
    domain/      aturan murni Python (tanpa ORM), padanan frontend/src/domain/rules/*
    accounts/ org/ calendar/ reference/ registers/ board/ assessments/
    sheets/ notifications/ audit/ insights/ imports/ home/ devtools/
  tests/         pytest (PostgreSQL sungguhan)
shared/test-vectors/   vektor uji JSON yang dijalankan Vitest dan pytest
infra/                 keycloak/ (realm lokal), nginx/ (produksi)
docker-compose.yml     layanan lokal
```

## 4. Lapisan data

- `data/repository.ts` mendefinisikan antarmuka per agregat (`registers`, `comments`, `assessments`, …). Halaman **tidak pernah** menyentuh `localStorage` langsung.
- Implementasi lokal: satu kunci per koleksi, berawalan `simario:v1:`; ada `schemaVersion` — bila berubah, data di-seed ulang.
- Seed dimuat saat pertama kali dibuka dan bisa di-reset dari DevPanel.
- Setiap mutasi menulis `AuditLog` (append-only; tidak ada fungsi update/delete untuk audit) dan, bila relevan, `Notification` sesuai FR-NTF.
- Lampiran: simpan metadata (nama, ukuran, MIME, `scan_status`). Isi berkas gambar kecil (≤500 KB) boleh di IndexedDB; selebihnya placeholder. Status "Memindai…" disimulasikan ±2 detik lalu `clean`.
- Simulasi asinkron ringan (latensi 150–400 ms) agar skeleton dan "Menyimpan…" terlihat; bisa dimatikan di DevPanel.
- **Transisi ke backend:** namespace dipindah dari implementasi lokal ke `data/http/` per tahap B (tanda tangan metode sama); `repository.ts` mengganti impornya. Tidak ada flag sumber data.

## 5. Waktu, sesi, persona

- **Tanggal simulasi** (`state/clock`) menggantikan `new Date()` di seluruh aturan bisnis. Default: **6 Apr 2027**. DevPanel bisa menggesernya; tugas terjadwal (pembukaan perbandingan, Terlambat, deteksi Berulang, versi lembar otomatis, arsip) dievaluasi ulang setiap tanggal berubah dan pada setiap event tuntaskan.
- **Login**: `/login` tampil sesuai mockup. Sejak B1, tombol SSO membuka Keycloak lokal (persona: NIP + `simario-demo`); tombol "Masuk sebagai persona (mode pengembangan)" membuka pemilih persona (`/api/v1/dev/impersonate`); akun lokal menerima NIP + kata sandi seed.
- Sesi berakhir setelah 60 menit tidak aktif (bisa dipercepat di DevPanel) → `/login?alasan=sesi-berakhir`.
- Persona seed (konsisten dengan mockup):
  - Andi Wirawan — Pejabat PPK A-1 · DDKB (Lini 1)
  - Rafi Ananda — Operator PPK A-1
  - Bambang Hartono — Pejabat PPK A-2; Dimas Prasetyo — Operator PPK A-2 dan Pejabat Pengadaan Satker B, juga Pengisi Pokja 03
  - Siti Rahmawati — Lini 2 (Penanggung Jawab Pemantauan)
  - Lestari Wulandari — Operator UKPBJ (Lini 2 pendukung)
  - Hendra Gunawan — Direktorat Kepatuhan (Lini 3); Maya Kusuma — Direktorat Pengawasan dan Audit Internal (Lini 3)
  - Nur Aini — Pengelola Master Data; Admin DKB — Superadmin
- Linimasa TA 2027 (dari DesignBrief): TW I — Lini 3 buka 1 Jan, Lini 1 buka 1 Mar, tenggat L1 26 Mar, tenggat L3 2 Apr; TW II 1 Apr/1 Jun/25 Jun/2 Jul; TW III 1 Jul/1 Sep/24 Sep/1 Okt; TW IV 1 Okt/1 Des/31 Des/7 Jan 2028. Toleransi 7 hari, masa arsip 30 hari. TA 2026 diarsipkan 7 Feb 2027.
- **Template risiko:** `Stage`, `RiskTemplate`, dan `MitigationTemplate` di-seed **hanya** dari `docs/seed/template_risiko_rapim.json` — impor berkas itu, jangan menyalin ulang teksnya ke kode. Pertahankan `code` template (mis. `PPK-T4-FR-03`) sebagai kunci stabil. Default objective Data Umum dan isian identitas per jenis juga dari berkas itu.
- **Register contoh** (PPK A-1 dan lainnya) memilih risiko dari template tersebut dengan uraian persis (`description_snapshot`). Contoh uraian di mockup `.pen` bersifat ilustratif: bila tidak ada di dek, pakai template terdekat dari tahap yang benar, atau jadikan **risiko sendiri** (`is_custom = true`) yang sengaja menghasilkan usulan di `/master/usulan`. Contoh: "Penyerapan anggaran tidak mencapai target per Triwulan" ada di PPK tahap 2, bukan tahap 1; "Keterlambatan revisi DIPA menghambat jadwal pengadaan" tidak ada di dek → risiko sendiri.
- **Pita skor aktif (dikonfirmasi pengguna):** 0–2,0 Kurang Terkendali · 2,1–3,0 Cukup Terkendali · 3,1–4,0 Terkendali dengan Baik. Batas bawah eksklusif, batas atas inklusif. Pilihan penilaian bawaan: 0, 1, 2 (Kurang), 3 (Cukup), 4 (Terkendali dengan Baik).

## 6. Aturan bisnis yang wajib benar

Tulis sebagai fungsi murni di `domain/rules/` dan beri unit test (Vitest). Yang paling penting:

- **Izin = kemampuan; holding/penugasan = objek; Pejabat = tindakan akhir** (RB-ADM-001, INV-12, INV-24, INV-25). Jangan pernah mengecek nama peran di logika (RB-ADM-002) — cek kode izin 1–26 (FR-ADM-002).
- **Operator** tidak bisa menerbitkan, menuntaskan, mengirim penjelasan, atau menunjuk operator; tombolnya tampil nonaktif dengan "Dilakukan oleh [Nama Pejabat]" (§2.4). Pokja: hanya Pengisi.
- **Visibilitas (§2.7) diterapkan di selector data**, bukan hanya disembunyikan di JSX: VIS-1 buta, VIS-3 konfidensial, VIS-5/VIS-9 direktorat terlambat, VIS-7 tampilan turunan, VIS-8 redaksi audit. Komponen menerima data yang sudah difilter.
- **Validasi §2.6**: hanya gerbang struktural yang memblokir; penilaian diri tidak pernah diblokir (BR-013). Tombol tidak dinonaktifkan tanpa penjelasan — saat ditekan, ia mendaftar kekurangannya.
- **Penilaian**: tuntaskan per risiko; perbandingan dibuka per risiko per direktorat (§2.5); predikat dibandingkan, bukan skor (RB-NIL-003); penjelasan wajib hanya bila Lini 1 lebih tinggi (RB-NIL-006); keterlambatan dicatat sekali, tidak dihitung ulang.
- **Register**: satu per jabatan per TA; uraian terbit tidak bisa diubah (INV-7); nonaktifkan, jangan hapus.
- **Komentar**: sunting ≤15 menit (INV-19); tarik → "Komentar ditarik oleh [nama] pada [waktu]"; penanda sepi dihitung dari Langkah Lini 1.
- **Lembar**: turunan, tidak diketik; setiap cetak membuat snapshot bernomor yang tidak berubah (INV-22).

## 7. Konvensi UI

- **Token saja.** Tidak ada hex mentah di komponen; semua warna lewat `var(--…)`. Mode gelap lewat `[data-theme="dark"]` dengan nilai dari `.pen`. Teks tautan memakai `--text-link`, bukan `--action-primary`.
- Nama komponen React = nama komponen di `.pen` (Button, TextInput, Select, ScoreInput, PredicateBadge, LineChip, CapacityChip, StatusChip, MarkerBadge, Comment, Composer, DataTable, TableCard_Mobile → `TableCardMobile`, SummaryStrip, FilterPills, Card, BottomBar, SlideOver, ConfirmDialog, InlineAlert, Toast, NotificationPanel, EmptyState, Sidebar, Topbar, PositionSwitcher, WorkspaceHeader, PageHeader, OperatorNotice, dst.). Sebelum membuat komponen baru, cek apakah sudah ada di `.pen`.
- Tata letak (PRD §2.2): sidebar 240 tetap (bisa diciutkan jadi rel ikon 72 di desktop), topbar sticky 56–64, konten maks 1200 (1368 saat sidebar diciutkan; halaman tidak membuat batas lebar sendiri kecuali Lembar A4, login, dan halaman galat), padding 32/16. **Satu breakpoint 900 px**: di bawahnya satu kolom, sidebar jadi drawer, tabel jadi kartu bertumpuk, tanpa gulir horizontal.
- Pola §2.4: skeleton saat memuat, InlineAlert merah + "Coba Lagi" saat galat, dialog merah untuk tindakan destruktif, toast kanan atas 4 detik, "Draf tersimpan" di BottomBar, paginasi 25 baris / 50 komentar.
- Angka & tanggal: font mono, koma desimal ("3,2"), format tanggal Indonesia ("6 Apr 2027"). Gunakan helper `formatScore`, `formatDate`, `formatRelative`.
- Aksesibilitas (WCAG 2.1 AA): cincin fokus 2 px `--ring-focus`; target sentuh ≥44 px di ponsel (tombol teks 40 di desktop); warna tidak pernah satu-satunya penanda; peran ARIA sesuai AccessibilityContract; hormati `prefers-reduced-motion`.
- Cetak: `print.css` menyembunyikan sidebar, topbar, tombol, filter; A4 potret; watermark "SEMENTARA" untuk snapshot sementara.

## 7a. Mengambil desain dari Pencil (`Simario.pen`)

Pencil adalah **sumber ukuran dan gaya**, bukan sumber kode. Ekspor HTML Pencil menghasilkan hex mentah, posisi absolut, lebar tetap, dan tanpa keadaan interaktif — jangan disalin ke `src/`.

Alur per komponen/halaman:

1. **Token** — `Print(JSON.stringify(GetVariables()))` lewat `mcp__pencil__execute`, simpan hasilnya ke `frontend/scripts/pencil-variables.json`, lalu `npm run tokens` menulis `src/styles/tokens.css` (`--nama`, mode `light` di `:root`, `dark` di `[data-theme="dark"]`). Ulangi bila token di `.pen` berubah; jangan mengedit `tokens.css` dengan tangan.
2. **Baca node, bukan ekspor** — `Print(Get("<id>", {depth: 3}))` untuk komponen library, atau cari frame halaman lewat FrameIndex lalu baca subtree-nya. Nilai di node masih berupa token (`$bg-surface`, `$radius-lg`) plus padding/gap/ukuran/font numerik — terjemahkan 1:1 ke CSS (`var(--bg-surface)`, `padding: 24px`, `gap: 16px`). `layout: vertical/horizontal` → flex column/row; `fill_container` → `flex: 1`/`width: 100%`; `fit_content` → ukuran alami.
3. **Baca konteks** — `context` di node dan note di samping frame berisi perilaku, validasi, izin, dan FR id. Itu spesifikasi; ikuti bersama PRD.
4. **Instans & override** — node `ref` menunjuk komponen library (id di DesignBrief); `descendants` berisi override (teks, ikon, keadaan). Petakan ke props komponen React, jangan membuat salinan komponen.
5. **Responsif & keadaan** — frame `.pen` berukuran tetap (1440 / 390). Bangun layout cair dengan breakpoint 900 px; keadaan hover/fokus/nonaktif diambil dari matriks keadaan di SourceOfTruth.
6. **Verifikasi** — `TakeScreenshot([frameId])` lalu bandingkan dengan tampilan aplikasi di lebar yang sama. Perbedaan yang disengaja dicatat di laporan checkpoint.
7. **Ekspor HTML hanya sebagai referensi ukuran** bila struktur node sulit dibaca — simpan di scratchpad, tidak di repositori.

Verifikasi visual tanpa ekstensi Chrome: jalankan `npx vite` di latar, lalu Edge headless (`msedge --headless=new --screenshot=… --window-size=1440,5200 <url>`). Edge headless punya lebar jendela minimum di atas 390 px — untuk ponsel, muat halaman di dalam `<iframe>` selebar 390 px dari berkas sementara di `frontend/public/` (hapus setelahnya). Browser terintegrasi Pencil sering macet saat screenshot.

Batasan MCP Pencil: hanya baca (kecuali diminta mengubah mockup); visitor `Get` pada seluruh dokumen dengan `resolveInstances` bisa kena batas waktu — baca per frame atau per kolom modul; variabel tidak bertahan antar panggilan `execute` — pakai id literal.

Bagian yang tidak ada di mockup (mis. keadaan atau halaman ponsel yang belum digambar) dibangun dari komponen dan pola yang sudah ada, lalu disebutkan di laporan checkpoint.

## 8. Bahasa & salinan teks

- Seluruh UI dalam **Bahasa Indonesia formal**. Kutip teks PRD apa adanya bila PRD memberikannya (label tombol, pesan galat, peringatan).
- Kode, nama berkas, komentar kode, dan nama tipe dalam bahasa Inggris, mengikuti nama entitas PRD §2.8.1 (`RegisterRisk`, `RiskQuarter`, `ComparisonResult`, …).
- Balasan ke pengguna dalam Bahasa Indonesia.

## 9. Tahapan & checkpoint

Pekerjaan dibagi menjadi 10 tahap mengikuti PRD Lampiran E. **Setiap tahap diakhiri checkpoint: berhenti, laporkan ke pengguna, dan tunggu konfirmasi sebelum memulai tahap berikutnya.** Jangan menggabungkan dua tahap tanpa izin.

### Aturan checkpoint

Sebuah tahap boleh dilaporkan selesai hanya bila:

1. Semua butir "Hasil" tahap itu tercentang di berkas ini (`- [x]`). Perbarui centang di CLAUDE.md sebagai bagian dari komit tahap.
2. `npm run build`, `npm run test`, dan `npm run lint` lulus. Untuk tahap backend (§9b) juga `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, dan `uv run mypy .` dari `backend/`.
3. (Bila tahap mengubah halaman.) Setiap halaman di tahap itu sudah dibandingkan dengan frame `.pen`-nya (screenshot frame lewat MCP Pencil vs. tampilan di browser) pada 1440 px dan 390 px.
4. Semua keadaan di note frame tersedia: kosong, memuat (skeleton), galat (+ "Coba Lagi"), Operator, read-only/arsip — sesuai yang berlaku.
5. Sudah dicoba manual dengan persona yang relevan (lihat "Skenario uji" tiap tahap).
6. Ada komit git dengan pesan `feat: <ringkasan> (checkpoint N)`.

**Laporan checkpoint** (Bahasa Indonesia, singkat): apa yang selesai, cara mencobanya (persona + tanggal simulasi + URL), aturan yang diuji, perbedaan dari mockup/PRD beserta alasannya, dan apa yang tertunda. Lalu tanya: "Lanjut ke Tahap N+1?"

Status tahap ditulis di judul: `⬜ belum` · `🟨 berjalan` · `✅ selesai`.

---

### Tahap 0 — Inisialisasi ✅

Hasil:
- [x] `git init` di root `simario2/`, `.gitignore`, `.gitattributes` (LF), komit awal berisi `docs/`, `CLAUDE.md` — `Simario.pen` menyusul setelah disimpan dari aplikasi Pencil (berkas di disk masih kosong)
- [x] `frontend/` dibuat dengan Vite (React + TS), React Router, Zustand, lucide-react, Vitest, ESLint, Prettier
- [x] Skrip `dev`, `build` (`tsc -b && vite build`), `test`, `lint` (ESLint + Prettier) berjalan
- [x] Struktur folder sesuai §3 (folder kosong berisi `index.ts`)

Skenario uji: `npm run dev` menampilkan halaman kosong tanpa galat konsol.

---

### Tahap 1 — Fondasi visual ✅

Hasil:
- [x] `styles/tokens.css` dihasilkan `npm run tokens` dari `scripts/pencil-variables.json` (snapshot `GetVariables()` Pencil; 165 token, 69 nilai gelap, termasuk `--text-link`) + bayangan komposit
- [x] Fon Newsreader, Plus Jakarta Sans, JetBrains Mono termuat (`@fontsource-variable`)
- [x] Komponen dasar dengan semua keadaan (default, hover, fokus, ditekan, nonaktif, memuat, galat): Button (Primary, Secondary, Ghost, Destructive, FinalizeOperator), TextInput, Textarea, Select, DatePickerField, SearchField, Checkbox, Toggle, FileDrop
- [x] Chip & lencana: LineChip, CapacityChip, PredicateBadge, StatusChip, MarkerBadge, Avatar, AttachmentChip (berkas, gambar, memindai, konfidensial tersamar)
- [x] Umpan balik: InlineAlert (4 varian, "Coba Lagi"), Toast (4 detik, maks 3), EmptyState, Skeleton
- [x] Wadah: Card, PageHeader, SummaryStrip, FilterPills, DataTable (kartu bertumpuk < 900 px) + TableCardMobile, Pagination, ConfirmDialog, SlideOver (fokus terkunci, Esc)
- [x] Halaman `/_komponen` (hanya mode dev) memamerkan semua komponen; `?tema=gelap` untuk mode gelap

Skenario uji: bandingkan `/_komponen` dengan bagian SourceOfTruth di `.pen`; navigasi keyboard menampilkan cincin fokus di semua kontrol.

---

### Tahap 2 — Fondasi aplikasi ✅

Hasil:
- [x] `domain/types.ts`: semua entitas PRD §2.8.1 (camelCase) + `domain/permissions.ts` (26 izin FR-ADM-002), `domain/calendar.ts` (default triwulan §2.5, hari kerja, keterlambatan), `domain/scoreBands.ts`
- [x] `data/repository.ts` (pintu tunggal; `authApi`, `notificationApi`, `preferenceApi` — modul lain menambah namespace) + `data/local/` (store immer + localStorage `simario:v1:`, `call()` dengan latensi/galat/luring, penulis audit & notifikasi, `scheduler.ts`), reset dari DevPanel
- [x] Seed (`data/seed/`): unit kerja, 7 jenis jabatan, 12 jabatan, 20 pengguna, holding Pejabat/Operator (termasuk Pokja multi-Pejabat dan delegasi berakhir), 5 peran + izin default, penugasan pemantauan, TA 2026 (diarsipkan) & TA 2027, pita skor (Versi 1 aktif, draf Versi 2 bercelah), formulir Data Umum, register PPK A-1 2026/2027, PPK A-2, KPA Satker A, Pokja 03, Pejabat Pengadaan Satker B, 18 komentar + lampiran, penilaian TW IV 2026 & TW I 2027 (+ draf buta TW II), hasil perbandingan, notifikasi, audit
- [x] Tahap & template diimpor dari `docs/seed/template_risiko_rapim.json`; test memastikan 4 / 14 / 146 / 302 dan uraian risiko register = template (tahap & jenis sama)
- [x] `state/clock` (default 6 Apr 2027 09.00, berjalan mengikuti waktu nyata) dan evaluator tugas terjadwal (`registerTask`; tugas pemindaian lampiran — Tahap 6 menambah pembukaan perbandingan dll.)
- [x] Sesi: `/login` (SSO → pemilih persona; akun lokal; galat; terkunci 5×/15 menit), `/ganti-kata-sandi` (wajib tanpa sidebar & mandiri), batas tidak aktif (60 menit; bisa dipercepat di DevPanel) → `/login?alasan=sesi-berakhir`
- [x] AppShell: Sidebar (kartu "JABATAN AKTIF" + menu jabatan per lini, menu per tampilan peran, blok pengguna + menu ⋯), Topbar (breadcrumb, cari Ctrl K, lonceng + jumlah, tombol kontekstual), WorkspaceHeader + pemilih TA + tab, OperatorNotice, banner luring, drawer < 900 px, tautan "Lewati ke konten"
- [x] Router untuk semua rute §1.8 dengan penjaga izin/cakupan (halaman belum dibangun = placeholder bertanda tahap) + 403, 404, 500 (error boundary), keadaan luring
- [x] `domain/rules/access.ts` (izin + holding + Pejabat/Pengisi + cakupan + partisipasi) dan `domain/rules/visibility.ts` (VIS-1…9) dengan test
- [x] Penulis AuditLog (hanya tambah) dan Notification (idempoten per `eventKey`) terpusat
- [x] DevPanel: ganti persona, geser tanggal (+ preset tanggal mockup), latensi, gagalkan panggilan berikutnya, luring, batas sesi, tema, reset data. Tautan demo: `?sebagai=usr-andi&waktu=2027-03-18T09:00`

Catatan Tahap 2 (keputusan & perbedaan dari mockup):
- Snapshot cetak (`PrintSnapshot`) di-seed pada Tahap 8 bersama pembuat payload Lembar; data TW I–III 2026 untuk riwayat lintas tahun ditambahkan pada Tahap 7.
- Mockup Beranda Superadmin menyebut "Unit Pendukung Pemantauan UKPBJ" tanpa Pejabat, padahal Lestari adalah Operatornya (INV-11 mensyaratkan Pejabat aktif). Seed memberi UKPBJ Pejabat Wahyu Hidayat; jabatan tanpa Pejabat: PPK B-2 dan Pejabat Pengadaan Satker C.
- Mockup "Pembaca Bukan Peserta" memakai Dimas pada PPK A-1, tetapi cakupan "Sendiri" Dimas tidak mencakup PPK A-1 (§1.5). Tahap 5 memakai pembaca lain yang sah (mis. pengguna dengan cakupan Unit).
- Contoh risiko mockup yang tidak ada di dek: "Keterlambatan revisi DIPA…" dan "Deviasi RPD…" (PPK) menjadi risiko sendiri + usulan; "Spesifikasi produk E-Katalog…" → template `PPK-T3-KP-02`; "Persekongkolan…" → `PPK-T3-FR-03`; "Penyerapan anggaran…" pindah ke tahap PPK-T2 sesuai dek.

Skenario uji: masuk sebagai Andi, Rafi, Siti, Hendra, Nur Aini, Admin DKB — menu sidebar dan pemilih jabatan sesuai; buka `/pengaturan/pengguna` sebagai Andi → 403; rute asal → 404.

---

### Tahap 3 — Master Data (MST) ✅

Hasil:
- [x] `/master/jabatan` — jenis jabatan per lini (nonaktif ditolak bila dipakai + "Lihat N Jabatan"), tabel jabatan berfilter (Pejabat kosong merah), slide-over dengan isian identitas per jenis, nonaktifkan dengan alasan & dampak (Operator berakhir), aktifkan kembali
- [x] `/master/tahap` — akordeon per jenis, ubah nama inline (Enter/Esc), urutkan dengan seret atau Alt+↑/↓ (tersimpan seketika), aktif/nonaktif, tambah, hapus hanya bila belum dipakai & tanpa template
- [x] `/master/template` — pohon 280 px (jadi 3 dropdown < 900 px), pencarian, daftar dengan "Dipakai [N] jabatan" / "dapat dihapus", toggle aktif, slide-over sunting (mitigasi urut seret/Alt+↑/↓), hapus hanya untuk yang belum pernah dipakai
- [x] `/master/usulan` — filter status, "Jadikan Template" (slide-over terisi dari risiko sendiri), "Tolak" dengan alasan wajib; pengusul diberi notifikasi
- [x] `/master/data-umum` — pembangun formulir berversi (isian tetap terkunci, teks bawaan Tujuan, isian tambahan + daftar pilihan), peringatan perubahan belum tersimpan, simpan = versi baru
- [x] `/master/skala-penilaian` — versi & status (draf/terjadwal/aktif/tidak berlaku), tabel pita, galat celah/tumpang tindih, pratinjau 0–4, panduan per predikat; versi tersimpan aktif lewat penjadwal pada tanggal berlaku, triwulan mengunci versinya saat jendela pertama dibuka
- [x] `data/api/master.ts`: izin dicek di repository, validasi sesuai catatan frame, audit untuk setiap perubahan; test API & UI

Catatan Tahap 3: hitungan template di mockup bersifat ilustratif — aplikasi memakai hitungan berkas seed (mis. PPK › Perencanaan Pengadaan 13). Formulir Data Umum PPK di-seed sebagai Versi 2 (Sumber Dana, Kode Paket RUP) sesuai frame IIM4I. Status `scheduled` ditambahkan ke `ScoreBandVersion` untuk versi yang sudah disimpan tetapi belum berlaku.

Skenario uji: Nur Aini membuka `/master/template` → pohon menampilkan 4 jenis dan 14 tahap dengan hitungan sesuai berkas seed (mis. PPK › Pelaksanaan/Pengendalian Kontrak: 5 / 8 / 9); membuat draf pita dengan celah → simpan ditolak; nonaktifkan template → hilang dari pilihan register baru.

---

### Tahap 4 — Register (REG) ✅

Hasil:
- [x] `/jabatan/:jid/register/:ta` — Data Umum + blok identitas, bagian tahap (3 jenis risiko), kartu risiko template → mitigasi, "+ Risiko sendiri", "+ Mitigasi sendiri", "Tidak ada risiko", "Tahap tidak relevan"
- [x] BottomBar: autosave, jumlah celah, Operator "Tandai Siap Diterbitkan", Pejabat "Terbitkan Register" / "Terbitkan Tambahan" (daftar celah, dialog konfirmasi, flag `no_mitigation`)
- [x] Salin dari TA sebelumnya + ringkasan salin
- [x] Tambahan tengah tahun, nonaktifkan risiko/mitigasi (termasuk kasus TW IV), hapus draf
- [x] Tampilan baca (Lini 2/3, anggota Pokja bukan Pengisi), register diarsipkan
- [x] Usulan risiko dibuat saat terbit; Lini 2 diberi notifikasi; semua perubahan ke audit

Catatan Tahap 4: seed KPA Satker A diubah menjadi register TA 2026 (diarsipkan) tanpa register TA 2027 agar alur "Salin dari TA 2026" dapat didemokan; template KPA-T1-KA-04 dinonaktifkan untuk demo penanda "Template sudah tidak aktif". SCHEMA_VERSION naik ke 3. Baris RiskQuarter dibuat saat terbit dan oleh tugas terjadwal `risk-quarters` (RB-REG-006). Mitigasi seed tidak membawa `publishedAt`; status active/inactive dianggap sudah terbit. Pembaca (non-pemegang jabatan) tidak melihat tambahan draf/siap; register yang belum pernah terbit tampil sebagai keadaan kosong bagi mereka.

Skenario uji: Rafi menyusun lalu menandai siap → Andi menerima notifikasi dan menerbitkan; gerbang struktural memblokir, risiko tanpa mitigasi tetap terbit dengan flag.

---

### Tahap 5 — Papan Risiko & Utas (PPN) ✅

Hasil:
- [x] `/jabatan/:jid/papan/:ta` — dikelompokkan tahap › jenis, kolom per FR-PPN-001, penanda, filter (tersimpan per pengguna per jabatan), titik aktivitas baru, keadaan kosong
- [x] `/jabatan/:jid/papan/:ta/risiko/:rid` — header, linimasa per TW, sub-utas mitigasi (`#mitigasi-:mid`), panel kanan ringkasan triwulan (VIS-1/2)
- [x] Composer: @sebut (hanya peserta), lampiran (≤10, "Memindai…"), "Tandai sebagai Langkah" (Lini 1), "Konfidensial" per berkas (Lini 3), "Terkait TW [n]" (RB-PPN-004), peringatan fase buta Lini 3, Ctrl+Enter
- [x] Sunting ≤15 menit "(disunting)", tarik komentar, ikuti/berhenti mengikuti, banner "[n] komentar baru", pembaca bukan peserta, utas diarsipkan
- [x] Penanda sepi, langganan, notifikasi sebut & komentar baru

Catatan Tahap 5: pembaca bukan peserta memakai persona baru **Dewi Anggraini** (DDKB) dengan peran kustom "Pimpinan Unit Kerja" (izin 1, cakupan Unit; dikonfirmasi pengguna) — seed sebelumnya tidak punya pembaca sah untuk PPK A-1. Hasil perbandingan seed dianggap terbuka hanya bila `openedAt` ≤ jam simulasi (Tahap 6 mengambil alih pembukaan). Lini 3 punya `shortName` (KEP, PAI) untuk chip predikat. Pemindaian lampiran disimulasikan 2 detik; isi berkas tidak disimpan (unduhan berupa berkas contoh). Banner "[n] komentar baru" dapat didemokan lewat DevPanel → "Simulasikan komentar masuk" atau dua tab berbeda. SCHEMA_VERSION naik ke 4.

Skenario uji: Hendra melampirkan berkas konfidensial → Andi hanya melihat "1 lampiran konfidensial"; Langkah Andi menghapus penanda sepi.

---

### Tahap 6 — Penilaian Triwulan (NIL) ✅

Hasil:
- [x] `/jabatan/:jid/penilaian/:ta/:tw` — header strip, pemilih TW, daftar per tahap › jenis, ScoreInput + predikat langsung, "Belum relevan" + alasan, lampiran, catatan Lini 3, jendela belum dibuka
- [x] Operator "Tandai Siap"; Pejabat "Tuntaskan Penilaian" (dialog ringkasan, flag `no_evidence`, keterlambatan), "Buka Kembali" per baris
- [x] Pembukaan perbandingan (penuh / sebagian / menunggu), "Tidak dinilai Lini 1", Sesuai / Tidak Sesuai / Tidak dapat dibandingkan, VIS-1/5/9
- [x] Penjelasan per direktorat (wajib/opsional, "Gunakan penjelasan yang sama…", tenggat hari kerja, "Kirim Penjelasan")
- [x] Deteksi Berulang lintas kuartal/tahun; tampilan buta Superadmin (dialog + audit)
- [x] `/penilaian` — antrean Lini 3 dengan filter dan "Register belum terbit"
- [x] Test unit untuk pembukaan perbandingan, keterlambatan, penjelasan, Berulang, dan visibilitas

Catatan Tahap 6: data contoh bersifat statis (TW I sudah dibuka per 6 Apr 2027), jadi skenario lain memakai **"Sesuaikan data ke tanggal ini"** di DevPanel atau tautan `?sebagai=…&waktu=2027-03-18T09:00&data=sesuai` — data dimuat ulang seperti keadaannya pada tanggal itu (komentar, penilaian, hasil, notifikasi, dan audit sesudahnya dihapus; penilaian yang dituntaskan sesudahnya dianggap belum dimulai). Pembukaan perbandingan, "Tidak dinilai Lini 1", Berulang, dan notifikasi FR-NTF-007/008/009/010 berjalan sebagai tugas terjadwal `comparisons` dan setelah setiap Tuntaskan. Notifikasi pengingat jendela/tenggat (FR-NTF-005/006, H-7/H-1) menyusul di Tahap 7. Komponen baru `ScoreInput`. "Kirim Penjelasan" mengirim penjelasan yang sudah lengkap; yang wajib tetapi kosong disebutkan saat tombol ditekan.

Skenario uji: geser tanggal 18 Mar 2027 → Rafi mengisi, Andi menuntaskan; Hendra & Maya menilai; tanggal 3 Apr → perbandingan terbuka sebagian; Andi wajib menjelaskan hasil Tidak Sesuai.

---

### Tahap 7 — Riwayat, Notifikasi, Beranda (RWY, NTF, BRD) ✅

Hasil:
- [x] `/jabatan/:jid/riwayat` — ringkasan Lembar Mutu, matriks risiko × TW, slide-over detail sel, lintas tahun, filter
- [x] Panel notifikasi (380 px) dan `/notifikasi` (filter, paginasi); semua event FR-NTF-001…012, idempoten
- [x] `/` — kartu per lini sesuai FR-BRD-010 (Lini 1 Pejabat/Operator, Lini 2, Lini 3, Superadmin, PMD tanpa jabatan, kosong)
- [x] `/jabatan` dan `/pantauan`

Catatan Tahap 7: seed TA 2026 TW I–III untuk PPK A-1 ditambahkan (riwayat lintas tahun); SCHEMA_VERSION 5. Lembar Mutu dihitung di `domain/rules/sheets.ts` (dipakai ulang Tahap 8). Pengingat FR-NTF-005/006/009 (H-1)/012 berjalan sebagai tugas terjadwal `reminders`; peristiwa yang lebih tua dari 3 hari tidak dimunculkan mundur. Jenis notifikasi diseragamkan dengan seed (`new_comments`, `explanation_required`, `deadline`). Superadmin tidak melihat kartu sambutan PMD. FR-NTF-011 (penunjukan Operator) dibangun bersama `/jabatan-saya` di Tahap 9.

Skenario uji: Beranda tiap persona cocok dengan frame Beranda di `.pen`; klik notifikasi membuka konteks yang tepat.

---

### Tahap 8 — Lembar & Cetak (LBR) ✅

Hasil:
- [x] `/jabatan/:jid/lembar/:ta/:tw` — Lembar Komunikasi (Bagian A/B/C) dan Lembar Mutu, semuanya turunan dan netral-pembaca (VIS-7)
- [x] Pilih foto (maks 5 per bagian), panel versi, cari nomor snapshot, salinan beku, penyamaran untuk direktorat terlambat (VIS-9)
- [x] Cetak: snapshot `trigger=print`, nomor `SIMARIO/[LK|LM]/…`, watermark "SEMENTARA", blok tanda tangan, catatan status dokumen, `print.css` A4
- [x] Versi otomatis (`auto_freeze`) dan `superseded_by`

Catatan Tahap 8: payload lembar (`domain/rules/sheetPayload.ts`) netral-pembaca dan menyimpan nilai per risiko; penyamaran VIS-9 dan perhitungan Lembar Mutu dilakukan dari payload. Versi otomatis dibuat tugas terjadwal `sheet-freeze` (contoh: geser ke 21 Apr 2027 → Versi 1 TW I PPK A-1). Seed: TW IV 2026 Versi 1 (14 Jan 2027) dan cetak sementara TW I 2027 nomor 001 (3 Apr 2027). Pilihan foto disimpan bersama per jabatan × triwulan × bagian (preferensi dengan pengguna `*`). Gambar lampiran tampil sebagai placeholder karena isi berkas tidak disimpan. `?salinan=…&cetak=pratinjau` menahan tata letak cetak untuk pratinjau PDF. Versi `archive` dibuat bersama arsip TA di Tahap 9. SCHEMA_VERSION 6.

Skenario uji: cetak dari tampilan berjalan membuat snapshot baru; mencetak versi beku tidak membuat snapshot; pratinjau cetak cocok dengan frame A4.

---

### Tahap 9 — Administrasi & Metrik (ADM) ✅

Hasil:
- [x] `/pengaturan/pengguna` — tabel, Tambah Pengguna, Tetapkan Jabatan (Pokja + Pengisi), Alih Pejabat, Atur Ulang Kata Sandi, Nonaktifkan (+ penolakan Pengisi)
- [x] `/pengaturan/peran` — daftar peran, tabel 26 izin dengan cakupan, "Hanya Pejabat", Superadmin terkunci, penjaga INV-5
- [x] `/pengaturan/penugasan-pemantauan` — tabel, kartu "Belum ditugaskan", dialog massal, INV-14
- [x] `/pengaturan/tahun-anggaran` — buat TA, editor kuartal, validasi INV-9, panel arsip, pengecualian Lini 3, arsip manual
- [x] `/pengaturan/impor` — 3 jenis, unduh templat CSV, uji coba (dry run) dengan laporan galat, "Terapkan", riwayat
- [x] `/jabatan-saya` — kartu Pejabat/Operator, Tunjuk Operator, Cabut
- [x] `/metrik` — kartu tujuan 1, 2, 3, 4, 8, 9 dengan kueri, "Data belum cukup", unduh CSV
- [x] `/jejak-audit` — filter, baris dapat dibuka (sebelum/sesudah), redaksi VIS-8, "Tampilkan nilai asli" (izin 24, dicatat)

Catatan Tahap 9: arsip TA berjalan otomatis lewat tugas terjadwal `calendar` pada batas akhir yang diperpanjang (§2.5) atau manual (izin 26) bila TW IV lengkap; saat arsip, penilaian belum tuntas → Tidak dinilai, penjelasan wajib → Tidak dikirim, versi lembar `archive` dibuat bila isi berubah. Set penilai Lini 3 dicatat otomatis saat jendela Lini 3 dibuka. Berkas SK/surat dicatat sebagai nama berkas (prototipe). Kata sandi sementara akun lokal ditampilkan sekali kepada admin. Metrik Tujuan 8 menampilkan "Data belum cukup" karena instrumentasi waktu-di-halaman belum ada. Riwayat impor dibaca dari jejak audit (`impor_*`). Placeholder tahap dihapus — semua rute §1.8 kini berisi halaman.

Skenario uji: Admin DKB melakukan Alih Pejabat PPK A-1 → operator lama berakhir otomatis; Andi menunjuk Galih Pratama sebagai operator → Galih bisa masuk.

---

### Tahap 10 — Penyelesaian & verifikasi ✅

Hasil:
- [x] Semua halaman diperiksa pada 390 px: kartu bertumpuk, drawer, BottomBar ponsel, target ≥44 px, tanpa gulir horizontal
- [x] Mode gelap di semua halaman (toggle di menu pengguna)
- [x] Aksesibilitas: urutan fokus, tautan lewati, peran ARIA, kontras, `prefers-reduced-motion`
- [x] Skeleton & keadaan galat di setiap halaman berdata; halaman 403/404/500/luring/sesi berakhir
- [x] Verifikasi silang: setiap frame di FrameIndex `.pen` punya padanan di aplikasi; daftar perbedaan yang tersisa
- [x] README singkat di `frontend/` (cara menjalankan, persona, DevPanel)

Catatan Tahap 10: audit otomatis 390 px atas 35 rute (iframe + pengukuran `scrollWidth`) — tanpa gulir horizontal dan tanpa galat JavaScript; target sentuh kecil diperbesar lewat aturan seluler di `base.css` (sakelar memakai area sentuh `::after`, tautan di dalam kalimat dikecualikan sesuai WCAG). Mode gelap ditambahkan di menu pengguna. Halaman yang membaca store langsung dibungkus `DataGate` agar punya skeleton dan galat + "Coba Lagi". Alur penuh TW I diuji di `data/api/flow.test.ts`. Padanan frame dan perbedaan yang disengaja tercatat di `frontend/README.md`.

Catatan pascatahap (unit kerja): seed memakai nama unit kerja resmi Otorita IKN dari ekspor 12 Okt 2026 (hanya yang dipakai, 9 unit). Pemetaan: UKPBJ → Biro Umum dan Pengadaan Barang/Jasa (BUPBJ), Satker A → Direktorat Pengelolaan Gedung, Kawasan dan Perkotaan (DPGKP), Satker B → Direktorat Sarana Prasarana Dasar (DSPD), Satker C → Direktorat Pelayanan Dasar (DPLD), Deputi Bidang Pendanaan → Direktorat Pendanaan (DPDN). Label jabatan Satker/UKPBJ dipertahankan (keputusan pengguna); jabatan Lini 2 Siti menjadi "Penanggung Jawab Pemantauan Direktorat Pendanaan" (PJPM-DPDN). SCHEMA_VERSION 7. Isian Data Umum "Tujuan" kini tidak wajib dan nonaktif secara bawaan (`objectiveEnabled` per versi formulir; keputusan pengguna, berbeda dari PRD); bila nonaktif tidak tampil di register dan lembar dan tidak pernah menjadi celah terbit. SCHEMA_VERSION 8. Penilaian dengan pilihan kalimat (keputusan pengguna 13 Okt 2026, PRD v2.8): penilai memilih kalimat dari dropdown (`ScoreInput`, daftar datar terburuk → terbaik, tanpa angka); `Assessment.score` tetap menyimpan nilai 0–4 dan predikat diturunkan dari pita. Entitas baru `ScoreOption` per versi skala, dikelola di kartu "Pilihan penilaian" pada `/master/skala-penilaian` (teks bisa disunting di versi aktif; nilai/jumlah lewat versi baru). Angka skor dan rata-rata tidak ditampilkan di mana pun kecuali halaman Skala Penilaian, ekspor CSV metrik, dan impor; jejak audit menampilkan kalimat (nilai asli lewat izin 24). Kalimat seed `docs/seed/pilihan_penilaian.json` masih draf ilustratif. Skor seed dipetakan ke nilai pilihan terdekat dalam predikat yang sama; akibatnya predikat Lembar Mutu Lini 1 Kinerja Anggaran TW I 2027 PPK A-1 berubah dari Cukup menjadi Terkendali dengan Baik. SCHEMA_VERSION 9.

Skenario uji: alur penuh TW I dari pengisian sampai cetak Lembar dengan mengganti persona dan tanggal, tanpa galat konsol.

## 9b. Tahapan Backend

Spec: `docs/superpowers/specs/2026-10-21-backend-integration-design.md` (§6). Aturan checkpoint §9 berlaku; pesan komit checkpoint `feat: <ringkasan> (checkpoint Bn)`. Rencana kerja per tahap di `docs/superpowers/plans/`.

### Tahap B0 — Kerangka ✅

Hasil:
- [x] Aturan kerja backend di CLAUDE.md dan dokumen
- [x] Proyek Django, settings, health check, gerbang kualitas
- [x] Konvensi API — amplop galat, camelCase, paginasi
- [x] Pipeline OpenAPI → tipe TypeScript
- [x] Semua layanan di Docker Compose, Celery, bucket, proxy Vite
- [x] Realm Keycloak lokal
- [x] Vektor uji bersama — pita skor sebagai contoh pertama

### Tahap B1 — Fondasi ✅

Hasil:
- [x] Model `accounts`, `org`, `calendar`, `reference`, `audit` (+ trigger), `notifications`; izin 1–26; `domain/access.py` + vektor
- [x] Sesi, OIDC Keycloak lokal (persona di realm), akun lokal, lockout, `auth_epoch`; `GET /me`; endpoint baca notifikasi
- [x] Jam simulasi (`DevClock`) + `devtools`; `seed_reference`, `seed_demo`
- [x] Frontend: `data/http/client.ts`, `authApi`, `useAuth` → `/me`, Sidebar/Topbar/Workspace, lonceng, DevPanel

### Tahap B2 — Master & Administrasi ✅

Hasil:
- [x] MST: jabatan, tahap, template, Data Umum, skala + pilihan (usulan risiko pindah ke B3 bersama `RiskProposal`)
- [x] ADM: pengguna, peran, penugasan, TA/kuartal/arsip, jabatan saya, impor CSV + `ImportJob`

Catatan Tahap B2: halaman master/admin membaca `GET /api/v1/collections/<nama>` lewat `CollectionGate` (digabung di atas store lokal sampai modul register/penilaian pindah). Pemakaian oleh register dan penilaian dijawab stub (`simario/registers/usage.py`, `simario/assessments/usage.py`; U-21) sampai B3/B5; efek samping arsip mendaftar lewat `calendar.services.on_archive`. Cari pegawai lewat Keycloak Admin REST (service account `simario`, `view-users`). Perubahan holding/peran/izin/penugasan menaikkan `auth_epoch` (U-04, U-19 selesai). Uji manual lewat HTTP terhadap backend lokal; belum diklik di browser.

### Tahap B3 — Register ✅

Hasil:
- [x] REG penuh (`registerApi.view` sebagai read model tunggal, terbit, salin, tambahan, nonaktif), `RiskProposal`, `risk_quarters`

Catatan Tahap B3: app `registers` (+ `RiskProposal` di `reference`, `RiskQuarter` di `assessments`) memporting `data/api/register.ts` 1:1; aturan murni di `simario/domain/register.py` dengan vektor bersama. View server menambah `previousRegister`, `stagesDone`, `flagged`. Halaman Register membaca view lewat `useRegisterViews`; usulan lewat `GET /api/v1/proposals`. Jembatan ID kini juga menerjemahkan kunci objek yang berupa ID. Petunjuk pemakaian di halaman master masih dari store lokal (U-22). Modul papan/penilaian/lembar masih membaca register lokal sampai tahapnya.

### Tahap B4 — Papan, Utas, Lampiran ✅

Hasil:
- [x] PPN penuh, polling 30 detik
- [x] RustFS + ClamAV + karantina + URL pre-signed lewat `/storage`, kuota; Beranda sementara dipindah ke B4s bersama gerbang modul

Catatan Tahap B4: app `board` memporting `data/api/{board,thread}.ts`; aturan murni `simario/domain/{board,visibility}.py` dengan vektor bersama (VIS-1/2/3/9). `Assessment` dan `ComparisonResult` sudah berupa model dengan data demo agar panel triwulan dan chip predikat tampil; perilakunya di B5. Unggahan multipart, MIME dari isi (`puremagic`), pemindaian ClamAV lewat Celery + sapuan terjadwal, karantina, unduhan 302 ke URL pre-signed `/storage` (proxy Vite kini `changeOrigin`). Diuji manual: PDF bersih terunduh, DOCX berisi EICAR dikarantina. Utas mem-poll `?since=` tiap 30 detik.

### Tahap B4s — Staging ✅

Hasil:
- [x] `config/settings/staging.py`, `docker-compose.prod.yml` + nginx + HTTPS diuji di lokal
- [x] Panduan penyebaran staging, build uji coba dengan gerbang modul, daftar kebutuhan server staging

Catatan Tahap B4s: `config/settings/deployed.py` (HTTPS di belakang nginx, cookie Secure, HSTS, CSRF trusted origins) lulus `check --deploy`. Stack produksi diuji di `https://localhost:8443` dengan `infra/smoke.py` (SPA + deep link, health, akun lokal + ganti kata sandi wajib, `/me`, unduhan pre-signed lewat `/storage`). Uji asap ini menemukan bug B1: penerima `user_logged_in` dipegang lemah sehingga sesi berakhir di gunicorn — diperbaiki. Perintah baru `create_superadmin`. Gerbang modul `migrated.ts` + Beranda sementara untuk build uji coba. Keluar kini juga mengakhiri sesi Keycloak (R-10). Panduan di `docs/05` §2b, kebutuhan server di `docs/07_staging_requirements.md`. U-20 tetap terbuka (`docs/seed` dipasang sebagai volume).

### Tahap B5 — Penilaian ✅

Hasil:
- [x] NIL penuh, `comparisons`, Berulang, penjelasan, tampilan buta, antrean; uji INV-16/17

Catatan Tahap B5: aturan penilaian & perbandingan dipindah ke `simario/domain/{assessment,comparison}.py` dengan vektor bersama `assessment.json` (`evaluate_opening` murni; layanan menyimpan hasilnya). Uji API INV-16 (draf buta tidak pernah terkirim, termasuk kalimat pilihan) dan INV-17 (bukti konfidensial hanya hitungan) lulus. Tampilan buta dicatat server pada setiap `GET …?blind=1`; teks draf penjelasan hanya dikirim ke pemegang Lini 1. Mutasi dan `run_comparisons` mengunci `RiskQuarter` (diuji dengan dua utas). Reset demo "Sesuaikan data ke tanggal ini" kini memangkas data di backend seperti `seed/asOf.ts`. Arsip TA menutup penilaian dan penjelasan (`assessments/archive.py`); U-21 selesai. Endpoint baru `finalise-preview` menggantikan pembacaan store di dialog Tuntaskan. Modul `penilaian` masuk gerbang build uji coba.

### Tahap B6 — Riwayat, Notifikasi, Beranda ✅

Hasil:
- [x] RWY, NTF (semua event + `reminders`), BRD, `/jabatan`, `/pantauan`

Catatan Tahap B6: Lembar Mutu pindah ke `simario/domain/sheets.py` (vektor `sheets.json`, dipakai lagi di B7). `GET /positions/{pos}/history/{ta}`, `GET /home`, `GET /my-positions` mem-port `history.ts`/`home.ts` dengan VIS-9 di selector; hasil di riwayat memakai penyamaran draf penjelasan yang sama dengan halaman penilaian. Tugas `reminders` (FR-NTF-005/006/009 H-1/012) ada di `assessments/reminders.py`, idempoten per kunci dan tidak memunculkan peristiwa > 3 hari. Beranda sementara (`TrialHome`) dihapus; build uji coba kini menampilkan Beranda penuh, Riwayat, `/jabatan`, dan `/pantauan` (tautan Lembar di kartu Lini 1 masih 404 sampai B7). Semua event NTF lain sudah berjalan di backend sejak B3–B5.

### Tahap B7 — Lembar & Cetak ✅

Hasil:
- [x] LBR, snapshot, nomor, `sheet_freeze`, foto asli

Catatan Tahap B7: payload lembar pindah ke `simario/domain/sheet_payload.py` (vektor `sheet-payload.json`); blok tanda tangan Lini 3 kini diturunkan dari jabatan Lini 3 aktif (prototipe menulis id langsung). App `simario.sheets` menyimpan `PrintSnapshot` (payload snake_case, tidak pernah diubah selain `superseded_by`) dan `SheetPhotoSelection`. Penyamaran VIS-9 diterapkan di server, juga pada salinan beku dan salinan yang baru dicetak. Nomor cetak dikunci per jabatan + unik. `sheet_freeze` berjalan terjadwal dan langsung setelah Kirim Penjelasan serta pembukaan hasil (U-07 selesai); arsip TA membuat versi `archive` bila isi berubah. Pilihan foto hanya menerima gambar bersih non-konfidensial dari utas lini itu; foto ditampilkan dari berkas asli lewat unduhan pre-signed. Modul `lembar` masuk gerbang build uji coba.

### Tahap B8 — Metrik & Jejak Audit ⬜

Hasil:
- [ ] `insights` (metrik + CSV), audit dengan redaksi VIS-8 dan nilai asli (izin 24)

### Tahap B9 — Pemutusan mode lokal & kesiapan ⬜

Hasil:
- [ ] Hapus mode lokal dan gerbang modul; migrasi digabung lalu dibekukan
- [ ] Cadangan & pemulihan diuji; daftar kebutuhan ke tim infrastruktur OIKN
- [ ] `docs/00–06`, PRD §2.1 (RustFS, bila disetujui), `frontend/README.md` diperbarui

## 10. Perintah

Jalankan dari `frontend/`:

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run test
```

```bash
npm run lint
```

`npm run build` (termasuk `tsc --noEmit`) dan `npm run test` harus lulus sebelum melaporkan sebuah tahap selesai.

Backend — layanan dari root repositori, sisanya dari `backend/`:

```bash
docker compose up -d
```

```bash
uv run pytest
```

```bash
uv run ruff check .
```

```bash
uv run mypy .
```

```bash
uv run python manage.py spectacular --file openapi.yaml --validate
```

Setelah skema berubah, jalankan `npm run api:types` dari `frontend/`.

## 11. Git

- Repositori di root `simario2/`; `.gitignore` mencakup `node_modules`, `dist`, `.env*`.
- Komit kecil per tahap/fitur. Pesan berformat `tipe: deskripsi` **tanpa scope**, deskripsi bahasa Inggris berbentuk imperatif huruf kecil (`feat: add assessment comparison rules`). Tipe: `feat` (fitur), `fix` (perbaikan), `docs` (dokumen, PRD, spesifikasi), `style` (tampilan tanpa ubah perilaku), `refactor`, `test`, `chore` (konfigurasi, build, alat).
- **Tanpa baris `Co-Authored-By` atau atribusi Claude apa pun** di pesan komit (permintaan pengguna).
- Jangan push atau membuat remote tanpa permintaan pengguna.

## 12. Jangan

- Jangan memanggil layanan eksternal selain yang ada di `docker-compose.yml`. Jangan menyimpang dari keputusan §4 spec integrasi backend tanpa bertanya ke pengguna.
- Di backend, aturan bisnis memakai `simario.core.clock.now()`, tidak pernah `timezone.now()`/`datetime.now()` langsung.
- Jangan membaca/mengubah `Simario.pen` selain lewat MCP Pencil; jangan mengubah mockup kecuali diminta.
- Jangan memakai nama peran di logika, hex mentah di komponen, atau `new Date()` di aturan bisnis.
- Jangan menyembunyikan data buta/konfidensial hanya di tampilan — filter di selector.
- Jangan mengubah uraian risiko/mitigasi di `docs/seed/template_risiko_rapim.json` atau mengarang template baru tanpa persetujuan pengguna; koreksi yang disetujui dicatat di `seedNotes`.
- Jangan mengarang aturan yang tidak ada di PRD; bila PRD diam, pilih perilaku paling sederhana dan catat di laporan.
