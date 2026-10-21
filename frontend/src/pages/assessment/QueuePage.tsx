import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DataTable,
  FilterPills,
  InlineAlert,
  LoadingRegion,
  MarkerBadge,
  PageHeader,
  Select,
  Skeleton,
  StatusChip,
  SummaryStrip,
  type Column,
  type StatusKind,
} from '@/components';
import type { QueueRow, QueueStatus } from '@/data/api/assessment';
import { assessmentApi, useAssessmentRevision } from '@/data/repository';
import { QUARTER_ROMAN } from '@/domain/calendar';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import './Assessment.css';

const STATUS: Record<QueueStatus, { kind: StatusKind; label: string }> = {
  belum: { kind: 'menunggu', label: 'Belum dimulai' },
  draf: { kind: 'draf', label: 'Draf' },
  siap: { kind: 'siap', label: 'Siap' },
  dituntaskan: { kind: 'dituntaskan', label: 'Dituntaskan' },
  belum_terbit: { kind: 'diarsipkan', label: 'Register belum terbit' },
};

type Attention = 'tidak-sesuai' | 'berulang' | 'tidak-dinilai';

/** /penilaian — Lini 3 queue (FR-NIL-010). */
export default function QueuePage() {
  usePageMeta(['Antrean Penilaian']);
  const navigate = useNavigate();
  const [quarterId, setQuarterId] = useState<string | null>(null);
  const [unit, setUnit] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState<QueueStatus | ''>('');
  const [attention, setAttention] = useState<Attention[]>([]);
  const revision = useAssessmentRevision((s) => s.revision);
  const q = useQuery(() => assessmentApi.queue(quarterId), [quarterId, revision]);

  if (q.loading && !q.data)
    return (
      <LoadingRegion label="Memuat antrean…">
        <div className="queue">
          <Skeleton height={72} />
          <Skeleton height={320} radius="lg" />
        </div>
      </LoadingRegion>
    );
  if (q.error && !q.data)
    return (
      <InlineAlert variant="error" title="Antrean gagal dimuat" onRetry={q.retry}>
        {q.error.message}
      </InlineAlert>
    );
  const view = q.data!;
  const quarter = view.quarter;
  const label = `TW ${QUARTER_ROMAN[quarter.number - 1]} ${quarter.fiscalYear}`;
  const rows = view.rows.filter(
    (r) =>
      (!unit || r.unitId === unit) &&
      (!type || r.typeId === type) &&
      (!status || r.status === status) &&
      attention.every((a) =>
        a === 'tidak-sesuai'
          ? r.tidakSesuai > 0
          : a === 'berulang'
            ? r.recurring > 0
            : r.notAssessedL1 > 0,
      ),
  );
  const count = (s: QueueStatus) => view.rows.filter((r) => r.status === s).length;
  const units = [...new Map(view.rows.map((r) => [r.unitId, r.unitName])).entries()];
  const types = [...new Map(view.rows.map((r) => [r.typeId, r.typeName])).entries()];
  const href = (r: QueueRow) =>
    `/jabatan/${r.positionId}/penilaian/${quarter.fiscalYear}/${quarter.number}`;

  const columns: Column<QueueRow>[] = [
    {
      key: 'pos',
      header: 'Jabatan',
      primary: true,
      render: (r) => (
        <span className="queue__pos">
          <span className="queue__name">{r.positionName}</span>
          <span className="queue__type">{r.typeName}</span>
        </span>
      ),
    },
    { key: 'unit', header: 'Unit kerja', render: (r) => r.unitName },
    {
      key: 'q',
      header: 'Triwulan',
      width: 110,
      render: () => <span className="t-mono">{label}</span>,
      hideOnMobile: true,
    },
    {
      key: 'count',
      header: 'Dinilai',
      width: 100,
      align: 'right',
      render: (r) =>
        r.status === 'belum_terbit' ? (
          '—'
        ) : (
          <span className="t-mono">{`${r.assessed}/${r.total} dinilai`}</span>
        ),
    },
    {
      key: 'status',
      header: 'Status direktorat',
      width: 210,
      render: (r) => (
        <span className="queue__status">
          <StatusChip status={STATUS[r.status].kind} label={STATUS[r.status].label} />
          {r.overdue && r.status !== 'belum_terbit' && <MarkerBadge kind="terlambat" />}
        </span>
      ),
    },
    {
      key: 'l1',
      header: 'Lini 1',
      width: 130,
      render: (r) =>
        r.status === 'belum_terbit' ? (
          '—'
        ) : r.lini1Done ? (
          <StatusChip status="dituntaskan" />
        ) : (
          <StatusChip status="menunggu" label="Belum" />
        ),
    },
    {
      key: 'att',
      header: 'Perhatian',
      width: 190,
      render: (r) => (
        <span className="queue__att">
          {r.tidakSesuai > 0 && (
            <MarkerBadge kind="tidak-sesuai" label={`${r.tidakSesuai} Tidak Sesuai`} />
          )}
          {r.recurring > 0 && <MarkerBadge kind="berulang" label={`${r.recurring} Berulang`} />}
          {r.notAssessedL1 > 0 && (
            <MarkerBadge kind="tidak-dinilai" label={`${r.notAssessedL1} Tidak dinilai Lini 1`} />
          )}
          {r.tidakSesuai + r.recurring + r.notAssessedL1 === 0 && '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="queue">
      <PageHeader
        eyebrow={view.directorate ? `Lini 3 · ${view.directorate.name}` : 'Lini 3'}
        title="Antrean Penilaian"
        subtitle={`${label} · tenggat Lini 3 ${formatDate(quarter.lini3Deadline)}`}
      />
      <SummaryStrip
        items={[
          { figure: count('belum'), label: 'Belum dimulai', dot: 'var(--status-menunggu-dot)' },
          { figure: count('draf'), label: 'Draf', dot: 'var(--status-draf-dot)' },
          { figure: count('siap'), label: 'Siap', dot: 'var(--status-siap-dot)' },
          { figure: count('dituntaskan'), label: 'Dituntaskan', dot: 'var(--status-terbit-dot)' },
          { figure: count('belum_terbit'), label: 'Register belum terbit' },
        ]}
      />
      <div className="queue__filters">
        <Select
          label="Triwulan"
          value={quarter.id}
          onChange={(e) => setQuarterId(e.target.value)}
          options={view.quarters.map((x) => ({
            value: x.id,
            label: `TW ${QUARTER_ROMAN[x.number - 1]} ${x.fiscalYear}`,
          }))}
        />
        <Select
          label="Unit kerja"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          options={[
            { value: '', label: 'Semua unit' },
            ...units.map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          label="Jenis jabatan"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: '', label: 'Semua jenis' },
            ...types.map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as QueueStatus | '')}
          options={[
            { value: '', label: 'Semua status' },
            ...(Object.keys(STATUS) as QueueStatus[]).map((s) => ({
              value: s,
              label: STATUS[s].label,
            })),
          ]}
        />
      </div>
      <FilterPills
        label="Perhatian"
        items={[
          {
            value: 'tidak-sesuai',
            label: 'Tidak Sesuai',
            count: view.rows.filter((r) => r.tidakSesuai > 0).length,
          },
          {
            value: 'berulang',
            label: 'Berulang',
            count: view.rows.filter((r) => r.recurring > 0).length,
          },
          {
            value: 'tidak-dinilai',
            label: 'Tidak dinilai Lini 1',
            count: view.rows.filter((r) => r.notAssessedL1 > 0).length,
          },
        ]}
        selected={attention}
        onToggle={(v) =>
          setAttention((a) =>
            a.includes(v as Attention) ? a.filter((x) => x !== v) : [...a, v as Attention],
          )
        }
      />
      <DataTable
        caption={`Antrean penilaian ${label}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.positionId}
        onRowClick={(r) => navigate(href(r))}
        rowClassName={(r) => (r.status === 'belum_terbit' ? 'is-muted' : undefined)}
        empty="Tidak ada jabatan yang cocok dengan filter."
      />
    </div>
  );
}
