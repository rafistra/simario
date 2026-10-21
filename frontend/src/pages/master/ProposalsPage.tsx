import { BookMarked, Inbox, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterPills,
  InlineAlert,
  LoadingRegion,
  PageHeader,
  Pagination,
  Skeleton,
  StatusChip,
  Textarea,
  toast,
  type Column,
} from '@/components';
import { masterApi, proposalApi, type ProposalRow } from '@/data/repository';
import { RISK_TYPE_LABEL, type RiskProposal } from '@/domain/types';
import { useQuery } from '@/lib/useQuery';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/state/useAuth';
import { TemplateEditor, type TemplateEditorTarget } from './TemplateEditor';
import './Master.css';

const PAGE = 25;

/** /master/usulan — FR-MST-005, FR-REG-004. */
export default function ProposalsPage() {
  usePageMeta(['Master Data', 'Usulan']);
  const auth = useAuth();
  const [revision, setRevision] = useState(0);
  const query = useQuery(() => proposalApi.list(), [], revision);
  const [status, setStatus] = useState<RiskProposal['status']>('pending');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<ProposalRow | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState<TemplateEditorTarget | null>(null);

  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = all
    .filter((p) => p.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const columns: Column<ProposalRow>[] = [
    {
      key: 'usulan',
      header: 'Usulan',
      primary: true,
      render: (p) => {
        return (
          <span className="cell-title">
            <strong>{p.description}</strong>
            <span className="t-caption">
              {p.positionTypeName} · {p.stageName} · {RISK_TYPE_LABEL[p.riskType]}
              {p.status === 'rejected' && p.rejectionReason
                ? ` · Ditolak: ${p.rejectionReason}`
                : ''}
            </span>
          </span>
        );
      },
    },
    {
      key: 'pengusul',
      header: 'Pengusul · Jabatan',
      width: 220,
      render: (p) => {
        return `${p.proposerName} · ${p.positionName}`;
      },
    },
    {
      key: 'aksi',
      header: status === 'pending' ? 'Aksi' : 'Status',
      width: 330,
      render: (p) => {
        if (p.status === 'accepted')
          return <StatusChip status="terbit" label="Dijadikan template" />;
        if (p.status === 'rejected') return <StatusChip status="diarsipkan" label="Ditolak" />;
        return (
          <span className="row-actions">
            <Button
              variant="secondary"
              icon={BookMarked}
              onClick={() =>
                setAccepting({
                  id: null,
                  positionTypeId: p.positionTypeId,
                  stageId: p.stageId,
                  riskType: p.riskType,
                  description: p.description,
                  mitigations: p.mitigations,
                  fromProposalId: p.id,
                })
              }
            >
              Jadikan Template
            </Button>
            <Button
              variant="ghost"
              icon={X}
              onClick={() => {
                setRejecting(p);
                setReason('');
                setReasonError(null);
              }}
            >
              Tolak
            </Button>
          </span>
        );
      },
    },
    {
      key: 'tanggal',
      header: 'Tanggal',
      width: 110,
      align: 'right',
      render: (p) => <span className="t-mono">{formatDate(p.createdAt)}</span>,
    },
  ];

  const reject = async () => {
    if (!reason.trim()) {
      setReasonError('Alasan penolakan wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      await masterApi.rejectProposal(rejecting!.id, reason);
      toast.success('Usulan ditolak', 'Pengusul diberi tahu beserta alasannya.');
      setRejecting(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setReasonError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rejectingInfo = rejecting;

  if (query.error && !query.data)
    return (
      <InlineAlert variant="error" title="Usulan gagal dimuat" onRetry={query.retry}>
        {query.error.message}
      </InlineAlert>
    );
  if (!query.data)
    return (
      <LoadingRegion label="Memuat usulan…">
        <Skeleton height={320} radius="lg" />
      </LoadingRegion>
    );

  return (
    <div className="master-page">
      <PageHeader
        eyebrow={`Master data · TA ${auth.currentFiscalYear}`}
        title="Usulan Risiko"
        subtitle="Risiko sendiri dari register yang diterbitkan. Jadikan template bila berguna bagi jabatan lain; menerima usulan tidak mengubah register yang sudah ada."
      />
      <FilterPills
        label="Status usulan"
        items={[
          {
            value: 'pending',
            label: 'Menunggu',
            count: all.filter((p) => p.status === 'pending').length,
          },
          {
            value: 'accepted',
            label: 'Dijadikan template',
            count: all.filter((p) => p.status === 'accepted').length,
          },
          {
            value: 'rejected',
            label: 'Ditolak',
            count: all.filter((p) => p.status === 'rejected').length,
          },
        ]}
        selected={[status]}
        onToggle={(v) => {
          setStatus(v as RiskProposal['status']);
          setPage(1);
        }}
      />
      <DataTable
        caption="Usulan risiko"
        columns={columns}
        rows={rows.slice((page - 1) * PAGE, page * PAGE)}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={Inbox}
            title={
              status === 'pending' ? 'Tidak ada usulan yang menunggu' : 'Belum ada usulan di sini'
            }
            message="Usulan muncul ketika register yang memuat risiko sendiri diterbitkan."
          />
        }
        footer={
          rows.length > PAGE ? (
            <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
          ) : undefined
        }
      />

      <ConfirmDialog
        open={rejecting !== null}
        destructive
        title="Tolak usulan ini?"
        confirmLabel="Tolak Usulan"
        confirming={busy}
        onCancel={() => setRejecting(null)}
        onConfirm={reject}
      >
        {rejectingInfo && (
          <div className="dialog-stack">
            <p className="t-eyebrow">
              {rejectingInfo.positionTypeName} · {rejectingInfo.stageName} ·{' '}
              {RISK_TYPE_LABEL[rejectingInfo.riskType]}
            </p>
            <p className="t-body-strong">{rejecting!.description}</p>
            <Textarea
              label="Alasan penolakan"
              required
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setReasonError(null);
              }}
              error={reasonError ?? undefined}
            />
            <p className="t-caption">
              Pengusul diberi tahu beserta alasannya. Risiko di register{' '}
              {rejectingInfo.positionName} tetap ada sebagai risiko sendiri.
            </p>
          </div>
        )}
      </ConfirmDialog>
      <TemplateEditor
        target={accepting}
        onClose={() => {
          setAccepting(null);
          setRevision((n) => n + 1);
        }}
      />
    </div>
  );
}
