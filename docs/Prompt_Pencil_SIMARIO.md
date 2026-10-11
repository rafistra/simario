# Prompt Pencil (pen.dev) — Mockup Lengkap SIMARIO

Panduan pakai:

1. Taruh `PRD_SIMARIO_v2.6.md` dan `DesignSystem_SIMARIO.md` di folder proyek Pencil, di `docs/`. Semua prompt merujuk ke path ini; ubah kalau Anda memakai path lain. Lampirkan juga dua screenshot Aksara ("Pengetahuan Saya" dan "Pengetahuan Unit Saya") ke sesi Prompt 0 sebagai referensi visual.
2. Buat satu file baru, misalnya `design/simario.pen`, lalu buka di Pencil.
3. Jalankan prompt **secara berurutan, satu per sesi**. Periksa hasil di kanvas sebelum lanjut ke prompt berikutnya. Prompt 0 wajib dijalankan pertama karena membangun token dan komponen yang dipakai prompt lain.
4. Prompt ditulis dalam bahasa Inggris supaya agen Pencil lebih presisi. Semua teks antarmuka tetap Bahasa Indonesia sesuai PRD.
5. Kalau hasil satu tahap kurang pas, koreksi dulu di sesi yang sama sebelum lanjut, karena tahap berikutnya memakai ulang komponennya.

Urutan tahap:

| # | Isi | Perkiraan frame |
|---|---|---|
| 0 | Token, komponen inti, Cover, Design Brief | Cover + library |
| 1 | Login, shell aplikasi, Beranda per lini, notifikasi | ±12 |
| 2 | Register Tahunan | ±9 |
| 3 | Papan Risiko dan utas | ±10 |
| 4 | Penilaian Triwulan dan antrean Lini 3 | ±12 |
| 5 | Riwayat Risiko, Lembar Komunikasi, Lembar Mutu, cetak | ±10 |
| 6 | Master Data | ±8 |
| 7 | Pengaturan, Jabatan Saya, daftar jabatan, metrik, jejak audit | ±14 |
| 8 | Versi ponsel, halaman gangguan, verifikasi akhir | ±10 |

---

## Prompt 0 — Fondasi desain

```
You are designing high-fidelity mockups for SIMARIO (Sistem Informasi Mitigasi Risiko Otorita IKN), an internal government risk-management web app. The full specification is in docs/PRD_SIMARIO_v2.6.md. Read §1 (especially 1.4 users/positions/roles, 1.5 scope, 1.8 route map and 1.8.1 navigation), §2.2 global design provisions, §2.4 interaction patterns, and §2.7 visibility rules before designing anything. The PRD is the source of truth; where this prompt and the PRD differ, follow the PRD.

This session builds ONLY the foundation: tokens, reusable components, the Cover frame and a Design Brief. No pages yet.

Register: product (app surface). Dense, calm, trustworthy government tool used mostly on laptops by civil servants. Not a marketing site.

Design system: docs/DesignSystem_SIMARIO.md is AUTHORITATIVE for colours, typography, radius, shadows, patterns and components. It is extracted from the production CSS of Aksara (KMS OIKN, aksara.ikn.go.id), a sibling app by the same team; the attached Aksara screenshots show the target look. Match Aksara closely so SIMARIO feels like the same product family:
- Samudra navy sidebar (#0A2342) with cream text, active item = ~10% white pill (#233955) with a Terakota (#DBAF6C) left edge, user block at the bottom, logo + "SIMARIO" in Newsreader with eyebrow "SIMARIO · OIKN".
- The "Portal Aktif"-style card under the logo becomes the POSITION SWITCHER: eyebrow "JABATAN AKTIF", value "PPK A-1 · DDKB", CapacityChip Pejabat/Operator, gold circular icon. (This replaces the topbar switcher described in PRD FR-AUT-009.)
- Cream topbar (#FEFCF6, bottom border) with breadcrumb, pill search with "Ctrl K", bell with Saka red count badge, an outline contextual button.
- Cream page canvas #F6F2E6, surfaces #FFFDF8, borders #E3DBC4 / #D5CBB0, text #0C1B2C / #34414F / #56616E / #6B7582.
- Page titles in Newsreader (40 px, weight 500), UI in Plus Jakarta Sans, numbers/dates/eyebrows/table headers in JetBrains Mono (uppercase eyebrows with 1.6 px tracking, tabular figures, Indonesian decimal comma "3,2").
- Summary strip, filter pills (active = Samudra filled), tall rounded search/select fields, Aksara-style tables (mono uppercase header on #FAF7EE, dotted status pills), empty state (Tirta circle icon, Newsreader title, primary button).
- Radius 6 / 10 / 16 / 22 / full; shadows exactly as the design system (shadow-card, shadow-md, shadow-lg) — no other shadows.
- SIMARIO-specific colours (predicates, Lini 1/2/3 chips, markers, Konfidensial, Operator notice, hidden/blind cells) from §2.4 of the design system — all already contrast-checked ≥ 4.5:1.

Tokens: create variables for EVERY token in the design system §2.1–2.4 and §4 with the exact hex values, using light values from Aksara and dark values from the "Gelap" column (mode axis). Fonts: Newsreader, Plus Jakarta Sans, JetBrains Mono. Pages are rendered in light mode.

Layout tokens: desktop frame 1440 × 900 (pages can grow taller), sidebar 240 (Aksara uses ~317; keep 240 per PRD unless it breaks the switcher card — then use 280 and note it), topbar 56–72, content max-width 1200, padding 32 desktop / 16 mobile, single breakpoint at 900 (mobile frames 390 wide).

Build a component library (reusable: true, PascalCase names, a context string on every component describing behaviour, all states):
1. AppShell parts, Aksara-style: Sidebar (logo block, PositionSwitcher card, menu items with Lucide line icons + label, active state, section eyebrows "MASTER DATA" and "PENGATURAN", user block at the bottom with role-view switcher in its ⋯ menu), Topbar (breadcrumb, search with Ctrl K, NotificationBell with Saka count badge, outline contextual button).
2. PositionSwitcher (Aksara "Portal Aktif" card): eyebrow "JABATAN AKTIF", active position e.g. "PPK A-1 · DDKB", CapacityChip "Pejabat" or "Operator"; open state lists holdings grouped by Lini 1 / Lini 2 / Lini 3.
3. WorkspaceHeader: position name + work unit, fiscal-year selector "TA 2027", tabs Papan · Register · Penilaian · Riwayat · Lembar (active, hover, focus).
4. Buttons: Primary, Secondary, Ghost, Destructive, plus a "finalising" variant disabled-for-Operator with caption "Dilakukan oleh [Nama Pejabat]". States: default, hover, focus, pressed, disabled, loading.
5. Form controls: TextInput, Textarea, Select, Checkbox, Toggle, DatePicker field, FileDrop area, SearchField — default, focus, filled, error (with message), disabled.
6. ScoreInput: numeric 0,0–4,0 (one decimal, Indonesian comma) with live PredicateBadge next to it; states empty, filled, out-of-range error "Skor 0,0–4,0", locked (finalised, lock icon).
7. PredicateBadge (3 variants), LineChip (3), CapacityChip (Pejabat / Operator), StatusChip (Draf, Siap Diterbitkan, Terbit, Diarsipkan, Dituntaskan, Menunggu, Terbuka sebagian, Terbuka), MarkerBadge (Belum ada langkah triwulan ini, Tidak Sesuai, Sesuai, Berulang, Tanpa mitigasi, Tanpa bukti, Nonaktif sejak TW [n], Terlambat, Sangat Terlambat, Konfidensial, Belum relevan, Tidak dinilai Lini 1, Langkah).
8. ComparisonCell: L1 chip + one chip per Lini 3 directorate + ✓/✕ result; variants hidden ("Tersembunyi sampai perbandingan dibuka"), partial, open-sesuai, open-tidak-sesuai, incomparable.
9. Comment: avatar, name, LineChip, capacity ("sebagai Operator PPK A-1"), relative time, body, attachments, optional Langkah badge, "(disunting)", menu; variants normal, Langkah, withdrawn ("Komentar ditarik oleh … pada …"), with confidential attachments.
10. Composer: textarea with @mention suggestion list, attach button, "Tandai sebagai Langkah" (Lini 1 only), per-file "Konfidensial" toggle (Lini 3 only), "Terkait TW [n]" selector, "Kirim"; a blind-phase warning variant for Lini 3.
11. AttachmentChip: image thumbnail, file icon + name + size, "Memindai…", quarantined, confidential masked ("2 lampiran konfidensial").
12. DataTable (header, row, row hover, stacked-card mobile variant), Pagination, FilterPills.
13. Card, SummaryStrip (Aksara-style multi-column strip with Newsreader figures and dotted labels), FilterPills (Aksara style), EmptyState (Aksara style), Toast (success, error), InlineAlert (info, warning, error), ConfirmDialog, SlideOver (420 px), BottomBar (sticky: autosave indicator "Draf tersimpan", progress text, actions), Stepper-free section header.
14. NotificationItem (unread, read) and NotificationPanel.

Then create:
- A Cover frame at canvas origin: product name, owner "Direktorat Data dan Kecerdasan Buatan, Otorita IKN", Product Owner "Binsar H. Simanjuntak", status "In design", version "Mockup v1 — PRD v2.6", scope (all pages in PRD §1.8), links (PRD path).
- A Design Brief note beside the Cover summarising: that docs/DesignSystem_SIMARIO.md (Aksara-based) is the design system, aesthetic direction, tokens, component list, naming convention for page frames "SIMARIO / [Module] / [Page] / [State] / [Desktop|Mobile]", the rule that all UI copy is formal Bahasa Indonesia taken from the PRD, and the realistic sample data set below. Later sessions will read this note.
- Canvas sections: SourceOfTruth (library), BuildReady (pages), UXStates, Responsive.

Realistic sample data (fictional people; never "John Doe" or lorem ipsum):
- Positions: KPA Satker A (Kasatker Direktorat X); PPK A-1 and PPK A-2 in work unit DDKB; Pokja Pemilihan 03 (members: Dimas Prasetyo — Pengisi, Ratna Sari, Yohanes Lubis); Pejabat Pengadaan Satker B; Lini 2 lead "Penanggung Jawab Pemantauan Deputi Bidang Pendanaan", supports "Biro Keuangan, BMN, ADP" (Kinerja Anggaran) and "UKPBJ" (PBJ); Lini 3 "Direktorat Kepatuhan" and "Direktorat Pengawasan dan Audit Internal".
- People: Rafi Ananda (Operator for PPK A-1), Andi Wirawan (Pejabat PPK A-1), Siti Rahmawati (Lini 2), Hendra Gunawan (Kepatuhan), Maya Kusuma (PAI), Superadmin "Admin DKB".
- Risks (from the Rapim deck): "Penyerapan anggaran tidak mencapai target per Triwulan", "Keterlambatan proses pembayaran termin kepada Penyedia", "Pemecahan kontrak", "HPS tidak disusun secara cermat sesuai dengan kebutuhan belanja", "Deviasi Rencana Penarikan Dana (RPD) yang tinggi". Mitigations from the deck as well.
- Fiscal year TA 2027, current quarter TW I, deadlines per PRD §2.5 defaults.

Follow your normal discipline: get_variables before SetVariables, small batches, screenshot after each visual chunk, names and context on everything, accessibility checks (contrast in both modes, 44 px targets, focus states). Finish by listing every component id you created.
```

---

## Prompt 1 — Login, shell, Beranda, notifikasi

```
Continue the SIMARIO mockup in this .pen. Read the Design Brief note on the Cover first and reuse ONLY library components (ref nodes) — build from primitives only if nothing fits, and say so. Spec: docs/PRD_SIMARIO_v2.6.md chapters 3 (Authentication), 4 (Home) and 11 (Notifications), plus §1.8.1 navigation. All copy in formal Bahasa Indonesia, quoted verbatim from the PRD where given.

Create desktop page frames (1440 wide) in the BuildReady section, named "SIMARIO / [Module] / [Page] / [State] / Desktop":

Auth
1. /login default — SSO primary button "Masuk dengan Akun Otorita IKN", collapsed "Masuk dengan akun lokal".
2. /login local form expanded with error "NIP atau kata sandi tidak sesuai".
3. /login unregistered-account error (FR-AUT-001 copy).
4. /ganti-kata-sandi forced mode with live requirement checklist.

Home (FR-BRD-001 to 011) — each with full AppShell, correct sidebar for the role, PositionSwitcher showing the right capacity:
5. Lini 1 Pejabat (PPK A-1, Andi Wirawan) in January: two assessment obligation cards (TW IV TA 2026 with explanation due, TW I TA 2027 not yet open "dibuka mulai …"), action card, register status card "Register TA 2027 belum diterbitkan" with "Salin dari TA 2026", last-quarter mini Lembar Mutu, recent activity.
6. Lini 1 Operator (Rafi Ananda for PPK A-1): same with the persistent Operator notice from FR-AUT-009 and the "draf siap" items absent.
7. Lini 2 (Siti Rahmawati): coordinated positions list sorted by quiet risks + recent activity.
8. Lini 3 (Hendra Gunawan, Direktorat Kepatuhan): assessment obligation card(s) + attention card + recent activity.
9. Superadmin: configuration health card + other cards per FR-BRD-010.
10. PMD with no holding: short welcome with links to Master Data.
11. Home empty state "Tidak ada yang perlu Anda kerjakan saat ini."
12. PositionSwitcher (sidebar card) open state over a page (user holding Pejabat of one position and Operator of two).

Notifications
13. NotificationPanel open over Home with mixed unread/read items using FR-NTF texts (mention, comparison opened, explanation due, Operator appointed).
14. /notifikasi full page with filters and pagination.

For every page add note nodes beside the frame: state contract, flow context (what precedes/follows), and which PRD FR ids it implements. Screenshot after each frame; keep the visual language identical across frames.
```

---

## Prompt 2 — Register Tahunan

```
Continue the SIMARIO mockup. Read the Design Brief note first; reuse library components. Spec: docs/PRD_SIMARIO_v2.6.md chapter 5 (Risk Register), §2.6 validation, §1.4.2 Pejabat/Operator, and the stage list in FR-MST-001.

Page /jabatan/:jid/register/2027 for PPK A-1 (stages for PPK per FR-MST-001; three risk types per stage). Desktop frames:
1. Draft, Operator view: Data Umum card (fixed fields + identity block read-only), stage sections collapsible, risk cards with expanded mitigation checkboxes (not pre-ticked), "+ Risiko sendiri", "+ Mitigasi sendiri", "Tidak ada risiko pada jenis ini" with reason, stage toggle "Tahap ini tidak relevan tahun ini"; BottomBar with autosave and "Tandai Siap Diterbitkan".
2. Copy-from-previous-year banner state (empty register) and the post-copy summary including "Tidak disalin: tahap … tidak aktif".
3. Ready state, Pejabat view: BottomBar "Terbitkan Register"; gap list highlighted after pressing publish with a missing declaration and an empty mandatory Data Umum field.
4. Publish ConfirmDialog with the FR-REG-007 copy and the list of risks flagged "Tanpa mitigasi".
5. Published state: locked cards with lock icon, menu "Nonaktifkan", strip "2 tambahan belum diterbitkan" (one draft, one ready), BottomBar "Terbitkan Tambahan".
6. Deactivate dialog (mandatory reason, effective-from-next-quarter explanation, TW IV variant text "Nonaktif mulai TA 2028").
7. Read-only view as Lini 2 / Lini 3 (no selection controls, inactive items dimmed).
8. Pokja member who is not the Pengisi: read-only with a short explanation why.
9. Archived register (read-only banner).

Annotate each frame with state contract, validation copy (blocking vs flag per §2.6) and FR ids.
```

---

## Prompt 3 — Papan Risiko dan utas

```
Continue the SIMARIO mockup. Read the Design Brief note first; reuse library components (Comment, Composer, AttachmentChip, MarkerBadge, ComparisonCell). Spec: docs/PRD_SIMARIO_v2.6.md chapter 6 (Risk Board), §1.5 participation, §2.7 visibility (VIS-1 to VIS-9), RB-PPN-004.

Desktop frames:
1. /jabatan/:jid/papan/2027 board list: grouped by stage › risk type, rows with counts per line, last activity, latest predicate chips, markers, unseen-activity dot; filter row.
2. Board empty state "Register TA 2027 belum diterbitkan." with "Buka Register".
3. Thread page as Lini 1 Pejabat: header chips, quarter dividers "TW I", risk timeline with a Langkah comment, a Lini 2 advice comment, a Lini 3 comment with "2 lampiran konfidensial", an edited comment, a withdrawn comment; mitigation sub-threads collapsed and one expanded; right panel with per-quarter assessment summary (TW I hidden "Tersembunyi sampai perbandingan dibuka", TW IV of previous year visible if lineage exists via "Riwayat TA sebelumnya" link); composer with "Tandai sebagai Langkah".
4. Same thread as Operator (Operator notice, composer identical, capacity label on own comments).
5. Same thread as Lini 3 during the blind phase: composer with per-file "Konfidensial" toggle and the blind-phase warning from FR-PPN-003; confidential files visible to them.
6. Same thread as Lini 2: no Langkah option, no confidential toggle; confidential files masked.
7. Composer showing "Terkait TW IV" selected (earlier quarter still open) with "Tandai sebagai Langkah" unavailable and the reason shown.
8. @mention suggestion list open; attachment upload states (Memindai…, quarantined).
9. Non-participant reader view: no composer, note "Anda dapat membaca utas ini."
10. New-comments banner "[n] komentar baru — Tampilkan" and archived thread state.

Annotate: participation rules per line, visibility rules applied on this page, edit window 15 minutes, FR ids.
```

---

## Prompt 4 — Penilaian Triwulan dan antrean Lini 3

```
Continue the SIMARIO mockup. Read the Design Brief note first; reuse library components (ScoreInput, PredicateBadge, ComparisonCell, BottomBar, ConfirmDialog). Spec: docs/PRD_SIMARIO_v2.6.md chapter 7 (Quarterly Assessment), §2.5 time rules, §2.6, §2.7 VIS-1/2/5/9. This is the most complex screen in the product — clarity of state is the priority.

Page /jabatan/:jid/penilaian/2027/1 for PPK A-1. Desktop frames:
1. Before the Lini 1 window opens: read-only with "Penilaian TW I dibuka mulai …".
2. Lini 1 Operator entering scores: some rows scored with live predicate, one "Belum relevan triwulan ini" with reason, evidence attachments, other columns showing "Tersembunyi sampai perbandingan dibuka"; BottomBar "[x] dari [y] dituntaskan · [z] belum dinilai", "Tandai Siap".
3. Lini 1 Pejabat finalise ConfirmDialog with the FR-NIL-003 copy and "Tanpa bukti" list.
4. After partial finalise: finalised rows locked with per-row "Buka Kembali", remaining rows still editable, lateness marker on a late row.
5. Lini 3 (Direktorat Kepatuhan) blind entry: score + optional note per row, confidential-by-default attachments, Lini 1 and PAI columns hidden, keyboard-entry hint, filter "Belum dinilai saja".
6. Comparison partially open (Kepatuhan opened, PAI late): as Lini 1 — Kepatuhan column visible with ✓/✕, PAI column "Menunggu" with Terlambat marker.
7. Same moment as seen by PAI (still blind, VIS-9): no other scores, no Sesuai/Tidak Sesuai, no Berulang markers for those risks.
8. Fully open, as Lini 1: rows with Tidak Sesuai pinned to top; explanation blocks per directorate (mandatory when Lini 1 is higher, optional when lower), "Alasan/Kendala" + "Rencana Tindak Lanjut", checkbox "Gunakan penjelasan yang sama untuk Direktorat Pengawasan dan Audit Internal", deadline; BottomBar "Kirim Penjelasan".
9. Fully open, as Lini 2 (read-only) showing sent explanations and a "Berulang" risk.
10. "Tidak dinilai Lini 1" and "Tidak dapat dibandingkan" rows.
11. Superadmin blind-view confirmation dialog (FR-NIL-012 copy).
12. /penilaian Lini 3 queue: rows per position with progress, status, Lini 1 status, "Register belum terbit" row, attention filters.

Annotate every frame with: which visibility rules apply to the viewer, which actions are Pejabat-only, state transitions, FR ids.
```

---

## Prompt 5 — Riwayat, Lembar Komunikasi, Lembar Mutu, cetak

```
Continue the SIMARIO mockup. Read the Design Brief note first; reuse library components. Spec: docs/PRD_SIMARIO_v2.6.md chapters 8 (Risk History) and 9 (Communication Sheets & Print), VIS-7 and VIS-9.

Desktop frames:
1. /jabatan/:jid/riwayat: Lembar Mutu block (risk types × TW I–IV, L1 + each Lini 3 averages and predicates, "Menunggu" cells), risk × quarter matrix with chip cells, "Belum relevan", "Tidak dinilai", "—", recurring red left border, inactive dimmed rows.
2. Cell detail SlideOver: scores, Lini 3 notes, explanation + plan, lateness, link "Lihat utas TW II".
3. "Tampilkan lintas tahun" expanded on one lineage (TA 2026 + TA 2027 columns).
4. /jabatan/:jid/lembar/2027/1 Lembar Komunikasi live view ("Tampilan berjalan" badge): identity block, Section A (Langkah per risk, Lini 1 assessment only for opened risks, explanations, "Tidak ada langkah tercatat"), Section B (Lini 2 inputs), Section C (Lini 3 comments + assessments).
5. Lembar Mutu tab: table per FR-LBR-004 + findings list.
6. Photo picker open (max 5 per section, refusal message on the sixth, confidential files never offered).
7. Version panel: snapshot list (number, version, trigger, superseded flag) and number search.
8. Frozen snapshot view with "Ini salinan beku. Lihat tampilan berjalan." and "Digantikan oleh Versi 2".
9. Print preview on A4 portrait (separate frame 794 × 1123): header with snapshot number and version, sections, max 5 photos, "[n] lampiran konfidensial tidak dicetak", four-column signature block, footer note, "SEMENTARA" watermark variant.
10. Masked rendering for a still-blind Lini 3 viewer with "Sebagian isi disamarkan untuk pembaca ini".

Annotate derived-data rules (what is excluded from averages), snapshot rules, FR ids.
```

---

## Prompt 6 — Master Data

```
Continue the SIMARIO mockup. Read the Design Brief note first; reuse library components (DataTable, SlideOver, Toggle). Spec: docs/PRD_SIMARIO_v2.6.md chapter 10 (Master Data). User: Pengelola Master Data.

Desktop frames:
1. /master/template: 280 px tree (risk owner type › stage › risk type with counts), template list with "Dipakai [N] jabatan" badges, active toggles.
2. Template edit SlideOver: wording, reorderable mitigation list, usage warning banner — no score fields.
3. /master/tahap: accordion per risk owner type with the seeded stages from FR-MST-001, drag handles, inline rename, active toggle.
4. /master/usulan: proposal queue table with "Jadikan Template" and "Tolak" (reason dialog).
5. /master/data-umum: per-type form builder with locked fixed fields, default objective, additional fields, version label.
6. /master/skala-penilaian: version selector, band table, guidance text per predicate, 0–4 preview bar with text labels, gap/overlap error state.
7. /master/jabatan: position types grouped by line + positions table with filters; position form SlideOver rendering identity fields of the chosen type.
8. Deactivation warnings (type in use, position with live registers).

Annotate validation rules and FR ids.
```

---

## Prompt 7 — Pengaturan, Jabatan Saya, daftar, metrik, audit

```
Continue the SIMARIO mockup. Read the Design Brief note first; reuse library components. Spec: docs/PRD_SIMARIO_v2.6.md chapter 12 (Administration), §1.4, Appendix A, and FR-BRD-011.

Desktop frames:
1. /pengaturan/pengguna table with filters and row action menu (Sunting · Tetapkan Jabatan · Alih Pejabat · Atur Ulang Kata Sandi · Nonaktifkan); roles column showing automatic roles read-only with their source.
2. "Tetapkan Jabatan" dialog incl. Pokja Pengisi toggle and decree fields.
3. "Alih Pejabat" dialog: effective date not in the future, consequences (Operators ending, registers stay), promotion case for an existing Operator.
4. "Nonaktifkan" dialog, plus the refusal when the user is a Pokja Pengisi with other members.
5. /pengaturan/peran: role list + grouped permission table (26 codes, groups per FR-ADM-002, "Hanya Pejabat" badges, scope selectors, Superadmin read-only "Peran terkunci").
6. /pengaturan/penugasan-pemantauan: "Belum ditugaskan" card, table, add dialog (multi-select Lini 1 positions, one lead, supports with domain, quarter range, decree).
7. /pengaturan/tahun-anggaran: year list, quarter rows with both windows and deadlines, tolerance, archive grace days, archive panel, expected Lini 3 set with "Kecualikan" (reason) for a quarter.
8. /pengaturan/impor: kind selector, template download, dry-run with error table, disabled "Terapkan" with reason, job history.
9. /jabatan-saya: "Sebagai Pejabat" cards with Operator list, "Sebagai Operator" cards.
10. "Tunjuk Operator" dialog: NIP/name search, letter number, letter date, PDF upload, optional end date; and the no-Operator note "Anda mengerjakan sendiri. Menunjuk operator bersifat opsional."
11. /jabatan position directory and /pantauan (Lini 2) lists.
12. /metrik: one card per objective (1, 2, 3, 4, 8, 9) with value, target, small trend, query note, "Data belum cukup" variant.
13. /jejak-audit: filters, expandable before/after rows, redacted values "[disamarkan]" and "[konfidensial]", Superadmin toggle "Tampilkan nilai asli".

Annotate permission requirements per page and FR ids.
```

---

## Prompt 8 — Ponsel, halaman gangguan, verifikasi akhir

```
Continue the SIMARIO mockup. Read the Design Brief note first. Spec: docs/PRD_SIMARIO_v2.6.md §2.2 (single breakpoint 900, tables become stacked cards, no horizontal scroll) and §2.4.

1. Mobile frames (390 wide, Responsive section) for the screens Lini 1 actually uses on a phone: Home (Lini 1 Pejabat), Risk Board list, Risk thread with composer, Quarterly assessment as one card per risk with BottomBar, Lembar Komunikasi read view. Sidebar becomes a drawer; show the drawer open once.
2. Fault states (UXStates section), desktop: 403 "Anda tidak memiliki akses ke halaman ini", 404, 500, offline, session expired redirect message "Sesi Anda berakhir. Silakan masuk kembali.", loading skeleton for the board and the assessment page.
3. Verification pass over the whole file:
   - every page frame from prompts 1–7 exists and is named per the convention; list any missing PRD route from §1.8;
   - all nodes use library components and tokens (no raw hex);
   - dark mode check on Home (Lini 1) and Quarterly assessment;
   - contrast, 44 px targets, focus states;
   - every frame has notes with FR ids.
4. Update the Cover status to "Design review" and write a final note listing every frame, grouped by module, with its route.
```
