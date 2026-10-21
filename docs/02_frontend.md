# 02 — Frontend

> Status dokumen: 21 Okt 2026 · PRD v2.9 · kode `frontend/` per komit `7bebb66`.
> Status implementasi: **semua 10 tahap selesai** (CLAUDE.md §9); 26 berkas uji / 206 uji lulus, lint dan build lulus.

## 1. Stack

| Aspek | Pilihan | Versi (dikunci persis di `frontend/package.json`) |
|---|---|---|
| UI | React | 18.3.1 |
| Bahasa | TypeScript (strict, `noUnusedLocals`, `noUncheckedSideEffectImports`) | 5.9.3 |
| Bundler / dev server | Vite | 6.4.4 |
| Routing | React Router (`react-router-dom`) | 7.18.4 — v6 punya kerentanan; v7 tetap mendukung React 18 |
| State | Zustand (+ immer untuk basis data lokal) | 5.0.15 / 10.2.0 |
| Ikon | `lucide-react` | 1.55.0 |
| Fon | `@fontsource-variable` Newsreader, Plus Jakarta Sans, JetBrains Mono | 5.3.0 |
| Uji | Vitest + Testing Library + jsdom | 5.0.3 |
| Mutu kode | ESLint 9 (typescript-eslint, react-hooks, react-refresh) + Prettier 3 | — |

Tidak memakai Tailwind atau pustaka UI; CSS biasa berbasis variabel token. Alias impor: `@/` → `frontend/src/`, `@seed/` → `docs/seed/`, `@vectors/` → `shared/test-vectors/` (`vite.config.ts`, `tsconfig.app.json`). Tipe API dihasilkan dari `backend/openapi.yaml` ke `src/data/http/schema.d.ts` (`npm run api:types`; `npm run lint` memeriksa kemutakhirannya). Server dev mem-proxy `/api` dan `/oidc` ke `http://localhost:8100` serta `/storage` ke RustFS `http://localhost:9100`, sehingga backend berada di origin yang sama (cookie sesi, CSRF).

## 2. Struktur folder

```
frontend/
  index.html
  vite.config.ts            alias, server.fs.allow '..' (agar @seed/@vectors terbaca), proxy backend, konfigurasi Vitest
  scripts/
    build-tokens.mjs        pencil-variables.json → src/styles/tokens.css
    pencil-variables.json   snapshot GetVariables() dari Simario.pen
  public/_redirects         SPA fallback untuk Netlify seret-lepas
  src/
    main.tsx                tema, ?sebagai=/?waktu=/?data=sesuai, penjadwal, render
    App.tsx                 seluruh rute + penjaga izin
    components/             pustaka komponen (nama = komponen Simario.pen)
    layout/                 AppShell, Sidebar, Topbar, Workspace, nav, pageMeta, RequirePermission
    pages/                  auth, home, register, board, assessment, history, sheets, master,
                            notifications, admin, faults
    domain/                 types, permissions, calendar, scoreBands, rules/
    data/                   repository, db, api/, local/, seed/
    lib/                    format, useQuery, useSaving, useFocusTrap, theme, notificationKinds
    state/                  session, clock, devSettings, useAuth
    dev/                    DevPanel, ComponentGallery (/_komponen), simulate
    styles/                 tokens.css (dihasilkan), base.css, print.css
    test/setup.ts           jest-dom
```

Lapisan data dan alirannya dijelaskan di [00_arsitektur.md §2](00_arsitektur.md#2-arsitektur-saat-ini-prototipe); kontrak per namespace di [03_api_contract.md](03_api_contract.md).

## 3. Rute

Semua rute PRD §1.8 tersedia (`src/App.tsx`). Di dalam `AppShell` (butuh sesi):

| Rute | Halaman (`src/pages/…`) | Penjaga |
|---|---|---|
| `/login`, `/ganti-kata-sandi` | `auth/LoginPage`, `auth/ChangePasswordPage` | Di luar AppShell |
| `/` | `home/HomePage` | Sesi |
| `/notifikasi` | `notifications/NotificationsPage` | Sesi |
| `/jabatan-saya` | `admin/MyPositionsPage` | Memegang jabatan |
| `/jabatan`, `/pantauan` | `home/PositionListPage` | Izin 1 cakupan Unit/Semua · holding Lini 2 |
| `/penilaian` | `assessment/QueuePage` | Izin 8 |
| `/jabatan/:jid` | `WorkspaceRedirect` → papan TA berjalan | Cakupan atas `:jid` (`layout/Workspace.tsx`) |
| `/jabatan/:jid/papan/:ta[/risiko/:rid]` | `board/BoardPage`, `board/ThreadPage` | idem |
| `/jabatan/:jid/register/:ta` | `register/RegisterPage` | idem |
| `/jabatan/:jid/penilaian/:ta/:tw` | `assessment/AssessmentPage` | idem |
| `/jabatan/:jid/riwayat` | `history/HistoryPage` | idem |
| `/jabatan/:jid/lembar/:ta/:tw` | `sheets/SheetPage` | idem |
| `/master/jabatan · tahap · template · usulan · data-umum · skala-penilaian` | `master/*` | Izin 17/18 · 15 · 12 · 13 · 16 · 14 |
| `/pengaturan/pengguna · peran · penugasan-pemantauan · tahun-anggaran · impor` | `admin/*` | Izin 21 · 22 · 20 · 19 · 18/20/21 |
| `/metrik`, `/jejak-audit` | `admin/MetricsPage`, `admin/AuditPage` | Izin 22 · 23 |
| `/_komponen` | `dev/ComponentGallery` | Hanya `import.meta.env.DEV` |
| 403 / 404 / 500 / luring | `faults/FaultPages` | Error boundary & rute asal |

Penjaga rute (`RequirePermission anyOf={[…]}`, `RequireHolding`, `RequireWideScope` di `App.tsx`) hanya untuk navigasi; **izin yang sebenarnya diperiksa lagi di lapisan data** (`requireActor`, `checkAction`, dan `assertCanRead` untuk cakupan baca ruang kerja jabatan). `Workspace.tsx` memakai aturan cakupan yang sama (`canReadPosition`, per TA yang dilihat) hanya untuk menampilkan halaman 403.

## 4. Pola halaman

### 4.1 Membaca data

```tsx
const q = useQuery(() => boardApi.board(jid, ta), [jid, ta]);
if (q.loading && !q.data) return <Skeleton … />;          // kerangka mirip tata letak akhir
if (q.error && !q.data) return <InlineAlert variant="error" onRetry={q.retry}>…</InlineAlert>;
```

- `useQuery` (`lib/useQuery.ts`) menjalankan ulang kueri setiap `useDb().version` naik (setiap mutasi), tanpa mengosongkan data lama — skeleton hanya pada muat pertama.
- Halaman yang membaca store secara sinkron (master, admin, register) dibungkus `DataGate` agar tetap punya skeleton dan galat + "Coba Lagi". Register memakai read model `buildRegisterView` (`data/api/registerView.ts`) yang sudah memfilter butir per pembaca.
- Halaman menerima data **yang sudah difilter** (VIS-1…9, skor disembunyikan). Jangan menyaring data rahasia di JSX.

### 4.2 Menulis data

```tsx
const { saving, run } = useSaving();
await run(registerApi.publish(key));       // galat → toast merah; saving → "Menyimpan…"
toast.success('Register diterbitkan');      // toast kanan atas, 4 detik, maks 3
```

Pola wajib PRD §2.4 yang sudah ada sebagai komponen:

| Pola | Komponen / tempat |
|---|---|
| Keadaan kosong (ikon, judul, satu kalimat, aksi) | `EmptyState` |
| Memuat | `Skeleton`, `LoadingRegion`, `DataGate` |
| Galat + "Coba Lagi" | `InlineAlert variant="error" onRetry` |
| Konfirmasi destruktif (tombol merah) | `ConfirmDialog` |
| Sukses | `toast` (`components/Feedback/toastStore.ts`) |
| Autosave "Draf tersimpan" | `BottomBar` (register, penilaian) |
| Tombol tidak pernah nonaktif tanpa penjelasan | Tombol tetap aktif lalu mendaftar kekurangan; pengecualian Operator: `FinalizeOperatorButton` ("Dilakukan oleh [Nama Pejabat]") |
| Paginasi 25 baris / 50 komentar | `Pagination`, utas |

### 4.3 Konteks pengguna dan jabatan aktif

`useAuth()` (`state/useAuth.ts`) memberi `user`, `holdings`, `active` (holding yang dipilih di kartu "JABATAN AKTIF"), `permissions`/`can(kode)`, `roleViews`/`roleView`, `currentQuarter`. Tampilan peran hanya mengubah menu (`layout/nav.ts`), **tidak pernah** dipakai untuk izin (FR-AUT-007). Halaman ruang kerja mendapat `WorkspaceOutletContext` dari `layout/Workspace.tsx` (jabatan, TA, tab Papan · Register · Penilaian · Riwayat · Lembar).

`usePageMeta(crumbs, contextAction)` mengisi breadcrumb dan tombol kontekstual di Topbar.

## 5. Komponen

Nama komponen React = nama komponen di `Simario.pen` (CLAUDE.md §7). Ekspor terpusat di `src/components/index.ts`:

| Folder | Komponen |
|---|---|
| `Button` | `Button` (primary, secondary, ghost, destructive), `FinalizeOperatorButton` |
| `Form` | `Field`, `TextInput`, `Textarea`, `Select`, `DatePickerField`, `SearchField`, `Checkbox`, `Toggle`, `FileDrop` |
| `Chips` | `LineChip`, `CapacityChip`, `PredicateBadge`, `StatusChip`, `MarkerBadge`, `Avatar`, `AttachmentFileChip`, `AttachmentImageChip`, `ConfidentialAttachmentsChip` |
| `Feedback` | `InlineAlert`, `Toaster`/`toast`, `EmptyState`, `Skeleton`, `LoadingRegion` |
| `Surfaces` | `Card`, `SummaryStrip`, `FilterPills`, `PageHeader` |
| `Table` | `DataTable` (kartu bertumpuk < 900 px), `TableCardMobile`, `Pagination` |
| `Overlay` | `ConfirmDialog`, `SlideOver` (fokus terkunci, Esc) |
| `BottomBar` | `BottomBar` |
| `ScoreInput` | Dropdown kalimat penilaian (PRD v2.8), daftar datar terburuk → terbaik, tanpa angka |
| `NotificationPanel` | `NotificationPanel`, `NotificationItem` |
| `DataGate` | Gerbang muat pertama untuk halaman yang membaca store langsung |

Komponen khusus halaman ada di folder halamannya (mis. `pages/board/Composer.tsx`, `pages/register/RiskCard.tsx`, `pages/assessment/AssessmentRow.tsx`, `pages/sheets/SheetDocument.tsx`). Semua komponen dipamerkan di `/_komponen` (mode dev; `?tema=gelap` untuk mode gelap).

## 6. Gaya dan tema

- **Token saja.** `src/styles/tokens.css` (165 token, 69 nilai gelap) dihasilkan `npm run tokens` dari `scripts/pencil-variables.json`; jangan diedit tangan. Komponen memakai `var(--…)`; tidak ada hex mentah di komponen/halaman (satu-satunya pengecualian: `#fff`/`#000` di `styles/print.css`).
- Teks tautan memakai `--text-link`, bukan `--action-primary`.
- Mode gelap: `[data-theme="dark"]` di `<html>` (`lib/theme.ts`, kunci `simario:theme`); toggle di menu pengguna; `?tema=gelap|terang` memaksa.
- Satu CSS per komponen/modul (`Button.css`, `Board.css`, `Shell.css`, …). `base.css` memuat fon, reset, aturan target sentuh seluler, cincin fokus; `print.css` menyembunyikan semua kecuali `.print-root`, A4 potret.
- Tata letak (PRD §2.2): sidebar 240 px (dapat diciutkan jadi rel ikon 72 px, diingat per pengguna), topbar sticky, konten maks 1200 px (1368 px saat sidebar diciutkan), padding 32/16 px. **Satu breakpoint 900 px**: di bawahnya satu kolom, sidebar jadi drawer, tabel jadi kartu, tanpa gulir horizontal.
- Detail warna, tipografi, radius, bayangan: [DesignSystem_SIMARIO.md](DesignSystem_SIMARIO.md). Alur mengambil ukuran dari Pencil: CLAUDE.md §7a.

## 7. Format angka & tanggal

Helper di `src/lib/format.ts` (font mono di tampilan):

| Helper | Contoh |
|---|---|
| `formatDate` | "6 Apr 2027" |
| `formatDateLong`, `formatDateTime` | "Selasa, 6 April 2027", "6 Apr 2027 09.41" |
| `formatRelative(iso, now)` | "baru saja", "5 menit lalu", "kemarin", lalu tanggal (memakai jam simulasi) |
| `formatScore` / `parseScore` | "3,2" — hanya untuk halaman Skala Penilaian, CSV metrik, impor |
| `formatRupiah`, `formatFileSize`, `initials` | Data Umum, lampiran, avatar |

## 8. Aksesibilitas (WCAG 2.1 AA)

- Tautan "Lewati ke konten", urutan fokus sesuai AccessibilityContract `.pen`, cincin fokus 2 px `--ring-focus`.
- `useFocusTrap` untuk dialog, slide-over, pencarian; Esc menutup.
- Target sentuh ≥ 44 px di ponsel (aturan seluler di `base.css`; sakelar memakai area sentuh `::after`).
- Warna tidak pernah satu-satunya penanda (chip predikat selalu berteks).
- `prefers-reduced-motion` dihormati.
- Nama menu sidebar tetap terbaca pembaca layar saat diciutkan (tooltip + label).

## 9. Fitur khusus prototipe

| Fitur | Tempat | Catatan |
|---|---|---|
| Tanggal simulasi | `state/clock.ts` (`now()`, `useNow`, kunci `simario:clock`) | Bawaan 6 Apr 2027 09.00, berjalan mengikuti waktu nyata sejak digeser |
| DevPanel | `dev/DevPanel.tsx` (tombol "Prototipe" kanan bawah) | Persona, tanggal + preset, "Sesuaikan data ke tanggal ini", latensi, gagalkan panggilan, luring, batas sesi, tema, simulasi komentar masuk, atur ulang data |
| Tautan demo | `main.tsx` | `?sebagai=usr-andi&waktu=2027-03-18T09:00&data=sesuai` |
| Data sesuai tanggal | `data/seed/asOf.ts` (`seedAsOf`) | Menghapus/menggulung balik semua yang bertanggal setelah titik potong |
| Sinkron antar-tab | event `storage` di `data/local/store.ts` | Pengganti polling 30 detik NFR-015 |

Semua fitur ini harus dikeluarkan atau dimatikan di build produksi saat backend tersedia.

## 10. Penyebaran

`netlify.toml` di root: base `frontend`, `npm run build`, publish `dist`, Node 22, semua rute → `index.html` (SPA), header `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, aset `/assets/*` di-cache 1 tahun. Seret-lepas `frontend/dist` juga didukung lewat `public/_redirects`. Setiap pengunjung memegang salinan data contoh sendiri di browsernya — gunakan data fiktif saja.

Cara menjalankan dan menguji: [05_local_dev_and_testing.md](05_local_dev_and_testing.md).
