import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DataTable,
  InlineAlert,
  LoadingRegion,
  MarkerBadge,
  PageHeader,
  Pagination,
  SearchField,
  Select,
  Skeleton,
  StatusChip,
  type Column,
  type StatusKind,
} from '@/components';
import type { PositionListRow } from '@/test/fake/api/home';
import { homeApi } from '@/data/repository';
import { usePageMeta } from '@/layout/pageMeta';
import { formatRelative } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { useNow } from '@/state/clock';
import './Home.css';

const REG: Record<PositionListRow['register'], { kind: StatusKind; label: string }> = {
  belum: { kind: 'menunggu', label: 'Belum disusun' },
  draf: { kind: 'draf', label: 'Draf' },
  siap: { kind: 'siap', label: 'Siap Diterbitkan' },
  terbit: { kind: 'terbit', label: 'Terbit' },
  diarsipkan: { kind: 'diarsipkan', label: 'Diarsipkan' },
};

const PAGE = 25;

/** `/jabatan` (directory) and `/pantauan` (Lini 2 coordinated positions) — FR-BRD-011. */
export default function PositionListPage({ variant }: { variant: 'direktori' | 'pantauan' }) {
  const title = variant === 'direktori' ? 'Daftar Jabatan' : 'Jabatan Dipantau';
  usePageMeta([title]);
  const navigate = useNavigate();
  const at = useNow(60_000);
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery(() => homeApi.positions(), [variant]);

  if (q.loading && !q.data)
    return (
      <LoadingRegion label="Memuat jabatan…">
        <Skeleton height={320} radius="lg" />
      </LoadingRegion>
    );
  if (q.error && !q.data)
    return (
      <InlineAlert variant="error" title="Daftar jabatan gagal dimuat" onRetry={q.retry}>
        {q.error.message}
      </InlineAlert>
    );
  const all = q.data!;
  const needle = search.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle) || r.unit.toLowerCase().includes(needle)) &&
      (!unit || r.unitId === unit) &&
      (!type || r.typeId === type),
  );
  const units = [...new Map(all.map((r) => [r.unitId, r.unit])).entries()];
  const types = [...new Map(all.map((r) => [r.typeId, r.type])).entries()];
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  const columns: Column<PositionListRow>[] = [
    {
      key: 'name',
      header: 'Jabatan',
      primary: true,
      render: (r) => <span className="plist__name">{r.name}</span>,
    },
    { key: 'unit', header: 'Unit kerja', render: (r) => r.unit },
    { key: 'type', header: 'Jenis', width: 150, render: (r) => r.type, hideOnMobile: true },
    {
      key: 'reg',
      header: 'Register TA berjalan',
      width: 180,
      render: (r) => <StatusChip status={REG[r.register].kind} label={REG[r.register].label} />,
    },
    {
      key: 'quiet',
      header: 'Belum ada langkah',
      width: 170,
      render: (r) =>
        r.quiet ? (
          <MarkerBadge kind="belum-langkah" label={`${r.quiet} risiko`} />
        ) : (
          <span className="home__ok">Semua ada langkah</span>
        ),
    },
    {
      key: 'act',
      header: 'Aktivitas',
      width: 120,
      align: 'right',
      render: (r) => (
        <span className="t-mono home__tsub">
          {r.lastActivity ? formatRelative(r.lastActivity, at) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="home">
      <PageHeader
        eyebrow={variant === 'pantauan' ? 'Lini 2 · Pemantauan' : 'Cakupan Anda'}
        title={title}
        subtitle={`${all.length} jabatan Lini 1${variant === 'pantauan' ? ' yang ditugaskan kepada Anda pada tahun anggaran ini' : ''}`}
      />
      <div className="plist__filters">
        <SearchField
          label="Cari jabatan atau unit"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari jabatan atau unit kerja"
        />
        <Select
          label="Unit kerja"
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: 'Semua unit' },
            ...units.map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          label="Jenis jabatan"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: 'Semua jenis' },
            ...types.map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <DataTable
        caption={title}
        columns={columns}
        rows={shown}
        rowKey={(r) => r.positionId}
        onRowClick={(r) => navigate(r.href)}
        empty={
          variant === 'pantauan'
            ? 'Belum ada jabatan yang ditugaskan kepada Anda.'
            : 'Tidak ada jabatan yang cocok.'
        }
      />
      {rows.length > PAGE && (
        <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
      )}
    </div>
  );
}
