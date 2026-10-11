import {
  ClipboardCheck,
  FileText,
  Flag,
  Moon,
  Plus,
  Save,
  Send,
  ShieldX,
  Sun,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  AttachmentFileChip,
  AttachmentImageChip,
  Avatar,
  Button,
  CapacityChip,
  Card,
  Checkbox,
  ConfidentialAttachmentsChip,
  ConfirmDialog,
  DataTable,
  DatePickerField,
  EmptyState,
  FileDrop,
  FilterPills,
  FinalizeOperatorButton,
  InlineAlert,
  LineChip,
  MarkerBadge,
  PageHeader,
  Pagination,
  PredicateBadge,
  SearchField,
  Select,
  Skeleton,
  SlideOver,
  StatusChip,
  SummaryStrip,
  TableCardMobile,
  Textarea,
  TextInput,
  Toggle,
  toast,
  type Column,
  type MarkerKind,
  type StatusKind,
} from '@/components';
import { applyTheme, getTheme, type Theme } from '@/lib/theme';
import './ComponentGallery.css';

function Section({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <section className="gallery__section" aria-labelledby={`g-${source}`}>
      <header className="gallery__section-head">
        <h2 id={`g-${source}`} className="t-display-sm">
          {title}
        </h2>
        <span className="t-eyebrow">.pen {source}</span>
      </header>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery__row">
      <span className="t-eyebrow gallery__row-label">{label}</span>
      <div className="gallery__row-items">{children}</div>
    </div>
  );
}

interface DemoRisk {
  id: string;
  wording: string;
  meta: string;
  stage: string;
  markers: MarkerKind[];
  updated: string;
}

const RISKS: DemoRisk[] = [
  {
    id: 'r1',
    wording: 'Terlambatnya proses pembayaran termin kepada Penyedia.',
    meta: 'Kinerja Anggaran · 3 mitigasi · L1 4 · L2 2 · L3 1',
    stage: 'Pelaksanaan/Pengendalian Kontrak',
    markers: ['belum-langkah'],
    updated: '7 Mar 2027',
  },
  {
    id: 'r2',
    wording: 'Pemecahan kontrak.',
    meta: 'Kecurangan · 2 mitigasi · L1 4 · L2 3 · L3 5',
    stage: 'Perencanaan Pengadaan',
    markers: ['berulang', 'tidak-sesuai'],
    updated: 'kemarin',
  },
  {
    id: 'r3',
    wording: 'Penyerapan anggaran tidak mencapai target per Triwulan.',
    meta: 'Kinerja Anggaran · 2 mitigasi · L1 6 · L2 2 · L3 3',
    stage: 'Pengadaan di Bawah Rp50 Juta',
    markers: ['tanpa-mitigasi'],
    updated: '3 Apr 2027',
  },
];

const COLUMNS: Column<DemoRisk>[] = [
  {
    key: 'risk',
    header: 'Risiko',
    primary: true,
    render: (r) => (
      <span className="gallery__risk">
        <strong>{r.wording}</strong>
        <span className="t-caption">{r.meta}</span>
      </span>
    ),
  },
  { key: 'stage', header: 'Tahap', width: 190, render: (r) => r.stage },
  {
    key: 'markers',
    header: 'Penanda',
    width: 230,
    render: (r) => (
      <span className="gallery__inline">
        {r.markers.map((m) => (
          <MarkerBadge key={m} kind={m} />
        ))}
      </span>
    ),
  },
  {
    key: 'updated',
    header: 'Diperbarui',
    width: 110,
    align: 'right',
    render: (r) => <span className="t-mono">{r.updated}</span>,
  },
];

const STATUSES: StatusKind[] = [
  'draf',
  'siap',
  'terbit',
  'diarsipkan',
  'dituntaskan',
  'menunggu',
  'terbuka-sebagian',
  'terbuka',
];

const MARKERS: { kind: MarkerKind; label?: string }[] = [
  { kind: 'belum-langkah' },
  { kind: 'tidak-sesuai' },
  { kind: 'sesuai' },
  { kind: 'berulang' },
  { kind: 'tanpa-mitigasi' },
  { kind: 'tanpa-bukti' },
  { kind: 'nonaktif', label: 'Nonaktif sejak TW II' },
  { kind: 'terlambat' },
  { kind: 'sangat-terlambat' },
  { kind: 'konfidensial' },
  { kind: 'belum-relevan' },
  { kind: 'tidak-dinilai' },
  { kind: 'langkah' },
];

/** Dev-only showcase of every library component (Tahap 1 checkpoint), light and dark. */
export default function ComponentGallery() {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [pills, setPills] = useState(['semua']);
  const [page, setPage] = useState(1);
  const [toggle, setToggle] = useState(true);
  const [dialog, setDialog] = useState<'none' | 'destructive' | 'primary'>('none');
  const [slide, setSlide] = useState(false);
  const [files, setFiles] = useState<string[]>([]);

  const switchTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <main className="gallery">
      <PageHeader
        eyebrow="Tahap 1 · Pustaka komponen"
        title="Komponen SIMARIO"
        subtitle="Semua komponen library dari Simario.pen dalam setiap keadaan. Gunakan Tab untuk memeriksa cincin fokus; perkecil jendela di bawah 900 px untuk tampilan ponsel."
        actions={
          <Button variant="secondary" icon={theme === 'light' ? Moon : Sun} onClick={switchTheme}>
            {theme === 'light' ? 'Mode gelap' : 'Mode terang'}
          </Button>
        }
      />

      <Section title="Tombol" source="UV5LT · IPBgH · aYYYS · JgRKB · IfFmi">
        {(['primary', 'secondary', 'ghost', 'destructive'] as const).map((v) => (
          <Row key={v} label={v}>
            <Button variant={v} icon={v === 'destructive' ? X : Save}>
              {v === 'destructive' ? 'Nonaktifkan' : 'Simpan Draf'}
            </Button>
            <Button variant={v}>Tanpa ikon</Button>
            <Button variant={v} disabled icon={Save}>
              Nonaktif
            </Button>
            <Button variant={v} loading>
              Simpan
            </Button>
          </Row>
        ))}
        <Row label="Finalisasi Operator">
          <FinalizeOperatorButton label="Terbitkan Register" officialName="Andi Wirawan" />
        </Row>
      </Section>

      <Section title="Formulir" source="WcOpi · S4x4n · k6oHeS · r1ZqpH · Depou">
        <div className="gallery__grid">
          <TextInput
            label="Nomor surat delegasi"
            placeholder="Contoh: ND-123/DKB/2027"
            helper="Sesuai surat yang diterbitkan Pejabat."
          />
          <TextInput label="Nomor surat delegasi" defaultValue="ND-045/DKB/2027" />
          <TextInput
            label="Nomor surat delegasi"
            required
            error="Nomor surat wajib diisi."
            placeholder="Contoh: ND-123/DKB/2027"
          />
          <TextInput label="Nomor surat delegasi" disabled defaultValue="ND-045/DKB/2027" />
          <Select
            label="Tahap"
            placeholder="Pilih tahap"
            defaultValue=""
            options={[
              { value: 't1', label: 'Perencanaan Pengadaan' },
              { value: 't4', label: 'Pelaksanaan/Pengendalian Kontrak' },
            ]}
          />
          <Select
            label="Tahap"
            error="Pilih salah satu tahap."
            placeholder="Pilih tahap"
            defaultValue=""
            options={[{ value: 't1', label: 'Perencanaan Pengadaan' }]}
          />
          <DatePickerField label="Tanggal surat" defaultValue="2027-02-03" />
          <Textarea
            label="Alasan belum relevan"
            required
            placeholder="Tuliskan alasan risiko belum relevan pada triwulan ini…"
            error="Alasan wajib diisi agar dapat dituntaskan."
          />
        </div>
        <SearchField label="Cari risiko" placeholder="Cari uraian risiko atau mitigasi…" />
        <Row label="Pilihan">
          <Checkbox label="Tandai sebagai Langkah" defaultChecked />
          <Checkbox label="Tidak ada risiko pada jenis ini" />
          <Checkbox label="Nonaktif" disabled />
          <Toggle label="Konfidensial" checked={toggle} onChange={setToggle} />
          <Toggle label="Nonaktif" checked={false} onChange={() => {}} disabled />
        </Row>
        <div className="gallery__narrow">
          <FileDrop onFiles={(f) => setFiles(f.map((x) => x.name))} />
          {files.length > 0 && <p className="t-caption">Dipilih: {files.join(', ')}</p>}
        </div>
      </Section>

      <Section title="Chip & lencana" source="KoPKc … VFP8a · FcH0W">
        <Row label="Lini & kapasitas">
          <LineChip line={1} />
          <LineChip line={2} />
          <LineChip line={3} />
          <CapacityChip capacity="pejabat" />
          <CapacityChip capacity="operator" />
          <Avatar name="Rafi Ananda" />
          <Avatar name="Hendra Gunawan" />
        </Row>
        <Row label="Predikat">
          <PredicateBadge predicate="terkendali" />
          <PredicateBadge predicate="cukup" />
          <PredicateBadge predicate="kurang" />
        </Row>
        <Row label="Status">
          {STATUSES.map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </Row>
        <Row label="Penanda">
          {MARKERS.map((m) => (
            <MarkerBadge key={m.kind} kind={m.kind} label={m.label} />
          ))}
        </Row>
        <Row label="Lampiran">
          <AttachmentFileChip name="SP2D_Termin1_PPK-A1.pdf" meta="PDF · 1,2 MB" href="#" />
          <AttachmentFileChip name="Notulen_Rapat_RPD_TW1.pdf" meta="PDF · 640 KB" scanning />
          <AttachmentFileChip name="Kertas_Kerja_Audit.xlsx" meta="XLSX · 88 KB" confidential />
          <AttachmentImageChip name="foto_bast.jpg" />
          <ConfidentialAttachmentsChip count={2} />
        </Row>
      </Section>

      <Section title="Umpan balik" source="Iaokf · wxAse · Q7oSz · uYwKh · NWudo · d0bBE · uwOgk">
        <InlineAlert variant="info" title="Penilaian TW I dibuka mulai 1 Mar 2027">
          Sebelum tanggal tersebut halaman penilaian hanya dapat dibaca.
        </InlineAlert>
        <InlineAlert variant="warning" title="Perbandingan triwulan ini belum dibuka.">
          Hindari menyebutkan skor atau predikat penilaian Anda di utas ini.
        </InlineAlert>
        <InlineAlert
          variant="error"
          title="Data papan risiko gagal dimuat"
          onRetry={() => toast.success('Memuat ulang', 'Permintaan dikirim ulang.')}
        >
          Koneksi ke server terputus. Periksa jaringan Anda, lalu coba lagi.
        </InlineAlert>
        <InlineAlert variant="success" title="Register TA 2027 diterbitkan">
          12 risiko kini tampil di Papan Risiko dan Lini 2 telah diberi tahu.
        </InlineAlert>
        <Row label="Toast">
          <Button
            variant="secondary"
            icon={ClipboardCheck}
            onClick={() =>
              toast.success('Penilaian dituntaskan', '8 risiko dituntaskan untuk TW I.')
            }
          >
            Toast sukses
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.error(
                'Komentar gagal dikirim',
                'Teks Anda tetap tersimpan sebagai draf. Coba kirim lagi.',
              )
            }
          >
            Toast galat
          </Button>
        </Row>
        <div className="gallery__grid">
          <EmptyState
            title="Belum ada risiko di papan"
            message="Papan Risiko terisi setelah register TA 2027 diterbitkan. Mulai susun register dari template tahap PPK."
            action={<Button icon={Plus}>Susun Register</Button>}
          />
          <EmptyState
            icon={ShieldX}
            title="Anda tidak memiliki akses ke halaman ini"
            message="Halaman ini memerlukan izin yang tidak dimiliki jabatan aktif Anda."
          />
        </div>
        <Card eyebrow="Memuat" title="Skeleton">
          <Skeleton width={120} height={10} />
          <Skeleton width="60%" height={20} radius="md" />
          <Skeleton height={14} />
          <Skeleton width="40%" height={14} />
        </Card>
      </Section>

      <Section title="Wadah" source="cKHP4 · v3DvkA · t8qGAG · o0MmL1 · t2Z0sk · EDYuQ">
        <div className="gallery__grid">
          <Card
            eyebrow="Kewajiban penilaian · Lini 1"
            title="Penilaian TW IV TA 2026"
            aside={<MarkerBadge kind="sangat-terlambat" />}
          >
            <p>Tenggat 25 Des 2026 · lewat 17 hari. 10 dari 12 risiko sudah dituntaskan.</p>
            <div>
              <Button icon={ClipboardCheck}>Buka Penilaian</Button>
            </div>
          </Card>
          <Card
            eyebrow="Register tahunan"
            title="Register TA 2027 belum diterbitkan"
            aside={<StatusChip status="draf" />}
          >
            <p>Register masih kosong. Salin risiko dan mitigasi TA 2026 sebagai titik awal.</p>
          </Card>
        </div>
        <SummaryStrip
          items={[
            { figure: 8, label: 'Dituntaskan', dot: 'var(--status-terbit-dot)' },
            { figure: 4, label: 'Belum dinilai', dot: 'var(--status-draf-dot)' },
            { figure: 2, label: 'Tidak Sesuai', dot: 'var(--danger-500)' },
            { figure: 1, label: 'Berulang', dot: 'var(--danger-700)' },
          ]}
        />
        <FilterPills
          label="Filter penanda"
          items={[
            { value: 'semua', label: 'Semua', count: 12 },
            { value: 'tidak-sesuai', label: 'Tidak Sesuai', count: 2 },
            { value: 'berulang', label: 'Berulang', count: 1 },
            { value: 'belum-langkah', label: 'Belum ada langkah', count: 5 },
          ]}
          selected={pills}
          onToggle={(v) => setPills([v])}
        />
        <DataTable
          caption="Contoh tabel risiko"
          columns={COLUMNS}
          rows={RISKS}
          rowKey={(r) => r.id}
          onRowClick={(r) => toast.success('Baris dipilih', r.wording)}
          rowClassName={(r) => (r.markers.includes('berulang') ? 'is-recurring' : undefined)}
          footer={<Pagination page={page} pageSize={25} total={48} onChange={setPage} />}
        />
        <div className="gallery__narrow">
          <TableCardMobile
            title="Keterlambatan proses pembayaran termin kepada Penyedia"
            pairs={[
              { label: 'Tahap', value: 'Pembayaran' },
              { label: 'Jenis', value: 'Kinerja Anggaran' },
              { label: 'Diperbarui', value: '5 Mar 2027', mono: true },
            ]}
            markers={<MarkerBadge kind="tidak-sesuai" />}
            onClick={() => {}}
          />
        </div>
      </Section>

      <Section title="Overlay" source="xr6zc · rm4EY">
        <Row label="Dialog & slide-over">
          <Button variant="destructive" icon={X} onClick={() => setDialog('destructive')}>
            Dialog destruktif
          </Button>
          <Button icon={Flag} onClick={() => setDialog('primary')}>
            Dialog utama
          </Button>
          <Button variant="secondary" icon={FileText} onClick={() => setSlide(true)}>
            Slide-over
          </Button>
        </Row>
      </Section>

      <ConfirmDialog
        open={dialog === 'destructive'}
        destructive
        title="Nonaktifkan risiko ini?"
        confirmLabel="Nonaktifkan Risiko"
        onCancel={() => setDialog('none')}
        onConfirm={() => {
          setDialog('none');
          toast.success('Risiko dinonaktifkan', 'Nonaktif sejak TW II.');
        }}
      >
        “Pemecahan kontrak” tidak lagi tampil di Papan Risiko mulai TW II. Riwayat dan utasnya tetap
        tersimpan.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'primary'}
        title="Terbitkan register?"
        confirmLabel="Terbitkan Register"
        onCancel={() => setDialog('none')}
        onConfirm={() => setDialog('none')}
      >
        Register akan diterbitkan. Risiko dan mitigasi yang diterbitkan tidak dapat diubah
        uraiannya.
      </ConfirmDialog>
      <SlideOver
        open={slide}
        eyebrow="Penjelasan · TW I"
        title="Tidak Sesuai dengan Direktorat Pengawasan dan Audit Internal"
        onClose={() => setSlide(false)}
        footer={
          <>
            <Button variant="secondary">Simpan Draf</Button>
            <Button icon={Send}>Kirim Penjelasan</Button>
          </>
        }
      >
        <p>Penyerapan anggaran tidak mencapai target per Triwulan.</p>
        <Textarea label="Alasan atau kendala" required />
        <Textarea label="Rencana tindak lanjut" required />
      </SlideOver>
    </main>
  );
}
