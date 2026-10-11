# CLAUDE.md — SIMARIO

Panduan kerja untuk Claude di repositori ini. Baca seluruhnya sebelum menulis kode.

## 1. Apa yang dibangun

**SIMARIO** (Sistem Informasi Mitigasi Risiko Otorita IKN) — **prototipe frontend** yang terasa seperti aplikasi asli, untuk demo dan uji pengguna.

- Semua modul PRD masuk cakupan (AUT, BRD, REG, PPN, NIL, RWY, LBR, MST, NTF, ADM), dikerjakan bertahap dengan checkpoint (§9).
- **Tanpa backend.** Data disimpan di `localStorage` (berkas besar opsional di IndexedDB).
- Bukan kode produksi, tetapi strukturnya harus mudah dipindah ke Django REST nanti: semua akses data lewat satu lapisan repository.

## 2. Sumber kebenaran (urutan prioritas)

1. `docs/PRD_SIMARIO_v2.7.md` — perilaku, aturan, salinan teks (copy), FR/VIS/INV. **PRD menang** bila ada perbedaan.
2. `docs/DesignSystem_SIMARIO.md` — warna, tipografi, radius, bayangan, komponen (berbasis Aksara).
3. `Simario.pen` (Pencil) — mockup 99 frame. Bacanya **hanya lewat MCP Pencil** (`mcp__pencil__execute` dengan `Get`/`Print`/`TakeScreenshot`), jangan dengan Read/Grep. Catatan penting di dalamnya:
   - `DesignBrief` (THmWq): keputusan desain, persona, linimasa data contoh.
   - `FrameIndex` (TvVoU): daftar semua frame per modul beserta rutenya.
   - `AccessibilityContract` (lfTFq): kontras, target sentuh, urutan fokus, peran ARIA.
   - Setiap frame punya note di kanannya (StateContract, validasi, izin, FR id) — itulah spesifikasi halaman.
4. `docs/seed/template_risiko_rapim.json` — **template risiko & mitigasi per jenis pemilik risiko dan tahap**, diekstrak dari dek Rapim (`docs/PPT Konsep Pengembangan … (Rapim) (1).pptx`, 12 Okt 2026). Data referensi final (FR-MST-010): 4 jenis (KPA/Kasatker, PPK, Pokja Pemilihan, Pejabat Pengadaan), 14 tahap, 146 risiko, 302 mitigasi, plus Data Umum dan panduan skoring. Koreksi atas cacat dek tercatat di `seedNotes`.
5. `docs/Prompt_Pencil_SIMARIO.md` — konteks pembuatan mockup saja.

Bila PRD dan mockup berbeda, ikuti PRD dan catat perbedaannya di laporan.

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
  data/          repository.ts (antarmuka), local/ (implementasi localStorage), seed/ (data contoh)
  state/         session (persona, jabatan aktif, tampilan peran), clock (tanggal simulasi), toast
  dev/           DevPanel (ganti persona, geser tanggal, reset data)
```

## 4. Lapisan data

- `data/repository.ts` mendefinisikan antarmuka per agregat (`registers`, `comments`, `assessments`, …). Halaman **tidak pernah** menyentuh `localStorage` langsung.
- Implementasi lokal: satu kunci per koleksi, berawalan `simario:v1:`; ada `schemaVersion` — bila berubah, data di-seed ulang.
- Seed dimuat saat pertama kali dibuka dan bisa di-reset dari DevPanel.
- Setiap mutasi menulis `AuditLog` (append-only; tidak ada fungsi update/delete untuk audit) dan, bila relevan, `Notification` sesuai FR-NTF.
- Lampiran: simpan metadata (nama, ukuran, MIME, `scan_status`). Isi berkas gambar kecil (≤500 KB) boleh di IndexedDB; selebihnya placeholder. Status "Memindai…" disimulasikan ±2 detik lalu `clean`.
- Simulasi asinkron ringan (latensi 150–400 ms) agar skeleton dan "Menyimpan…" terlihat; bisa dimatikan di DevPanel.

## 5. Waktu, sesi, persona

- **Tanggal simulasi** (`state/clock`) menggantikan `new Date()` di seluruh aturan bisnis. Default: **6 Apr 2027**. DevPanel bisa menggesernya; tugas terjadwal (pembukaan perbandingan, Terlambat, deteksi Berulang, versi lembar otomatis, arsip) dievaluasi ulang setiap tanggal berubah dan pada setiap event tuntaskan.
- **Login**: `/login` tampil sesuai mockup. Tombol SSO membuka pemilih persona; akun lokal menerima NIP + kata sandi seed. Tidak ada Keycloak.
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
- **Pita skor aktif (dikonfirmasi pengguna):** 0–2,0 Kurang Terkendali · 2,1–3,0 Cukup Terkendali · 3,1–4,0 Terkendali. Batas bawah eksklusif, batas atas inklusif.

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
- Tata letak (PRD §2.2): sidebar 240 tetap, topbar sticky 56–64, konten maks 1200, padding 32/16. **Satu breakpoint 900 px**: di bawahnya satu kolom, sidebar jadi drawer, tabel jadi kartu bertumpuk, tanpa gulir horizontal.
- Pola §2.4: skeleton saat memuat, InlineAlert merah + "Coba Lagi" saat galat, dialog merah untuk tindakan destruktif, toast kanan atas 4 detik, "Draf tersimpan" di BottomBar, paginasi 25 baris / 50 komentar.
- Angka & tanggal: font mono, koma desimal ("3,2"), format tanggal Indonesia ("6 Apr 2027"). Gunakan helper `formatScore`, `formatDate`, `formatRelative`.
- Aksesibilitas (WCAG 2.1 AA): cincin fokus 2 px `--ring-focus`; target sentuh ≥44 px di ponsel (tombol teks 40 di desktop); warna tidak pernah satu-satunya penanda; peran ARIA sesuai AccessibilityContract; hormati `prefers-reduced-motion`.
- Cetak: `print.css` menyembunyikan sidebar, topbar, tombol, filter; A4 potret; watermark "SEMENTARA" untuk snapshot sementara.

## 7a. Mengambil desain dari Pencil (`Simario.pen`)

Pencil adalah **sumber ukuran dan gaya**, bukan sumber kode. Ekspor HTML Pencil menghasilkan hex mentah, posisi absolut, lebar tetap, dan tanpa keadaan interaktif — jangan disalin ke `src/`.

Alur per komponen/halaman:

1. **Token (sekali, Tahap 1)** — `Print(GetVariables())` lewat `mcp__pencil__execute`, lalu tulis `styles/tokens.css` secara otomatis (skrip di `frontend/scripts/`): nama variabel `.pen` → `--nama`, mode `light` di `:root`, mode `dark` di `[data-theme="dark"]`. Jangan mengetik nilai token dengan tangan.
2. **Baca node, bukan ekspor** — `Print(Get("<id>", {depth: 3}))` untuk komponen library, atau cari frame halaman lewat FrameIndex lalu baca subtree-nya. Nilai di node masih berupa token (`$bg-surface`, `$radius-lg`) plus padding/gap/ukuran/font numerik — terjemahkan 1:1 ke CSS (`var(--bg-surface)`, `padding: 24px`, `gap: 16px`). `layout: vertical/horizontal` → flex column/row; `fill_container` → `flex: 1`/`width: 100%`; `fit_content` → ukuran alami.
3. **Baca konteks** — `context` di node dan note di samping frame berisi perilaku, validasi, izin, dan FR id. Itu spesifikasi; ikuti bersama PRD.
4. **Instans & override** — node `ref` menunjuk komponen library (id di DesignBrief); `descendants` berisi override (teks, ikon, keadaan). Petakan ke props komponen React, jangan membuat salinan komponen.
5. **Responsif & keadaan** — frame `.pen` berukuran tetap (1440 / 390). Bangun layout cair dengan breakpoint 900 px; keadaan hover/fokus/nonaktif diambil dari matriks keadaan di SourceOfTruth.
6. **Verifikasi** — `TakeScreenshot([frameId])` lalu bandingkan dengan tampilan aplikasi di lebar yang sama. Perbedaan yang disengaja dicatat di laporan checkpoint.
7. **Ekspor HTML hanya sebagai referensi ukuran** bila struktur node sulit dibaca — simpan di scratchpad, tidak di repositori.

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
2. `npm run build`, `npm run test`, dan `npm run lint` lulus.
3. Setiap halaman di tahap itu sudah dibandingkan dengan frame `.pen`-nya (screenshot frame lewat MCP Pencil vs. tampilan di browser) pada 1440 px dan 390 px.
4. Semua keadaan di note frame tersedia: kosong, memuat (skeleton), galat (+ "Coba Lagi"), Operator, read-only/arsip — sesuai yang berlaku.
5. Sudah dicoba manual dengan persona yang relevan (lihat "Skenario uji" tiap tahap).
6. Ada komit git dengan pesan `Checkpoint N: <ringkasan>`.

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

### Tahap 1 — Fondasi visual ⬜

Hasil:
- [ ] `styles/tokens.css` diekspor dari variabel `Simario.pen` (terang + gelap, termasuk `--text-link`)
- [ ] Fon Newsreader, Plus Jakarta Sans, JetBrains Mono termuat
- [ ] Komponen dasar dengan semua keadaan (default, hover, fokus, ditekan, nonaktif, memuat, galat): Button (Primary, Secondary, Ghost, Destructive, FinalizeOperator), TextInput, Textarea, Select, DatePickerField, SearchField, Checkbox, Toggle, FileDrop
- [ ] Chip & lencana: LineChip, CapacityChip, PredicateBadge, StatusChip, MarkerBadge, Avatar, AttachmentChip
- [ ] Umpan balik: InlineAlert (4 varian), Toast, EmptyState, Skeleton
- [ ] Wadah: Card, SummaryStrip, FilterPills, DataTable + TableCardMobile, Pagination, ConfirmDialog, SlideOver
- [ ] Halaman `/_komponen` (hanya mode dev) memamerkan semua komponen, terang dan gelap

Skenario uji: bandingkan `/_komponen` dengan bagian SourceOfTruth di `.pen`; navigasi keyboard menampilkan cincin fokus di semua kontrol.

---

### Tahap 2 — Fondasi aplikasi ⬜

Hasil:
- [ ] `domain/types.ts`: semua entitas PRD §2.8.1
- [ ] `data/repository.ts` + implementasi localStorage (`simario:v1:`), latensi simulasi, reset
- [ ] Seed lengkap: unit kerja, jenis jabatan, jabatan, pengguna & persona, holding Pejabat/Operator, peran & 26 izin, penugasan pemantauan, TA 2026 (diarsipkan) & TA 2027 dengan kuartal, versi pita skor, formulir Data Umum, register PPK A-1 dan contoh lain, komentar, penilaian TW I, snapshot, notifikasi, audit — konsisten dengan DesignBrief
- [ ] Tahap & template diimpor dari `docs/seed/template_risiko_rapim.json`; test memastikan jumlahnya 4 jenis / 14 tahap / 146 risiko / 302 mitigasi dan setiap risiko register contoh yang `is_custom = false` cocok persis dengan salah satu template di tahap & jenis risikonya
- [ ] `state/clock` (default 6 Apr 2027) dan evaluator tugas terjadwal
- [ ] Sesi: `/login` (SSO → pemilih persona; akun lokal; galat; terkunci 5×), `/ganti-kata-sandi` (wajib & mandiri), batas 60 menit tidak aktif
- [ ] AppShell: Sidebar (pemilih jabatan "JABATAN AKTIF", menu per tampilan peran, blok pengguna + menu ⋯), Topbar (breadcrumb, cari Ctrl K, lonceng, tombol kontekstual), WorkspaceHeader + tab, OperatorNotice, drawer < 900 px
- [ ] Router untuk semua rute §1.8 (halaman belum dibangun tampil sebagai placeholder) + 403, 404, 500, luring
- [ ] `domain/rules/permissions.ts` (izin + holding + Pejabat/Pengisi) dan `domain/visibility.ts` (VIS-1…9) dengan test
- [ ] Penulis AuditLog dan Notification terpusat
- [ ] DevPanel: ganti persona, geser tanggal, matikan latensi, reset data

Skenario uji: masuk sebagai Andi, Rafi, Siti, Hendra, Nur Aini, Admin DKB — menu sidebar dan pemilih jabatan sesuai; buka `/pengaturan/pengguna` sebagai Andi → 403; rute asal → 404.

---

### Tahap 3 — Master Data (MST) ⬜

Hasil:
- [ ] `/master/jabatan` — jenis jabatan per lini, tabel jabatan, formulir dengan isian identitas per jenis, nonaktifkan (ditolak bila dipakai, sesuai frame)
- [ ] `/master/tahap` — akordeon per jenis, ubah nama inline, urutkan dengan seret, aktif/nonaktif
- [ ] `/master/template` — pohon 280 px, daftar, slide-over sunting, peringatan "Dipakai [N] jabatan", nonaktifkan
- [ ] `/master/usulan` — antrean, "Jadikan Template", "Tolak" dengan alasan
- [ ] `/master/data-umum` — pembangun formulir berversi
- [ ] `/master/skala-penilaian` — versi, tabel pita, galat celah/tumpang tindih, pratinjau 0–4, panduan per predikat

Skenario uji: Nur Aini membuka `/master/template` → pohon menampilkan 4 jenis dan 14 tahap dengan hitungan sesuai berkas seed (mis. PPK › Pelaksanaan/Pengendalian Kontrak: 5 / 8 / 9); membuat draf pita dengan celah → simpan ditolak; nonaktifkan template → hilang dari pilihan register baru.

---

### Tahap 4 — Register (REG) ⬜

Hasil:
- [ ] `/jabatan/:jid/register/:ta` — Data Umum + blok identitas, bagian tahap (3 jenis risiko), kartu risiko template → mitigasi, "+ Risiko sendiri", "+ Mitigasi sendiri", "Tidak ada risiko", "Tahap tidak relevan"
- [ ] BottomBar: autosave, jumlah celah, Operator "Tandai Siap Diterbitkan", Pejabat "Terbitkan Register" / "Terbitkan Tambahan" (daftar celah, dialog konfirmasi, flag `no_mitigation`)
- [ ] Salin dari TA sebelumnya + ringkasan salin
- [ ] Tambahan tengah tahun, nonaktifkan risiko/mitigasi (termasuk kasus TW IV), hapus draf
- [ ] Tampilan baca (Lini 2/3, anggota Pokja bukan Pengisi), register diarsipkan
- [ ] Usulan risiko dibuat saat terbit; Lini 2 diberi notifikasi; semua perubahan ke audit

Skenario uji: Rafi menyusun lalu menandai siap → Andi menerima notifikasi dan menerbitkan; gerbang struktural memblokir, risiko tanpa mitigasi tetap terbit dengan flag.

---

### Tahap 5 — Papan Risiko & Utas (PPN) ⬜

Hasil:
- [ ] `/jabatan/:jid/papan/:ta` — dikelompokkan tahap › jenis, kolom per FR-PPN-001, penanda, filter (tersimpan per pengguna per jabatan), titik aktivitas baru, keadaan kosong
- [ ] `/jabatan/:jid/papan/:ta/risiko/:rid` — header, linimasa per TW, sub-utas mitigasi (`#mitigasi-:mid`), panel kanan ringkasan triwulan (VIS-1/2)
- [ ] Composer: @sebut (hanya peserta), lampiran (≤10, "Memindai…"), "Tandai sebagai Langkah" (Lini 1), "Konfidensial" per berkas (Lini 3), "Terkait TW [n]" (RB-PPN-004), peringatan fase buta Lini 3, Ctrl+Enter
- [ ] Sunting ≤15 menit "(disunting)", tarik komentar, ikuti/berhenti mengikuti, banner "[n] komentar baru", pembaca bukan peserta, utas diarsipkan
- [ ] Penanda sepi, langganan, notifikasi sebut & komentar baru

Skenario uji: Hendra melampirkan berkas konfidensial → Andi hanya melihat "1 lampiran konfidensial"; Langkah Andi menghapus penanda sepi.

---

### Tahap 6 — Penilaian Triwulan (NIL) ⬜

Hasil:
- [ ] `/jabatan/:jid/penilaian/:ta/:tw` — header strip, pemilih TW, daftar per tahap › jenis, ScoreInput + predikat langsung, "Belum relevan" + alasan, lampiran, catatan Lini 3, jendela belum dibuka
- [ ] Operator "Tandai Siap"; Pejabat "Tuntaskan Penilaian" (dialog ringkasan, flag `no_evidence`, keterlambatan), "Buka Kembali" per baris
- [ ] Pembukaan perbandingan (penuh / sebagian / menunggu), "Tidak dinilai Lini 1", Sesuai / Tidak Sesuai / Tidak dapat dibandingkan, VIS-1/5/9
- [ ] Penjelasan per direktorat (wajib/opsional, "Gunakan penjelasan yang sama…", tenggat hari kerja, "Kirim Penjelasan")
- [ ] Deteksi Berulang lintas kuartal/tahun; tampilan buta Superadmin (dialog + audit)
- [ ] `/penilaian` — antrean Lini 3 dengan filter dan "Register belum terbit"
- [ ] Test unit untuk pembukaan perbandingan, keterlambatan, penjelasan, Berulang, dan visibilitas

Skenario uji: geser tanggal 18 Mar 2027 → Rafi mengisi, Andi menuntaskan; Hendra & Maya menilai; tanggal 3 Apr → perbandingan terbuka sebagian; Andi wajib menjelaskan hasil Tidak Sesuai.

---

### Tahap 7 — Riwayat, Notifikasi, Beranda (RWY, NTF, BRD) ⬜

Hasil:
- [ ] `/jabatan/:jid/riwayat` — ringkasan Lembar Mutu, matriks risiko × TW, slide-over detail sel, lintas tahun, filter
- [ ] Panel notifikasi (380 px) dan `/notifikasi` (filter, paginasi); semua event FR-NTF-001…012, idempoten
- [ ] `/` — kartu per lini sesuai FR-BRD-010 (Lini 1 Pejabat/Operator, Lini 2, Lini 3, Superadmin, PMD tanpa jabatan, kosong)
- [ ] `/jabatan` dan `/pantauan`

Skenario uji: Beranda tiap persona cocok dengan frame Beranda di `.pen`; klik notifikasi membuka konteks yang tepat.

---

### Tahap 8 — Lembar & Cetak (LBR) ⬜

Hasil:
- [ ] `/jabatan/:jid/lembar/:ta/:tw` — Lembar Komunikasi (Bagian A/B/C) dan Lembar Mutu, semuanya turunan dan netral-pembaca (VIS-7)
- [ ] Pilih foto (maks 5 per bagian), panel versi, cari nomor snapshot, salinan beku, penyamaran untuk direktorat terlambat (VIS-9)
- [ ] Cetak: snapshot `trigger=print`, nomor `SIMARIO/[LK|LM]/…`, watermark "SEMENTARA", blok tanda tangan, catatan status dokumen, `print.css` A4
- [ ] Versi otomatis (`auto_freeze`) dan `superseded_by`

Skenario uji: cetak dari tampilan berjalan membuat snapshot baru; mencetak versi beku tidak membuat snapshot; pratinjau cetak cocok dengan frame A4.

---

### Tahap 9 — Administrasi & Metrik (ADM) ⬜

Hasil:
- [ ] `/pengaturan/pengguna` — tabel, Tambah Pengguna, Tetapkan Jabatan (Pokja + Pengisi), Alih Pejabat, Atur Ulang Kata Sandi, Nonaktifkan (+ penolakan Pengisi)
- [ ] `/pengaturan/peran` — daftar peran, tabel 26 izin dengan cakupan, "Hanya Pejabat", Superadmin terkunci, penjaga INV-5
- [ ] `/pengaturan/penugasan-pemantauan` — tabel, kartu "Belum ditugaskan", dialog massal, INV-14
- [ ] `/pengaturan/tahun-anggaran` — buat TA, editor kuartal, validasi INV-9, panel arsip, pengecualian Lini 3, arsip manual
- [ ] `/pengaturan/impor` — 3 jenis, unduh templat CSV, uji coba (dry run) dengan laporan galat, "Terapkan", riwayat
- [ ] `/jabatan-saya` — kartu Pejabat/Operator, Tunjuk Operator, Cabut
- [ ] `/metrik` — kartu tujuan 1, 2, 3, 4, 8, 9 dengan kueri, "Data belum cukup", unduh CSV
- [ ] `/jejak-audit` — filter, baris dapat dibuka (sebelum/sesudah), redaksi VIS-8, "Tampilkan nilai asli" (izin 24, dicatat)

Skenario uji: Admin DKB melakukan Alih Pejabat PPK A-1 → operator lama berakhir otomatis; Andi menunjuk Galih Pratama sebagai operator → Galih bisa masuk.

---

### Tahap 10 — Penyelesaian & verifikasi ⬜

Hasil:
- [ ] Semua halaman diperiksa pada 390 px: kartu bertumpuk, drawer, BottomBar ponsel, target ≥44 px, tanpa gulir horizontal
- [ ] Mode gelap di semua halaman (toggle di menu pengguna)
- [ ] Aksesibilitas: urutan fokus, tautan lewati, peran ARIA, kontras, `prefers-reduced-motion`
- [ ] Skeleton & keadaan galat di setiap halaman berdata; halaman 403/404/500/luring/sesi berakhir
- [ ] Verifikasi silang: setiap frame di FrameIndex `.pen` punya padanan di aplikasi; daftar perbedaan yang tersisa
- [ ] README singkat di `frontend/` (cara menjalankan, persona, DevPanel)

Skenario uji: alur penuh TW I dari pengisian sampai cetak Lembar dengan mengganti persona dan tanggal, tanpa galat konsol.

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

## 11. Git

- Repositori di root `simario2/`; `.gitignore` mencakup `node_modules`, `dist`, `.env*`.
- Komit kecil per tahap/fitur, pesan dalam bahasa Inggris berbentuk imperatif (`Add assessment comparison rules`).
- Jangan push atau membuat remote tanpa permintaan pengguna.

## 12. Jangan

- Jangan memanggil API eksternal atau menambah backend.
- Jangan membaca/mengubah `Simario.pen` selain lewat MCP Pencil; jangan mengubah mockup kecuali diminta.
- Jangan memakai nama peran di logika, hex mentah di komponen, atau `new Date()` di aturan bisnis.
- Jangan menyembunyikan data buta/konfidensial hanya di tampilan — filter di selector.
- Jangan mengubah uraian risiko/mitigasi di `docs/seed/template_risiko_rapim.json` atau mengarang template baru tanpa persetujuan pengguna; koreksi yang disetujui dicatat di `seedNotes`.
- Jangan mengarang aturan yang tidak ada di PRD; bila PRD diam, pilih perilaku paling sederhana dan catat di laporan.
