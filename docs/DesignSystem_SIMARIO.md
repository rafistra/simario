# Design System SIMARIO

| | |
|---|---|
| **Versi** | 1.0 — 11 Oktober 2026 |
| **Dasar** | Token produksi **Aksara — KMS OIKN** (aksara.ikn.go.id), diambil langsung dari CSS situs; mode gelap dari **JDIH OIKN** (jdih.ikn.go.id) |
| **Pengganti** | PRD v2.6 §2.2 untuk warna, tipografi, radius, bayangan, dan komponen. Ketentuan tata letak §2.2 (breakpoint 900, sidebar 240, topbar 56, max 1200) tetap berlaku |
| **Alasan** | SIMARIO dibangun tim yang sama dengan stack yang sama dengan Aksara (PRD §2.1). Memakai bahasa visual Aksara membuat aplikasi DKB terasa satu keluarga dan menghemat waktu desain |

> Semua nilai di bawah adalah nilai **persis** dari CSS Aksara, kecuali yang ditandai *SIMARIO* (turunan khusus untuk kebutuhan SIMARIO).

---

## 1. Prinsip

1. **Satu keluarga dengan Aksara.** Sidebar navy Samudra, kanvas krem, judul serif Newsreader, label mono huruf kapital. Pengguna yang sudah memakai Aksara langsung merasa familiar.
2. **Tenang dan padat informasi.** Aplikasi kerja, bukan situs promosi. Aksen emas Terakota dipakai hemat: penanda aktif, ikon jabatan aktif, sorotan.
3. **Warna tidak pernah satu-satunya penanda.** Setiap predikat, status, dan penanda selalu punya teks, dan bila perlu ikon atau titik.
4. **Angka selalu mono.** Skor 0,0–4,0, tanggal, NIP, nomor cetak, hitungan, dan label kapital memakai JetBrains Mono dengan angka tabular.

---

## 2. Warna

### 2.1 Palet Nusantara (token merek)

| Token | Nama | Hex | Pemakaian di SIMARIO |
|---|---|---|---|
| `color-khatulistiwa` | Khatulistiwa | `#185088` | Tombol utama, tautan, ikon aktif |
| `color-terakota` | Terakota | `#DBAF6C` | Aksen: garis kiri item menu aktif, ikon jabatan aktif, sorotan |
| `color-jagawana` | Jagawana | `#428A40` | Sukses, predikat Terkendali |
| `color-pertiwi` | Pertiwi | `#FBF9D5` | Latar catatan Operator, area draf |
| `color-buana` | Buana | `#04182A` | Teks paling gelap (jarang) |
| `color-samudra` | Samudra | `#0A2342` | Sidebar, pil filter aktif, latar terbalik |
| `color-langit` | Langit | `#3A7BC8` | Cincin fokus, tautan sekunder |
| `color-tirta` | Tirta | `#E3ECF6` | Latar status informasi |
| `color-saka` | Saka | `#EE2F24` | Bahaya, badge jumlah notifikasi |

### 2.2 Skala

| Langkah | Primary (biru) | Accent (emas) | Neutral (hangat) |
|---|---|---|---|
| 0 | — | — | `#FFFFFF` |
| 50 | `#F1F5FA` | `#FAF5EB` | `#FAF8F2` |
| 100 | `#E3ECF6` | `#F3E7CD` | `#F2EEE2` |
| 200 | `#C4D7EC` | `#E9D2A2` | `#E6E0CF` |
| 300 | `#94B6DC` | `#DBAF6C` | `#D3CCB8` |
| 400 | `#5F93CB` | `#CF9950` | `#A9A291` |
| 500 | `#3A7BC8` | `#BD8038` | `#7C7768` |
| 600 | `#185088` | `#A1682D` | `#585448` |
| 700 | `#123F6D` | `#815028` | `#3F3C34` |
| 800 | `#0E3157` | `#6B4225` | `#2A2822` |
| 900 | `#0A2342` | `#5B3922` | `#1A1915` |
| 950 | `#061729` | — | — |

| Status | 50 | 100 | 300 | 500 | 600 | 700 |
|---|---|---|---|---|---|---|
| Success | `#EEF6EE` | `#D5E9D4` | `#7CB87A` | `#428A40` | `#367235` | `#2C5C2B` |
| Danger | `#FDECEB` | `#FBD0CD` | `#F5837C` | `#EE2F24` | `#CF1F15` | `#A81A12` |
| Warning | — | — | — | `#CF9950` | `#B07C33` | — |

### 2.3 Token semantik

| Token | Terang (Aksara) | Gelap (dari JDIH) | Pemakaian |
|---|---|---|---|
| `bg-page` | `#F6F2E6` | `#081427` | Kanvas halaman |
| `bg-page-alt` | `#EDE6D1` | `#0B1830` | Pita/bagian bergantian |
| `bg-surface` | `#FFFDF8` | `#0F2240` | Kartu, tabel, panel, dialog |
| `bg-surface-muted` | `#FAF7EE` | `#0C1A31` | Header tabel, area sekunder |
| `bg-inverse` | `#0A2342` | `#0A2342` | Sidebar |
| `border-subtle` | `#E3DBC4` | `#1D3457` | Garis antar-baris, pembatas kartu |
| `border-default` | `#D5CBB0` | `#2A4670` | Input, tombol garis |
| `border-strong` | `#A9A291` | `#7B8AA5` | Hover input, pemisah tegas |
| `text-strong` | `#0C1B2C` | `#F2ECDD` | Judul, isi penting |
| `text-default` | `#34414F` | `#CDD4DF` | Isi |
| `text-muted` | `#56616E` | `#A3ADC0` | Keterangan |
| `text-subtle` | `#6B7582` | `#7D89A0` | Placeholder, metadata |
| `text-inverse` | `#F6F2E6` | `#F6F2E6` | Teks di sidebar |
| `text-on-primary` | `#FFFFFF` | `#FFFFFF` | Teks tombol utama |
| `ring-focus` | `#3A7BC8` | `#86A7D6` | Cincin fokus 2 px |

*Mode gelap tidak dipakai Aksara; nilainya dipetakan dari token gelap JDIH supaya tetap satu keluarga OIKN. SIMARIO v1.0 dirender dalam mode terang; mode gelap cukup disiapkan di level token.*

### 2.4 Warna khusus SIMARIO

| Peran | Teks / ikon | Latar | Garis | Catatan |
|---|---|---|---|---|
| **Terkendali** | `#2C5C2B` (success-700) | `#D5E9D4` (success-100) | — | Selalu dengan teks predikat |
| **Cukup Terkendali** | `#815028` (accent-700) | `#F3E7CD` (accent-100) | — | Kontras ≥ 4,5:1 |
| **Kurang Terkendali** | `#A81A12` (danger-700) | `#FBD0CD` (danger-100) | — | |
| **Lini 1** | `#123F6D` (primary-700) | `#E3ECF6` | — | Chip teks "Lini 1" |
| **Lini 2** | `#6B4225` (accent-800) | `#FAF5EB` | `#E9D2A2` | Chip teks "Lini 2" |
| **Lini 3** | `#3F3C34` (neutral-700) | `#F2EEE2` | `#D3CCB8` | Chip teks "Lini 3" |
| **Sesuai** | success-700 | — | — | Ikon ✓ + teks |
| **Tidak Sesuai** | danger-700 | danger-50 | — | Ikon ✕ + teks |
| **Berulang** | danger-700 | — | garis kiri 3 px danger-500 | Pada baris risiko |
| **Belum ada langkah / Terlambat** | accent-700 | accent-50 | — | Penanda peringatan |
| **Sangat Terlambat** | danger-700 | danger-50 | — | |
| **Konfidensial** | `#F6F2E6` | `#0A2342` (samudra) | — | Chip gembok, kontras tinggi |
| **Catatan Operator** | text-default | `#FBF9D5` (pertiwi) | accent-200 | Pita "Anda bekerja sebagai operator…" |
| **Tersembunyi (buta)** | text-subtle | bg-surface-muted | border-subtle putus-putus | "Tersembunyi sampai perbandingan dibuka" |

Status register dan penilaian memakai pil bertitik seperti status di Aksara: **Draf** neutral, **Siap** accent, **Terbit / Dituntaskan / Terbuka** success, **Menunggu / Terbuka sebagian** primary (latar `#E3ECF6`, titik `#185088`), **Diarsipkan** neutral gelap.

---

## 3. Tipografi

| Token | Font | Fallback | Pemakaian |
|---|---|---|---|
| `font-display` | **Newsreader Variable** (serif) | "Iowan Old Style", Georgia, serif | Judul halaman, judul kartu kosong, angka besar ringkasan |
| `font-sans` | **Plus Jakarta Sans Variable** | "Segoe UI", system-ui, sans-serif | Semua teks antarmuka |
| `font-mono` | **JetBrains Mono Variable** | ui-monospace, Menlo, monospace | Skor, tanggal, NIP, nomor cetak, hitungan, label kapital (eyebrow), header tabel, `Ctrl K` |

Skala (dari Aksara, disesuaikan untuk aplikasi kerja):

| Token | Font | Ukuran / tinggi baris | Berat | Spasi huruf | Contoh |
|---|---|---|---|---|---|
| `display-lg` | Newsreader | 40 / 44 | 500 | −0,6 px | "Penilaian Triwulan" (judul halaman) |
| `display-md` | Newsreader | 28 / 34 | 500 | −0,4 px | Judul bagian besar |
| `display-sm` | Newsreader | 22 / 28 | 500 | −0,3 px | Judul empty state, judul dialog |
| `figure` | Newsreader | 32 / 36 | 500 | 0 | Angka kartu ringkasan (0, 12, 18) |
| `body-lg` | Plus Jakarta | 16 / 24 | 400 | 0 | Subjudul halaman |
| `body` | Plus Jakarta | 14 / 22 | 400 | 0 | Teks umum, isi komentar |
| `body-strong` | Plus Jakarta | 14 / 22 | 600 | 0 | Uraian risiko, nama |
| `label` | Plus Jakarta | 13 / 18 | 500 | 0 | Label form, pil |
| `caption` | Plus Jakarta | 12 / 16 | 400 | 0 | Metadata, waktu relatif |
| `eyebrow` | JetBrains Mono | 11 / 16 | 600 | 1,6 px, kapital | "JABATAN AKTIF", header tabel "RISIKO" |
| `mono` | JetBrains Mono | 13 / 18 | 500 | 0, angka tabular | Skor "3,2", tanggal "7 Okt 2026", NIP |

Catatan:
- Ukuran judul halaman Aksara di layar kerja ±40 px (screenshot "Pengetahuan Saya"); 64 px hanya untuk hero beranda publik dan tidak dipakai SIMARIO.
- Angka desimal memakai koma Indonesia: "3,2", "0,0–4,0".
- **Alternatif:** JDIH memakai fon resmi IKN **Sutasoma Display / Sutasoma Text** (self-hosted). Jika ingin identitas IKN lebih kuat, `font-display` bisa diganti Sutasoma Display; antarmuka tetap Plus Jakarta Sans supaya sejalan dengan Aksara.

---

## 4. Bentuk, jarak, bayangan

| Token | Nilai | Pemakaian |
|---|---|---|
| `radius-sm` | 6 px | Chip, pil status, kbd |
| `radius-md` | 10 px | Tombol, input, item menu |
| `radius-lg` | 16 px | Kartu, tabel, panel, dialog |
| `radius-xl` | 22 px | Kartu besar kosong / blok utama (seperti empty state Aksara) |
| `radius-full` | 999 px | Pil filter, avatar, badge jumlah |

Jarak: skala 4 px — 4, 8, 12, 16, 20, 24, 32, 40, 48. Padding kartu 24, padding halaman 32 (desktop) / 16 (ponsel), jarak antar-blok utama 24.

| Token | Nilai (Aksara) | Pemakaian |
|---|---|---|
| `shadow-xs` | `0 1px 2px hsl(212 57% 11% / .05)` | Input, tombol garis |
| `shadow-card` | `0 1px 2px hsl(212 40% 18% / .04), 0 8px 24px -8px hsl(212 40% 18% / .1)` | Kartu, tabel |
| `shadow-card-hover` | `0 2px 4px hsl(212 40% 18% / .05), 0 22px 44px -14px hsl(212 40% 18% / .22)` | Kartu yang bisa diklik saat hover |
| `shadow-md` | `0 2px 4px hsl(212 57% 11% / .05), 0 8px 20px hsl(212 57% 11% / .08)` | Popover, dropdown, panel notifikasi |
| `shadow-lg` | `0 4px 8px hsl(212 57% 11% / .06), 0 18px 40px hsl(212 57% 11% / .13)` | Dialog, slide-over |

---

## 5. Pola dari Aksara yang dipakai ulang

Dipetakan dari screenshot "Pengetahuan Saya" dan "Pengetahuan Unit Saya":

| Pola Aksara | Ciri | Dipakai di SIMARIO sebagai |
|---|---|---|
| **Sidebar Samudra** | Latar `#0A2342`; logo + nama aplikasi (Newsreader) + eyebrow "KMS · OIKN"; item ikon garis + label teks krem; item aktif berlatar putih ±10% (`#233955`) dengan garis kiri Terakota; blok pengguna di bawah (avatar inisial, nama, email, menu ⋯) | Sidebar SIMARIO; eyebrow "SIMARIO · OIKN" |
| **Kartu "Portal Aktif"** | Kartu `#18304D` bergaris tipis, ikon lingkaran emas, eyebrow mono "PORTAL AKTIF" + nama portal | **Pemilih jabatan**: eyebrow "JABATAN AKTIF", isi "PPK A-1 · DDKB", chip "Pejabat"/"Operator"; klik membuka daftar jabatan per lini. *SIMARIO memindahkan pemilih jabatan dari topbar (PRD FR-AUT-009) ke posisi ini agar sama dengan Aksara* |
| **Topbar krem** | Latar `#FEFCF6` bergaris bawah; breadcrumb ("Portal Kontributor › Pengetahuan Saya"); pencarian pil dengan `Ctrl K`; lonceng dengan badge Saka; tombol garis | Breadcrumb ("Papan Risiko › PPK A-1"), pencarian global, lonceng notifikasi, tombol garis kontekstual |
| **Judul halaman** | Newsreader besar + subjudul abu; tombol utama di kanan | Semua halaman |
| **Strip ringkasan** | Satu kartu dibagi kolom bergaris; angka Newsreader besar; label dengan titik warna status | Ringkasan Penilaian ("Dituntaskan · Belum dinilai · Tidak Sesuai · Berulang"), Beranda, Antrean Lini 3 |
| **Pil filter** | Pil penuh; aktif = Samudra terisi teks krem; lain = garis; hitungan mono di dalam pil | Filter penanda di Papan Risiko, filter status di antrean |
| **Pencarian & dropdown** | Field tinggi 48, radius besar, ikon kaca pembesar, latar surface | Semua filter |
| **Tabel** | Kartu surface radius 16; header eyebrow mono kapital di latar muted; baris bergaris `border-subtle`; judul tebal + subjudul abu; kolom orang dengan ikon; pil status bertitik; tanggal di kanan | Antrean Lini 3, daftar jabatan, pengguna, penugasan, jejak audit, papan risiko |
| **Empty state** | Kartu besar; ikon dalam lingkaran Tirta; judul Newsreader; kalimat ajakan; tombol utama | Semua empty state |
| **Tombol utama** | Khatulistiwa `#185088`, teks putih semi-tebal, radius 10, ikon "+" opsional | Aksi utama |

---

## 6. Komponen SIMARIO

Semua komponen di bawah mengikuti token di atas. Keadaan wajib untuk komponen interaktif: default, hover (kontras naik), fokus (cincin `ring-focus` 2 px), ditekan, nonaktif, memuat; untuk input juga error.

| Komponen | Spesifikasi singkat |
|---|---|
| **Button** | Primary (khatulistiwa → hover primary-700), Secondary (surface + border-default, teks text-strong), Ghost, Destructive (danger-600). Tinggi 40 (desktop) / 44 (ponsel), radius 10, label 14/600. Varian **Finalisasi-untuk-Operator**: nonaktif dengan keterangan "Dilakukan oleh [Nama Pejabat]" di bawahnya |
| **Input / Select / Textarea** | Tinggi 44, radius 10, border-default, latar surface; fokus: border primary-500 + cincin; error: border danger-500 + pesan danger-700 dengan ikon |
| **ScoreInput** | Field mono lebar 72 px, rata kanan, format "3,2"; di sampingnya **PredicateBadge** berubah langsung; keadaan terkunci memakai ikon gembok dan latar muted |
| **PredicateBadge** | Pil radius 6, teks 12/600 + titik, warna §2.4 |
| **LineChip** | "Lini 1/2/3", 11/600, warna §2.4 |
| **CapacityChip** | "Pejabat" (primary-50/primary-700) / "Operator" (pertiwi/accent-800) |
| **StatusPill** | Pil bertitik seperti Aksara (contoh "● Menunggu Kurasi") |
| **MarkerBadge** | Ikon garis 14 px + teks, warna §2.4 |
| **ComparisonCell** | Baris chip: L1 · Kepatuhan · PAI + ✓/✕; keadaan tersembunyi memakai pola "Tersembunyi" §2.4 |
| **Comment** | Avatar inisial 32, nama 14/600, LineChip, kapasitas "sebagai Operator", waktu caption; isi body; lampiran di bawah; badge "Langkah" (primary-50/primary-700, ikon centang ganda); ditarik = teks miring text-subtle |
| **Composer** | Kartu surface radius 16, textarea, bilah aksi bawah: lampirkan, "@", "Tandai sebagai Langkah", pemilih "Terkait TW", tombol "Kirim"; peringatan fase buta Lini 3 sebagai InlineAlert warning di atasnya |
| **AttachmentChip** | Gambar: thumbnail 64 radius 10; berkas: ikon + nama + ukuran mono; "Memindai…" dengan spinner; konfidensial memakai chip Samudra + gembok |
| **DataTable** | Pola tabel Aksara §5; di bawah 900 px menjadi kartu bertumpuk |
| **SummaryStrip** | Pola strip ringkasan Aksara §5 |
| **FilterPills** | Pola pil filter Aksara §5 |
| **Card** | Surface, radius 16, `shadow-card`, padding 24; tidak ada kartu di dalam kartu (pakai garis pembatas) |
| **BottomBar** | Lengket di bawah, surface + garis atas border-subtle + `shadow-md`; kiri: "Draf tersimpan" + progres mono; kanan: aksi |
| **SlideOver** | 420 px dari kanan, `shadow-lg`, judul display-sm |
| **Dialog** | Lebar 480, radius 16, `shadow-lg`, judul display-sm, tombol kanan bawah; destruktif memakai tombol danger |
| **InlineAlert** | Info (tirta / primary-700), warning (accent-50 / accent-700), error (danger-50 / danger-700), sukses (success-50 / success-700); selalu dengan ikon |
| **Toast** | Kanan atas, surface, `shadow-md`, garis kiri warna status, 4 detik |
| **NotificationPanel** | 380 px, `shadow-md`; item belum dibaca berlatar bg-surface-muted dengan titik primary |
| **EmptyState** | Pola empty state Aksara §5 |

Ikon: set garis 1,5 px (Lucide, seperti Aksara), ukuran 16 di teks, 20 di menu.

---

## 7. Aksesibilitas

- Kontras: semua pasangan teks/latar di §2.3 dan §2.4 ≥ 4,5:1; teks text-subtle hanya untuk placeholder dan metadata ≥ 12 px.
- Target sentuh ≥ 44 × 44 di ponsel.
- Fokus terlihat di semua elemen interaktif (`ring-focus` 2 px, offset 2 px).
- Warna tidak pernah satu-satunya penanda (teks/ikon/titik selalu ada).

## 8. Implementasi

Token ini sudah ada sebagai variabel CSS di Aksara (`--color-*`, `--primary-*`, `--accent-*`, `--neutral-*`, `--success-*`, `--danger-*`, `--warning-*`, `--bg-*`, `--border-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--font-*`). Developer SIMARIO sebaiknya **menyalin berkas token/tema Tailwind Aksara** sebagai titik awal, lalu menambahkan token khusus SIMARIO di §2.4.
