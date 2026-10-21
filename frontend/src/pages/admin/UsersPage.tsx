import { Lock, UserPlus } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  DatePickerField,
  InlineAlert,
  PageHeader,
  Pagination,
  SearchField,
  Select,
  SlideOver,
  StatusChip,
  TextInput,
  Toggle,
  toast,
  type Column,
} from '@/components';
import { deactivationImpact } from '@/data/api/admin';
import { adminApi } from '@/data/repository';
import { useGateDb } from '@/components/DataGate/gateDb';
import { effectiveRoleIds } from '@/domain/rules/access';
import type { User } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { useAuth } from '@/state/useAuth';
import { RowMenu } from './RowMenu';
import './Admin.css';

const PAGE = 25;
const activeOn = (s: string, e: string | null, d: string) => s <= d && (e === null || e >= d);

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; user: User }
  | { kind: 'assign'; user: User }
  | { kind: 'replace'; user: User | null }
  | { kind: 'reset'; user: User }
  | { kind: 'deactivate'; user: User }
  | null;

/** /pengaturan/pengguna — FR-ADM-004, 005. */
export default function UsersPage() {
  usePageMeta(['Pengaturan', 'Pengguna']);
  const auth = useAuth();
  const db = useGateDb();
  const today = auth.today;
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('');
  const [line, setLine] = useState('');
  const [status, setStatus] = useState('aktif');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const canRoles = auth.can(22);

  const rows = db.users
    .filter((u) => (status === 'aktif' ? u.active : status === 'nonaktif' ? !u.active : true))
    .filter(
      (u) =>
        !search.trim() ||
        `${u.fullName} ${u.nip} ${u.email}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .filter((u) => !unit || u.orgUnitId === unit)
    .filter((u) => {
      if (!line) return true;
      return db.occupancies.some(
        (o) =>
          o.userId === u.id &&
          activeOn(o.startDate, o.endDate, today) &&
          String(
            db.positionTypes.find(
              (t) => t.id === db.positions.find((p) => p.id === o.positionId)?.positionTypeId,
            )?.line,
          ) === line,
      );
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Nama',
      primary: true,
      render: (u) => (
        <span className="adm__who">
          <strong>{u.fullName}</strong>
          <span className="t-mono adm__sub">{u.nip}</span>
          <span className="adm__sub">{u.email}</span>
        </span>
      ),
    },
    {
      key: 'unit',
      header: 'Unit kerja',
      render: (u) => db.orgUnits.find((o) => o.id === u.orgUnitId)?.name ?? '—',
      hideOnMobile: true,
    },
    {
      key: 'pos',
      header: 'Jabatan (Pejabat)',
      render: (u) => {
        const occ = db.occupancies.filter(
          (o) => o.userId === u.id && activeOn(o.startDate, o.endDate, today),
        );
        return occ.length ? (
          <span className="adm__list">
            {occ.map((o) => (
              <span key={o.id}>
                {db.positions.find((p) => p.id === o.positionId)?.name}
                {o.isFiller &&
                db.occupancies.filter(
                  (x) => x.positionId === o.positionId && activeOn(x.startDate, x.endDate, today),
                ).length > 1
                  ? ' (Pengisi)'
                  : ''}
                {!o.decreeFile && <span className="adm__warn"> · SK belum diunggah</span>}
              </span>
            ))}
          </span>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'op',
      header: 'Operator untuk',
      width: 110,
      align: 'right',
      render: (u) => (
        <span className="t-mono">
          {
            db.delegates.filter((x) => x.userId === u.id && activeOn(x.startDate, x.endDate, today))
              .length
          }
        </span>
      ),
    },
    {
      key: 'roles',
      header: 'Peran',
      render: (u) => {
        const manual = db.userRoles
          .filter((r) => r.userId === u.id && r.source === 'manual')
          .map((r) => r.roleId);
        return (
          <span className="adm__chips">
            {effectiveRoleIds(db, u.id, today).map((id) => {
              const role = db.roles.find((r) => r.id === id);
              const auto = !manual.includes(id);
              return (
                <span
                  key={id}
                  className={['adm__role', auto && 'is-auto'].filter(Boolean).join(' ')}
                  title={auto ? 'Otomatis dari jabatan' : 'Peran manual'}
                >
                  {(auto || role?.isLocked) && <Lock aria-hidden />}
                  {role?.name}
                </span>
              );
            })}
          </span>
        );
      },
    },
    {
      key: 'acc',
      header: 'Akun',
      width: 120,
      render: (u) => (
        <span className="adm__sub">
          {u.isLocalAccount ? 'Lokal' : 'SSO'} ·{' '}
          {u.createdVia === 'delegation' ? 'delegasi' : 'admin'}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'st',
      header: 'Status',
      width: 100,
      render: (u) =>
        u.active ? (
          <StatusChip status="terbit" label="Aktif" />
        ) : (
          <StatusChip status="diarsipkan" label="Nonaktif" />
        ),
    },
    {
      key: 'menu',
      header: '',
      width: 56,
      render: (u) => (
        <RowMenu
          label={`Tindakan untuk ${u.fullName}`}
          items={[
            { label: 'Sunting', onSelect: () => setDialog({ kind: 'edit', user: u }) },
            {
              label: 'Tetapkan Jabatan',
              onSelect: () => setDialog({ kind: 'assign', user: u }),
              hidden: !u.active,
            },
            {
              label: 'Alih Pejabat',
              onSelect: () => setDialog({ kind: 'replace', user: u }),
              hidden: !db.occupancies.some(
                (o) => o.userId === u.id && activeOn(o.startDate, o.endDate, today),
              ),
            },
            {
              label: 'Atur Ulang Kata Sandi',
              onSelect: () => setDialog({ kind: 'reset', user: u }),
              hidden: !u.isLocalAccount,
            },
            u.active
              ? {
                  label: 'Nonaktifkan',
                  danger: true,
                  onSelect: () => setDialog({ kind: 'deactivate', user: u }),
                }
              : {
                  label: 'Aktifkan kembali',
                  onSelect: () =>
                    void adminApi
                      .reactivateUser(u.id)
                      .then(() => toast.success(`${u.fullName} diaktifkan kembali`)),
                },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Pengaturan"
        title="Pengguna dan Jabatan"
        subtitle={`${db.users.filter((u) => u.active).length} pengguna aktif`}
        actions={
          <span className="adm__actions">
            <Button variant="secondary" onClick={() => setDialog({ kind: 'replace', user: null })}>
              Alih Pejabat
            </Button>
            <Button icon={UserPlus} onClick={() => setDialog({ kind: 'add' })}>
              Tambah Pengguna
            </Button>
          </span>
        }
      />
      <div className="adm__filters">
        <SearchField
          label="Cari nama, NIP, atau email"
          value={search}
          placeholder="Cari nama, NIP, atau email"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Unit kerja"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          options={[
            { value: '', label: 'Semua unit' },
            ...db.orgUnits.map((o) => ({ value: o.id, label: o.name })),
          ]}
        />
        <Select
          label="Lini (sebagai Pejabat)"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          options={[
            { value: '', label: 'Semua' },
            { value: '1', label: 'Lini 1' },
            { value: '2', label: 'Lini 2' },
            { value: '3', label: 'Lini 3' },
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'aktif', label: 'Aktif' },
            { value: 'nonaktif', label: 'Nonaktif' },
            { value: '', label: 'Semua' },
          ]}
        />
      </div>
      <DataTable
        caption="Pengguna"
        columns={columns}
        rows={shown}
        rowKey={(u) => u.id}
        empty="Tidak ada pengguna yang cocok."
      />
      {rows.length > PAGE && (
        <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
      )}

      {dialog?.kind === 'add' && <AddUser onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && (
        <EditRoles user={dialog.user} canRoles={canRoles} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'assign' && (
        <AssignPosition user={dialog.user} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'replace' && (
        <ReplaceOfficial user={dialog.user} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'reset' && (
        <ResetPassword user={dialog.user} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'deactivate' && (
        <Deactivate user={dialog.user} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function useSubmit(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    try {
      const msg = await fn();
      if (msg) toast.success(msg);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function Footer({
  busy,
  label,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  label: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onClose}>
        Batal
      </Button>
      <Button loading={busy} onClick={onSubmit}>
        {label}
      </Button>
    </>
  );
}

function AddUser({ onClose }: { onClose: () => void }) {
  const db = useGateDb();
  const [v, setV] = useState({
    nip: '',
    fullName: '',
    email: '',
    orgUnitId: db.orgUnits[0]!.id,
    isLocalAccount: false,
  });
  const [temp, setTemp] = useState<string | null>(null);
  const { busy, error, submit } = useSubmit(() => {});
  if (temp)
    return (
      <SlideOver
        open
        eyebrow="Pengguna baru"
        title="Akun lokal dibuat"
        onClose={onClose}
        footer={<Button onClick={onClose}>Selesai</Button>}
      >
        <InlineAlert variant="success" title="Sampaikan kata sandi sementara ini secara langsung">
          <span className="t-mono">{temp}</span> — pengguna wajib menggantinya saat masuk pertama.
        </InlineAlert>
      </SlideOver>
    );
  return (
    <SlideOver
      open
      eyebrow="Pengguna"
      title="Tambah Pengguna"
      onClose={onClose}
      footer={
        <Footer
          busy={busy}
          label="Tambah Pengguna"
          onClose={onClose}
          onSubmit={() =>
            void submit(async () => {
              const r = await adminApi.addUser(v);
              if (r.tempPassword) setTemp(r.tempPassword);
              else {
                onClose();
                return `${v.fullName} ditambahkan`;
              }
            })
          }
        />
      }
    >
      <div className="adm__form">
        {error && <InlineAlert variant="error" title={error} />}
        <TextInput
          label="NIP"
          required
          inputMode="numeric"
          value={v.nip}
          onChange={(e) => setV({ ...v, nip: e.target.value })}
        />
        <TextInput
          label="Nama lengkap"
          required
          value={v.fullName}
          onChange={(e) => setV({ ...v, fullName: e.target.value })}
        />
        <TextInput
          label="Email"
          required
          type="email"
          value={v.email}
          onChange={(e) => setV({ ...v, email: e.target.value })}
        />
        <Select
          label="Unit kerja"
          value={v.orgUnitId}
          onChange={(e) => setV({ ...v, orgUnitId: e.target.value })}
          options={db.orgUnits.map((o) => ({ value: o.id, label: o.name }))}
        />
        <Toggle
          label="Akun lokal (tanpa SSO)"
          checked={v.isLocalAccount}
          onChange={(on) => setV({ ...v, isLocalAccount: on })}
        />
      </div>
    </SlideOver>
  );
}

function EditRoles({
  user,
  canRoles,
  onClose,
}: {
  user: User;
  canRoles: boolean;
  onClose: () => void;
}) {
  const db = useGateDb();
  const manual = db.userRoles
    .filter((r) => r.userId === user.id && r.source === 'manual')
    .map((r) => r.roleId);
  const auto = new Set(db.positionTypes.map((t) => t.defaultRoleId));
  const [chosen, setChosen] = useState<string[]>(manual);
  const { busy, error, submit } = useSubmit(onClose);
  return (
    <SlideOver
      open
      eyebrow={user.fullName}
      title="Sunting peran manual"
      onClose={onClose}
      footer={
        canRoles ? (
          <Footer
            busy={busy}
            label="Simpan Peran"
            onClose={onClose}
            onSubmit={() =>
              void submit(
                async () => (await adminApi.setManualRoles(user.id, chosen), 'Peran disimpan'),
              )
            }
          />
        ) : undefined
      }
    >
      <div className="adm__form">
        {error && <InlineAlert variant="error" title={error} />}
        {!canRoles && (
          <InlineAlert variant="info" title="Mengubah peran memerlukan izin peran dan akses." />
        )}
        <p className="adm__sub">
          Peran otomatis dari jabatan (Pemilik Risiko, Pemantau, Penjamin Mutu) mengikuti holding
          dan tidak diubah di sini.
        </p>
        {db.roles
          .filter((r) => !auto.has(r.id))
          .map((r) => (
            <Checkbox
              key={r.id}
              label={r.name}
              disabled={!canRoles}
              checked={chosen.includes(r.id)}
              onChange={(e) =>
                setChosen(e.target.checked ? [...chosen, r.id] : chosen.filter((x) => x !== r.id))
              }
            />
          ))}
      </div>
    </SlideOver>
  );
}

function AssignPosition({ user, onClose }: { user: User; onClose: () => void }) {
  const db = useGateDb();
  const auth = useAuth();
  const [v, setV] = useState({
    positionId: '',
    decreeNo: '',
    decreeDate: auth.today,
    decreeFile: '',
    startDate: auth.today,
    isFiller: false,
  });
  const { busy, error, submit } = useSubmit(onClose);
  const pos = db.positions.find((p) => p.id === v.positionId);
  const multi =
    pos && db.positionTypes.find((t) => t.id === pos.positionTypeId)?.allowsMultipleOfficials;
  const members = pos
    ? db.occupancies.filter(
        (o) => o.positionId === pos.id && activeOn(o.startDate, o.endDate, auth.today),
      )
    : [];
  const isOperator =
    pos &&
    db.delegates.some(
      (x) =>
        x.userId === user.id &&
        x.positionId === pos.id &&
        activeOn(x.startDate, x.endDate, auth.today),
    );
  return (
    <SlideOver
      open
      eyebrow={user.fullName}
      title="Tetapkan Jabatan"
      onClose={onClose}
      footer={
        <Footer
          busy={busy}
          label="Tetapkan"
          onClose={onClose}
          onSubmit={() =>
            void submit(async () => {
              const r = await adminApi.assignPosition({
                userId: user.id,
                ...v,
                decreeFile: v.decreeFile || null,
              });
              return `${user.fullName} ditetapkan sebagai Pejabat ${pos?.name}${r.promoted ? ' · delegasi Operator berakhir (promosi)' : ''}`;
            })
          }
        />
      }
    >
      <div className="adm__form">
        {error && <InlineAlert variant="error" title={error} />}
        <Select
          label="Jabatan"
          required
          placeholder="Pilih jabatan"
          value={v.positionId}
          onChange={(e) => setV({ ...v, positionId: e.target.value })}
          options={db.positions
            .filter((p) => p.active)
            .map((p) => ({ value: p.id, label: p.name }))}
        />
        {pos && multi && (
          <InlineAlert
            variant="info"
            title={`Anggota aktif: ${members.map((m) => db.users.find((u) => u.id === m.userId)?.fullName + (m.isFiller ? ' (Pengisi)' : '')).join(', ') || '—'}`}
          >
            Tepat satu Pengisi per Pokja. Mencentang Pengisi memindahkan tanda dan mengakhiri
            Operator yang ditunjuk Pengisi lama.
          </InlineAlert>
        )}
        {pos && multi && (
          <Toggle
            label="Jadikan Pengisi"
            checked={v.isFiller}
            onChange={(on) => setV({ ...v, isFiller: on })}
          />
        )}
        {isOperator && (
          <InlineAlert
            variant="warning"
            title="Pengguna ini Operator jabatan yang sama; delegasinya berakhir (promosi)."
          />
        )}
        <TextInput
          label="Nomor SK"
          required
          value={v.decreeNo}
          onChange={(e) => setV({ ...v, decreeNo: e.target.value })}
        />
        <DatePickerField
          label="Tanggal SK"
          required
          value={v.decreeDate}
          onChange={(e) => setV({ ...v, decreeDate: e.target.value })}
        />
        <TextInput
          label="Berkas SK (PDF)"
          helper="Boleh menyusul; holding bertanda “SK belum diunggah”."
          value={v.decreeFile}
          placeholder="nama-berkas.pdf"
          onChange={(e) => setV({ ...v, decreeFile: e.target.value })}
        />
        <DatePickerField
          label="Tanggal mulai"
          required
          max={auth.today}
          value={v.startDate}
          onChange={(e) => setV({ ...v, startDate: e.target.value })}
        />
      </div>
    </SlideOver>
  );
}

function ReplaceOfficial({ user, onClose }: { user: User | null; onClose: () => void }) {
  const db = useGateDb();
  const auth = useAuth();
  const today = auth.today;
  const firstOcc = user
    ? db.occupancies.find((o) => o.userId === user.id && activeOn(o.startDate, o.endDate, today))
    : undefined;
  const [positionId, setPositionId] = useState(firstOcc?.positionId ?? '');
  const [outgoing, setOutgoing] = useState(firstOcc?.id ?? '');
  const [v, setV] = useState({
    incomingUserId: '',
    effectiveDate: today,
    decreeNo: '',
    decreeDate: today,
    decreeFile: '',
  });
  const { busy, error, submit } = useSubmit(onClose);
  const members = db.occupancies.filter(
    (o) => o.positionId === positionId && activeOn(o.startDate, o.endDate, today),
  );
  const out = members.find((o) => o.id === outgoing);
  const operators = out
    ? db.delegates.filter(
        (x) => x.appointedByOccupancyId === out.id && activeOn(x.startDate, x.endDate, today),
      )
    : [];
  const promoted = db.delegates.some(
    (x) =>
      x.userId === v.incomingUserId &&
      x.positionId === positionId &&
      activeOn(x.startDate, x.endDate, today),
  );
  return (
    <SlideOver
      open
      eyebrow="Pengguna dan Jabatan"
      title="Alih Pejabat"
      onClose={onClose}
      footer={
        <Footer
          busy={busy}
          label="Alihkan Pejabat"
          onClose={onClose}
          onSubmit={() =>
            void submit(async () => {
              const r = await adminApi.replaceOfficial({
                positionId,
                outgoingOccupancyId: outgoing,
                ...v,
                decreeFile: v.decreeFile || null,
              });
              return `Pejabat dialihkan · ${r.operatorsEnded} Operator berakhir`;
            })
          }
        />
      }
    >
      <div className="adm__form">
        {error && <InlineAlert variant="error" title={error} />}
        <Select
          label="Jabatan"
          required
          placeholder="Pilih jabatan"
          value={positionId}
          onChange={(e) => {
            setPositionId(e.target.value);
            setOutgoing(
              db.occupancies.find(
                (o) => o.positionId === e.target.value && activeOn(o.startDate, o.endDate, today),
              )?.id ?? '',
            );
          }}
          options={db.positions
            .filter((p) =>
              db.occupancies.some(
                (o) => o.positionId === p.id && activeOn(o.startDate, o.endDate, today),
              ),
            )
            .map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          label="Pejabat keluar"
          required
          value={outgoing}
          onChange={(e) => setOutgoing(e.target.value)}
          options={members.map((m) => ({
            value: m.id,
            label:
              (db.users.find((u) => u.id === m.userId)?.fullName ?? '') +
              (m.isFiller && members.length > 1 ? ' (Pengisi)' : ''),
          }))}
        />
        <Select
          label="Pejabat masuk"
          required
          placeholder="Pilih pengguna"
          value={v.incomingUserId}
          onChange={(e) => setV({ ...v, incomingUserId: e.target.value })}
          options={db.users
            .filter((u) => u.active && !members.some((m) => m.userId === u.id))
            .map((u) => ({ value: u.id, label: `${u.fullName} · ${u.nip}` }))}
        />
        <DatePickerField
          label="Tanggal efektif"
          required
          max={today}
          value={v.effectiveDate}
          onChange={(e) => setV({ ...v, effectiveDate: e.target.value })}
        />
        <TextInput
          label="Nomor SK"
          required
          value={v.decreeNo}
          onChange={(e) => setV({ ...v, decreeNo: e.target.value })}
        />
        <DatePickerField
          label="Tanggal SK"
          required
          value={v.decreeDate}
          onChange={(e) => setV({ ...v, decreeDate: e.target.value })}
        />
        <TextInput
          label="Berkas SK (PDF)"
          value={v.decreeFile}
          placeholder="nama-berkas.pdf"
          onChange={(e) => setV({ ...v, decreeFile: e.target.value })}
        />
        <InlineAlert variant="warning" title="Akibat">
          <ul className="adm__bullets">
            <li>Berlaku seketika saat dikonfirmasi; tindakan Pejabat lama sebelumnya tetap sah.</li>
            <li>{operators.length} Operator yang ditunjuk Pejabat keluar berakhir.</li>
            {promoted && (
              <li>
                Pejabat masuk adalah Operator jabatan ini; delegasinya berakhir (promosi), akun
                tetap aktif.
              </li>
            )}
            <li>
              Register, utas, dan penilaian tetap pada jabatan; draf dituntaskan oleh Pejabat masuk.
            </li>
          </ul>
        </InlineAlert>
      </div>
    </SlideOver>
  );
}

function ResetPassword({ user, onClose }: { user: User; onClose: () => void }) {
  const [temp, setTemp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (temp)
    return (
      <ConfirmDialog
        open
        title="Kata sandi sementara dibuat"
        confirmLabel="Selesai"
        onConfirm={onClose}
        onCancel={onClose}
      >
        <p>
          Sampaikan kata sandi sementara <span className="t-mono">{temp}</span> kepada{' '}
          {user.fullName} secara langsung. Pengguna wajib menggantinya saat masuk.
        </p>
      </ConfirmDialog>
    );
  return (
    <ConfirmDialog
      open
      title={`Atur ulang kata sandi ${user.fullName}?`}
      confirmLabel="Atur Ulang"
      confirming={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try {
          setTemp(await adminApi.resetPassword(user.id));
        } catch (e) {
          toast.error('Gagal', (e as Error).message);
          onClose();
        } finally {
          setBusy(false);
        }
      }}
    >
      Kata sandi lama tidak berlaku lagi dan pengguna wajib membuat kata sandi baru saat masuk
      berikutnya.
    </ConfirmDialog>
  );
}

function Deactivate({ user, onClose }: { user: User; onClose: () => void }) {
  const db = useGateDb();
  const auth = useAuth();
  const impact = deactivationImpact(db, user.id, auth.today);
  const [busy, setBusy] = useState(false);
  if (impact.fillerBlock)
    return (
      <ConfirmDialog
        open
        title="Pengguna ini tidak dapat dinonaktifkan"
        confirmLabel="Mengerti"
        onConfirm={onClose}
        onCancel={onClose}
      >
        {user.fullName} adalah Pengisi {impact.fillerBlock} yang masih memiliki anggota aktif lain.
        Pindahkan tanda Pengisi lewat Tetapkan Jabatan atau Alih Pejabat terlebih dahulu.
      </ConfirmDialog>
    );
  return (
    <ConfirmDialog
      open
      destructive
      title={`Nonaktifkan ${user.fullName}?`}
      confirmLabel="Nonaktifkan"
      confirming={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try {
          await adminApi.deactivateUser(user.id);
          toast.success(`${user.fullName} dinonaktifkan`);
        } catch (e) {
          toast.error('Gagal menonaktifkan', (e as Error).message);
        } finally {
          setBusy(false);
          onClose();
        }
      }}
    >
      {impact.occupancies} jabatan sebagai Pejabat dan {impact.delegations} penunjukan sebagai
      Operator berakhir; {impact.appointedOperators} Operator yang ditunjuknya ikut berakhir.
      Sesinya diakhiri. Data yang pernah dibuat tetap tersimpan; pengguna tidak pernah dihapus.
    </ConfirmDialog>
  );
}
