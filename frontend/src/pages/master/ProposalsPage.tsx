import { BookMarked, Inbox, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterPills,
  PageHeader,
  Pagination,
  StatusChip,
  Textarea,
  toast,
  type Column,
} from '@/components';
import { masterApi } from '@/data/repository';
import { useDb } from '@/data/local/store';
import { RISK_TYPE_LABEL, type RiskProposal } from '@/domain/types';
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
  const db = useDb((s) => s.db);
  const [status, setStatus] = useState<RiskProposal['status']>('pending');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<RiskProposal | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState<TemplateEditorTarget | null>(null);

  const info = useMemo(
    () => (p: RiskProposal) => {
      const risk = db.risks.find((r) => r.id === p.sourceRegisterRiskId)!;
      const register = db.registers.find((r) => r.id === risk.registerId)!;
      const position = db.positions.find((x) => x.id === register.positionId)!;
      const type = db.positionTypes.find((t) => t.id === position.positionTypeId)!;
      const stage = db.stages.find((s) => s.id === risk.stageId)!;
      const proposer = db.users.find((u) => u.id === p.proposerUserId)!;
      const mitigations = db.mitigations
        .filter((m) => m.registerRiskId === risk.id)
        .sort((a, b) => a.order - b.order)
        .map((m) => m.descriptionSnapshot);
      return { risk, position, type, stage, proposer, mitigations };
    },
    [db],
  );

  const all = db.proposals;
  const rows = all
    .filter((p) => p.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const columns: Column<RiskProposal>[] = [
    {
      key: 'usulan',
      header: 'Usulan',
      primary: true,
      render: (p) => {
        const i = info(p);
        return (
          <span className="cell-title">
            <strong>{p.description}</strong>
            <span className="t-caption">
              {i.type.name} · {i.stage.name} · {RISK_TYPE_LABEL[i.risk.riskType]}
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
        const i = info(p);
        return `${i.proposer.fullName} · ${i.position.name}`;
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
        const i = info(p);
        return (
          <span className="row-actions">
            <Button
              variant="secondary"
              icon={BookMarked}
              onClick={() =>
                setAccepting({
                  id: null,
                  positionTypeId: i.type.id,
                  stageId: i.stage.id,
                  riskType: i.risk.riskType,
                  description: p.description,
                  mitigations: i.mitigations,
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
    } catch (e) {
      setReasonError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rejectingInfo = rejecting ? info(rejecting) : null;

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
              {rejectingInfo.type.name} · {rejectingInfo.stage.name} ·{' '}
              {RISK_TYPE_LABEL[rejectingInfo.risk.riskType]}
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
              {rejectingInfo.position.name} tetap ada sebagai risiko sendiri.
            </p>
          </div>
        )}
      </ConfirmDialog>
      <TemplateEditor target={accepting} onClose={() => setAccepting(null)} />
    </div>
  );
}
