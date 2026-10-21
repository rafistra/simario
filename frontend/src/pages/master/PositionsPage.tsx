import { CircleSlash, Pencil, Plus, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  DatePickerField,
  EmptyState,
  InlineAlert,
  LineChip,
  PageHeader,
  Pagination,
  SearchField,
  Select,
  SlideOver,
  Textarea,
  TextInput,
  toast,
  type Column,
} from '@/components';
import { ApiError, masterApi } from '@/data/repository';
import { activePositionsOfType } from '@/data/derive/master';
import type { PositionInput } from '@/test/fake/api/master';
import { useGateDb } from '@/components/DataGate/gateDb';
import { officialsOf } from '@/domain/rules/access';
import type { Line, Position, PositionType } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/useAuth';
import './Master.css';

const PAGE = 25;
const EMPTY: PositionInput = {
  positionTypeId: '',
  code: '',
  name: '',
  orgUnitId: '',
  identity: {},
};

function PositionForm({
  editing,
  onClose,
}: {
  editing: Position | 'new' | null;
  onClose: () => void;
}) {
  const db = useGateDb();
  const [input, setInput] = useState<PositionInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof PositionInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  const key = editing === 'new' ? 'new' : (editing?.id ?? null);
  if (key !== openedFor) {
    setOpenedFor(key);
    setErrors({});
    setInput(
      editing && editing !== 'new'
        ? {
            positionTypeId: editing.positionTypeId,
            code: editing.code,
            name: editing.name,
            orgUnitId: editing.orgUnitId,
            identity: { ...editing.identity },
          }
        : EMPTY,
    );
  }
  if (!editing) return null;
  const type = db.positionTypes.find((t) => t.id === input.positionTypeId);

  const save = async () => {
    setSaving(true);
    try {
      await masterApi.savePosition(input, editing === 'new' ? undefined : editing.id);
      toast.success(
        editing === 'new' ? 'Jabatan ditambahkan' : 'Jabatan disimpan',
        'Tetapkan Pejabatnya di Pengaturan › Pengguna.',
      );
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(e.details as typeof errors);
      else toast.error('Jabatan tidak dapat disimpan', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SlideOver
      open
      eyebrow="Master data · Jabatan"
      title={editing === 'new' ? 'Tambah Jabatan' : `Ubah ${editing.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button icon={Save} loading={saving} onClick={save}>
            Simpan Jabatan
          </Button>
        </>
      }
    >
      <Select
        label="Jenis jabatan"
        required
        value={input.positionTypeId}
        placeholder="Pilih jenis jabatan"
        disabled={editing !== 'new'}
        error={errors.positionTypeId}
        options={db.positionTypes
          .filter((t) => t.active || t.id === input.positionTypeId)
          .map((t) => ({ value: t.id, label: `${t.name} — Lini ${t.line}` }))}
        onChange={(e) => setInput((s) => ({ ...s, positionTypeId: e.target.value, identity: {} }))}
      />
      <TextInput
        label="Kode"
        required
        value={input.code}
        error={errors.code}
        onChange={(e) => setInput((s) => ({ ...s, code: e.target.value }))}
      />
      <TextInput
        label="Nama jabatan"
        required
        value={input.name}
        error={errors.name}
        onChange={(e) => setInput((s) => ({ ...s, name: e.target.value }))}
      />
      <Select
        label="Unit kerja"
        required
        value={input.orgUnitId}
        placeholder="Pilih unit kerja"
        error={errors.orgUnitId}
        options={db.orgUnits
          .filter((o) => o.active)
          .map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
        onChange={(e) => setInput((s) => ({ ...s, orgUnitId: e.target.value }))}
      />
      {type && type.identitySchema.length > 0 && (
        <fieldset className="identity-block">
          <legend className="t-eyebrow">Isian identitas jenis {type.name}</legend>
          {type.identitySchema.map((f) =>
            f.kind === 'date' ? (
              <DatePickerField
                key={f.key}
                label={f.label}
                value={input.identity[f.key] ?? ''}
                onChange={(e) =>
                  setInput((s) => ({ ...s, identity: { ...s.identity, [f.key]: e.target.value } }))
                }
              />
            ) : (
              <TextInput
                key={f.key}
                label={f.label}
                value={input.identity[f.key] ?? ''}
                onChange={(e) =>
                  setInput((s) => ({ ...s, identity: { ...s.identity, [f.key]: e.target.value } }))
                }
              />
            ),
          )}
          <p className="t-caption">
            Jenis lain menampilkan isian berbeda, mis. KPA/Kasatker: Nama Satker, Nomor DIPA
            Petikan.
          </p>
        </fieldset>
      )}
      <p className="t-caption">
        Pejabat ditetapkan setelah jabatan dibuat, di Pengaturan › Pengguna (holding Pejabat).
      </p>
    </SlideOver>
  );
}

/** /master/jabatan — FR-MST-008, FR-MST-009. */
export default function PositionsPage() {
  usePageMeta(['Master Data', 'Jabatan']);
  const auth = useAuth();
  const db = useGateDb();
  const [q, setQ] = useState('');
  const [line, setLine] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('aktif');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Position | 'new' | null>(null);
  const [typeInUse, setTypeInUse] = useState<PositionType | null>(null);
  const [deactivating, setDeactivating] = useState<Position | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const typeOf = (p: Position) => db.positionTypes.find((t) => t.id === p.positionTypeId)!;
  const unitOf = (p: Position) => db.orgUnits.find((o) => o.id === p.orgUnitId)!;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.positions
      .filter((p) => !needle || `${p.code} ${p.name}`.toLowerCase().includes(needle))
      .filter((p) => !line || String(typeOf(p).line) === line)
      .filter((p) => !typeFilter || p.positionTypeId === typeFilter)
      .filter((p) => !unit || p.orgUnitId === unit)
      .filter((p) => (status === 'aktif' ? p.active : status === 'nonaktif' ? !p.active : true))
      .sort((a, b) => typeOf(a).line - typeOf(b).line || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, q, line, typeFilter, unit, status]);

  const columns: Column<Position>[] = [
    {
      key: 'jabatan',
      header: 'Jabatan',
      primary: true,
      render: (p) => (
        <span className="cell-title">
          <strong>{p.name}</strong>
          <span className="t-caption">
            {p.code} · {unitOf(p).code}
            {!p.active && ` · nonaktif${p.deactivationReason ? `: ${p.deactivationReason}` : ''}`}
          </span>
        </span>
      ),
    },
    { key: 'jenis', header: 'Jenis', width: 200, render: (p) => typeOf(p).name },
    { key: 'lini', header: 'Lini', width: 80, render: (p) => <LineChip line={typeOf(p).line} /> },
    {
      key: 'pejabat',
      header: 'Pejabat',
      width: 200,
      render: (p) => {
        const officials = officialsOf(db, p.id, auth.today);
        if (officials.length === 0)
          return p.active ? <span className="text-danger">Belum ada Pejabat</span> : '—';
        const filler = officials.find((o) => o.occupancy.isFiller) ?? officials[0]!;
        return `${filler.user.fullName}${officials.length > 1 ? ` +${officials.length - 1}` : ''}`;
      },
    },
    {
      key: 'aksi',
      header: 'Aksi',
      width: 104,
      align: 'right',
      render: (p) => (
        <span
          className="row-actions"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="icon-btn"
            aria-label={`Ubah ${p.name}`}
            onClick={() => setEditing(p)}
          >
            <Pencil aria-hidden />
          </button>
          {p.active ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Nonaktifkan ${p.name}`}
              onClick={() => {
                setDeactivating(p);
                setReason('');
                setReasonError(null);
              }}
            >
              <CircleSlash aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Aktifkan kembali ${p.name}`}
              onClick={() =>
                masterApi
                  .reactivatePosition(p.id)
                  .then(() => toast.success('Jabatan diaktifkan kembali'))
              }
            >
              <RotateCcw aria-hidden />
            </button>
          )}
        </span>
      ),
    },
  ];

  const toggleType = async (t: PositionType) => {
    try {
      await masterApi.setPositionTypeActive(t.id, !t.active);
      toast.success(t.active ? 'Jenis jabatan dinonaktifkan' : 'Jenis jabatan diaktifkan');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'type_in_use') setTypeInUse(t);
      else toast.error('Tidak dapat diubah', (e as Error).message);
    }
  };

  const inUse = typeInUse ? activePositionsOfType(db, typeInUse.id) : [];
  const runningRegisters = typeInUse
    ? db.registers.filter(
        (r) => inUse.some((p) => p.id === r.positionId) && r.fiscalYear === auth.currentFiscalYear,
      ).length
    : 0;
  const impactQuery = useQuery(
    () => (deactivating ? masterApi.positionImpact(deactivating.id) : Promise.resolve(null)),
    [deactivating?.id ?? null],
  );
  const impact = deactivating ? (impactQuery.data ?? null) : null;
  const current = impact?.publishedRegisters.find((r) => r.fiscalYear === auth.currentFiscalYear);

  const roleName = (t: PositionType) => db.roles.find((r) => r.id === t.defaultRoleId)?.name ?? '';

  return (
    <div className="master-page">
      <PageHeader
        eyebrow={`Master data · TA ${auth.currentFiscalYear}`}
        title="Jenis Jabatan dan Jabatan"
        subtitle="Kursi pada tiga lini. Jabatan bertahan saat pemegangnya berganti; Pejabat dikelola di Pengaturan › Pengguna."
        actions={
          auth.can(18) && (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Tambah Jabatan
            </Button>
          )
        }
      />

      <section aria-labelledby="types-title" className="types-section">
        <h2 id="types-title" className="t-eyebrow">
          Jenis jabatan per lini
        </h2>
        <div className="types-grid">
          {([1, 2, 3] as Line[]).map((l) => {
            const types = db.positionTypes.filter((t) => t.line === l);
            return (
              <div key={l} className="types-col">
                <header className="types-col__head">
                  <LineChip line={l} />
                  <span className="t-caption">{types.length} jenis</span>
                </header>
                {types.map((t) => (
                  <div
                    key={t.id}
                    className={['type-row', !t.active && 'is-inactive'].filter(Boolean).join(' ')}
                  >
                    <span className="type-row__text">
                      <span className="type-row__name">{t.name}</span>
                      <span className="t-caption">
                        {[
                          roleName(t),
                          t.allowsMultipleOfficials && 'banyak Pejabat',
                          t.hasTemplates && 'template',
                          t.isBuiltin && 'bawaan',
                          !t.active && 'nonaktif',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {auth.can(17) && (
                      <Button variant="ghost" onClick={() => toggleType(t)}>
                        {t.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="positions-title" className="positions-section">
        <h2 id="positions-title" className="t-eyebrow">
          Jabatan
        </h2>
        <div className="filter-row">
          <SearchField
            label="Cari jabatan"
            placeholder="Cari kode atau nama jabatan…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Lini"
            value={line}
            onChange={(e) => {
              setLine(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Semua lini' },
              { value: '1', label: 'Lini 1' },
              { value: '2', label: 'Lini 2' },
              { value: '3', label: 'Lini 3' },
            ]}
          />
          <Select
            label="Jenis"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Semua jenis' },
              ...db.positionTypes.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <Select
            label="Unit kerja"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Semua unit kerja' },
              ...db.orgUnits.map((o) => ({ value: o.id, label: o.code })),
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'aktif', label: 'Aktif' },
              { value: 'nonaktif', label: 'Nonaktif' },
              { value: 'semua', label: 'Semua status' },
            ]}
          />
        </div>
        <DataTable
          caption="Daftar jabatan"
          columns={columns}
          rows={rows.slice((page - 1) * PAGE, page * PAGE)}
          rowKey={(p) => p.id}
          onRowClick={auth.can(18) ? (p) => setEditing(p) : undefined}
          rowClassName={(p) => (p.active ? undefined : 'is-dimmed')}
          empty={
            <EmptyState
              title="Tidak ada jabatan yang cocok"
              message="Ubah filter atau kata kunci pencarian."
            />
          }
          footer={<Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />}
        />
      </section>

      <PositionForm editing={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={typeInUse !== null}
        title={`Jenis “${typeInUse?.name}” masih dipakai`}
        cancelLabel="Tutup"
        confirmLabel={`Lihat ${inUse.length} Jabatan`}
        onCancel={() => setTypeInUse(null)}
        onConfirm={() => {
          setTypeFilter(typeInUse!.id);
          setStatus('aktif');
          setPage(1);
          setTypeInUse(null);
        }}
      >
        <div className="dialog-stack">
          <InlineAlert variant="error" title="Jenis ini belum dapat dinonaktifkan">
            {inUse.length} jabatan aktif memakai jenis ini, dan {runningRegisters} register TA{' '}
            {auth.currentFiscalYear} sedang berjalan. Nonaktifkan atau pindahkan jabatan tersebut
            terlebih dulu.
          </InlineAlert>
          <ul className="dialog-list">
            {inUse.slice(0, 3).map((p) => (
              <li key={p.id}>
                {p.name} · {unitOf(p).code}
              </li>
            ))}
            {inUse.length > 3 && <li>…dan {inUse.length - 3} jabatan lainnya</li>}
          </ul>
          <p className="t-caption">
            Jenis bawaan tidak dapat dihapus. Tahap, template, dan formulir Data Umum milik jenis
            ini tetap tersimpan.
          </p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deactivating !== null}
        destructive
        title={`Nonaktifkan jabatan ${deactivating?.name}?`}
        confirmLabel="Nonaktifkan Jabatan"
        confirming={busy}
        onCancel={() => setDeactivating(null)}
        onConfirm={async () => {
          if (!reason.trim()) {
            setReasonError('Alasan penonaktifan wajib diisi.');
            return;
          }
          setBusy(true);
          try {
            await masterApi.deactivatePosition(deactivating!.id, reason);
            toast.success(
              'Jabatan dinonaktifkan',
              'Riwayat, penilaian, dan cetakan tetap tersimpan.',
            );
            setDeactivating(null);
          } catch (e) {
            setReasonError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-stack">
          {current && (
            <InlineAlert
              variant="warning"
              title={`Jabatan ini punya register TA ${auth.currentFiscalYear} yang terbit`}
            >
              {current.activeRisks} risiko aktif dan {impact!.activeOperators} Operator aktif.
              Setelah dinonaktifkan: register dan utas menjadi baca saja, Operator berakhir, dan
              jabatan keluar dari antrean Lini 3 mulai triwulan berikutnya.
            </InlineAlert>
          )}
          {!current && impact && impact.activeOperators > 0 && (
            <InlineAlert
              variant="warning"
              title={`${impact.activeOperators} Operator aktif akan berakhir.`}
            />
          )}
          <Textarea
            label="Alasan penonaktifan"
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
            Jabatan tidak dihapus; seluruh riwayat, penilaian, dan cetakan tetap tersimpan dan dapat
            dibaca.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
