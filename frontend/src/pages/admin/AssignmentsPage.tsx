import { Plus } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DataTable,
  InlineAlert,
  PageHeader,
  Select,
  SlideOver,
  TextInput,
  toast,
  type Column,
} from '@/components';
import { adminApi } from '@/data/repository';
import { useDb } from '@/data/local/store';
import { postingQuarter } from '@/domain/rules/board';
import type { MonitoringAssignment, MonitoringSupport } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { useAuth } from '@/state/useAuth';
import { RowMenu } from './RowMenu';
import './Admin.css';

const DOMAIN: Record<MonitoringSupport['domain'], string> = {
  budget_performance: 'Kinerja Anggaran',
  procurement: 'PBJ',
};

/** /pengaturan/penugasan-pemantauan — FR-ADM-006, INV-14. */
export default function AssignmentsPage() {
  usePageMeta(['Pengaturan', 'Penugasan Pemantauan']);
  const auth = useAuth();
  const db = useDb((s) => s.db);
  const [adding, setAdding] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState<MonitoringAssignment | null>(null);
  const year = Number(auth.today.slice(0, 4));
  const current = postingQuarter(db, year, auth.today);
  const key = (id: string) => {
    const q = db.quarters.find((x) => x.id === id)!;
    return q.fiscalYear * 10 + q.number;
  };
  const line = (id: string) =>
    db.positionTypes.find((t) => t.id === db.positions.find((p) => p.id === id)?.positionTypeId)
      ?.line;
  const lini1 = db.positions.filter((p) => p.active && line(p.id) === 1);
  const unassigned = current
    ? lini1.filter(
        (p) =>
          !db.assignments.some(
            (a) =>
              a.targetPositionId === p.id &&
              key(a.quarterFromId) <= key(current.id) &&
              key(current.id) <= key(a.quarterToId),
          ),
      )
    : [];
  const ql = (id: string) => {
    const q = db.quarters.find((x) => x.id === id)!;
    return `TW ${['I', 'II', 'III', 'IV'][q.number - 1]} ${q.fiscalYear}`;
  };
  const pname = (id: string) => db.positions.find((p) => p.id === id)?.name ?? id;

  const columns: Column<MonitoringAssignment>[] = [
    {
      key: 't',
      header: 'Jabatan Lini 1',
      primary: true,
      render: (a) => <strong>{pname(a.targetPositionId)}</strong>,
    },
    { key: 'l', header: 'Penanggung jawab', render: (a) => pname(a.leadPositionId) },
    {
      key: 's',
      header: 'Pendukung',
      render: (a) =>
        a.supports.length ? (
          <span className="adm__chips">
            {a.supports.map((s) => (
              <span key={s.positionId} className="adm__role">
                {pname(s.positionId)} · <strong>{DOMAIN[s.domain]}</strong>
              </span>
            ))}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'q',
      header: 'Triwulan',
      width: 180,
      render: (a) => (
        <span className="t-mono">
          {ql(a.quarterFromId)} – {ql(a.quarterToId)}
        </span>
      ),
    },
    {
      key: 'sk',
      header: 'SK',
      width: 150,
      render: (a) => <span className="t-mono adm__sub">{a.decreeNo}</span>,
      hideOnMobile: true,
    },
    {
      key: 'm',
      header: '',
      width: 56,
      render: (a) => (
        <RowMenu
          label="Tindakan penugasan"
          items={[{ label: 'Hapus penugasan', danger: true, onSelect: () => setRemoving(a) }]}
        />
      ),
    },
  ];

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Pengaturan"
        title="Penugasan Pemantauan"
        subtitle="Jabatan Lini 1 → tim Lini 2. Penugasan memakai jabatan, bukan orang; Lini 3 tidak ditugaskan."
        actions={
          <Button icon={Plus} onClick={() => setAdding([])}>
            Tambah Penugasan
          </Button>
        }
      />
      {current && unassigned.length > 0 && (
        <Card
          className="adm__warncard"
          eyebrow={`Belum ditugaskan · TW ${['I', 'II', 'III', 'IV'][current.number - 1]} ${current.fiscalYear}`}
          title={`${unassigned.length} jabatan Lini 1 tanpa penanggung jawab`}
        >
          <ul className="adm__bullets">
            {unassigned.map((p) => (
              <li key={p.id}>
                {p.name}{' '}
                <button type="button" className="text-link" onClick={() => setAdding([p.id])}>
                  Tugaskan
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <DataTable
        caption="Penugasan pemantauan"
        columns={columns}
        rows={[...db.assignments].sort(
          (a, b) =>
            pname(a.targetPositionId).localeCompare(pname(b.targetPositionId)) ||
            key(a.quarterFromId) - key(b.quarterFromId),
        )}
        rowKey={(a) => a.id}
      />
      {adding && <AddDialog initial={adding} onClose={() => setAdding(null)} />}
      <ConfirmDialog
        open={!!removing}
        destructive
        title="Hapus penugasan ini?"
        confirmLabel="Hapus Penugasan"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await adminApi.removeAssignment(removing.id);
          setRemoving(null);
          toast.success('Penugasan dihapus');
        }}
      >
        Partisipasi Lini 2 pada triwulan dalam rentang ini ikut berubah (§1.5). Komentar yang sudah
        ada tetap tersimpan.
      </ConfirmDialog>
    </div>
  );
}

function AddDialog({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const db = useDb((s) => s.db);
  const line = (id: string) =>
    db.positionTypes.find((t) => t.id === db.positions.find((p) => p.id === id)?.positionTypeId)
      ?.line;
  const lini1 = db.positions.filter((p) => p.active && line(p.id) === 1);
  const lini2 = db.positions.filter((p) => p.active && line(p.id) === 2);
  const quarters = db.quarters
    .filter((q) => db.fiscalYears.find((f) => f.year === q.fiscalYear)?.status !== 'archived')
    .sort((a, b) => a.fiscalYear - b.fiscalYear || a.number - b.number);
  const [targets, setTargets] = useState<string[]>(initial);
  const [lead, setLead] = useState('');
  const [supports, setSupports] = useState<MonitoringSupport[]>([]);
  const [from, setFrom] = useState(quarters[0]?.id ?? '');
  const [to, setTo] = useState(quarters.at(-1)?.id ?? '');
  const [decree, setDecree] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ql = (q: (typeof quarters)[number]) => ({
    value: q.id,
    label: `TW ${['I', 'II', 'III', 'IV'][q.number - 1]} ${q.fiscalYear}`,
  });
  return (
    <SlideOver
      open
      eyebrow="Penugasan Pemantauan"
      title="Tambah Penugasan"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await adminApi.addAssignments({
                  targets,
                  lead,
                  supports,
                  fromQuarterId: from,
                  toQuarterId: to,
                  decreeNo: decree,
                });
                toast.success(`${targets.length} penugasan ditambahkan`);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Simpan Penugasan
          </Button>
        </>
      }
    >
      <div className="adm__form">
        {error && <InlineAlert variant="error" title={error} />}
        <fieldset className="adm__fieldset">
          <legend className="field__label">Jabatan Lini 1</legend>
          {lini1.map((p) => (
            <Checkbox
              key={p.id}
              label={p.name}
              checked={targets.includes(p.id)}
              onChange={(e) =>
                setTargets(
                  e.target.checked ? [...targets, p.id] : targets.filter((x) => x !== p.id),
                )
              }
            />
          ))}
        </fieldset>
        <Select
          label="Penanggung jawab (Lini 2)"
          required
          placeholder="Pilih jabatan"
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          options={lini2.map((p) => ({ value: p.id, label: p.name }))}
        />
        <fieldset className="adm__fieldset">
          <legend className="field__label">Pendukung (opsional)</legend>
          {lini2
            .filter((p) => p.id !== lead)
            .map((p) => {
              const s = supports.find((x) => x.positionId === p.id);
              return (
                <div key={p.id} className="adm__support">
                  <Checkbox
                    label={p.name}
                    checked={!!s}
                    onChange={(e) =>
                      setSupports(
                        e.target.checked
                          ? [...supports, { positionId: p.id, domain: 'budget_performance' }]
                          : supports.filter((x) => x.positionId !== p.id),
                      )
                    }
                  />
                  {s && (
                    <select
                      className="control control--select"
                      aria-label={`Domain ${p.name}`}
                      value={s.domain}
                      onChange={(e) =>
                        setSupports(
                          supports.map((x) =>
                            x.positionId === p.id
                              ? { ...x, domain: e.target.value as MonitoringSupport['domain'] }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="budget_performance">Kinerja Anggaran</option>
                      <option value="procurement">PBJ</option>
                    </select>
                  )}
                </div>
              );
            })}
        </fieldset>
        <div className="adm__row">
          <Select
            label="Dari triwulan"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            options={quarters.map(ql)}
          />
          <Select
            label="Sampai triwulan"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            options={quarters.map(ql)}
          />
        </div>
        <TextInput
          label="Nomor SK"
          required
          value={decree}
          onChange={(e) => setDecree(e.target.value)}
        />
      </div>
    </SlideOver>
  );
}
