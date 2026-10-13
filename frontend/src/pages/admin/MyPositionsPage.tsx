import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CapacityChip,
  ConfirmDialog,
  DatePickerField,
  InlineAlert,
  LineChip,
  PageHeader,
  SlideOver,
  TextInput,
  toast,
} from '@/components';
import { adminApi } from '@/data/repository';
import { useDb } from '@/data/local/store';
import { checkAction, positionLine } from '@/domain/rules/access';
import type { PositionDelegate } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/state/useAuth';
import './Admin.css';

const END: Record<string, string> = {
  revoked: 'dicabut',
  expired: 'berakhir',
  official_changed: 'Pejabat berganti',
  filler_changed: 'Pengisi berpindah',
  promoted: 'menjadi Pejabat',
  user_deactivated: 'akun dinonaktifkan',
};

/** /jabatan-saya — FR-ADM-010, FR-ADM-012. */
export default function MyPositionsPage() {
  usePageMeta(['Jabatan Saya']);
  const auth = useAuth();
  const db = useDb((s) => s.db);
  const today = auth.today;
  const [appoint, setAppoint] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<PositionDelegate | null>(null);
  const active = (s: string, e: string | null) => s <= today && (e === null || e >= today);
  const occ = db.occupancies.filter(
    (o) => o.userId === auth.user.id && active(o.startDate, o.endDate),
  );
  const dels = db.delegates.filter(
    (d) => d.userId === auth.user.id && active(d.startDate, d.endDate),
  );
  const user = (id: string) => db.users.find((u) => u.id === id)?.fullName ?? '';
  const pos = (id: string) => db.positions.find((p) => p.id === id)!;
  const year = Number(today.slice(0, 4));

  return (
    <div className="adm">
      <PageHeader eyebrow="Akun" title="Jabatan Saya" subtitle={auth.user.fullName} />
      {occ.length > 0 && <h2 className="adm__h2">Sebagai Pejabat</h2>}
      {occ.map((o) => {
        const p = pos(o.positionId);
        const operators = db.delegates.filter((d) => d.appointedByOccupancyId === o.id);
        const current = operators.filter((d) => active(d.startDate, d.endDate));
        const past = operators.filter((d) => !active(d.startDate, d.endDate));
        const canManage = checkAction(db, auth.user.id, 11, p.id, today).ok;
        return (
          <Card
            key={o.id}
            eyebrow={
              <span className="adm__chips">
                <LineChip line={positionLine(db, p.id)} /> <CapacityChip capacity="pejabat" />
              </span>
            }
            title={p.name}
            aside={
              canManage ? (
                <Button icon={UserPlus} onClick={() => setAppoint(p.id)}>
                  Tunjuk Operator
                </Button>
              ) : undefined
            }
          >
            <dl className="adm__kv">
              <div>
                <dt>SK</dt>
                <dd className="t-mono">
                  {o.decreeNo} · {formatDate(o.decreeDate)}
                  {!o.decreeFile && <span className="adm__warn"> · SK belum diunggah</span>}
                </dd>
              </div>
              <div>
                <dt>Sejak</dt>
                <dd>{formatDate(o.startDate)}</dd>
              </div>
              {db.occupancies.filter((x) => x.positionId === p.id && active(x.startDate, x.endDate))
                .length > 1 && (
                <div>
                  <dt>Pokja</dt>
                  <dd>{o.isFiller ? 'Anda Pengisi' : 'Anda anggota (bukan Pengisi)'}</dd>
                </div>
              )}
            </dl>
            <h3 className="adm__h3">Operator</h3>
            {current.length === 0 ? (
              <p className="adm__sub">
                Anda mengerjakan sendiri. Menunjuk operator bersifat opsional.
              </p>
            ) : (
              <ul className="adm__ops">
                {current.map((d) => (
                  <li key={d.id}>
                    <span>
                      <strong>{user(d.userId)}</strong>{' '}
                      <span className="adm__sub">
                        · {d.letterNo} · sejak {formatDate(d.startDate)}
                        {d.endDate ? ` s.d. ${formatDate(d.endDate)}` : ''}
                      </span>
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        className="text-link adm__danger"
                        onClick={() => setRevoke(d)}
                      >
                        Cabut
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {past.length > 0 && (
              <details className="adm__past">
                <summary>Riwayat operator ({past.length})</summary>
                <ul className="adm__ops is-past">
                  {past.map((d) => (
                    <li key={d.id}>
                      {user(d.userId)} · {formatDate(d.startDate)} –{' '}
                      {d.endDate ? formatDate(d.endDate) : '—'} ·{' '}
                      {END[d.endReason ?? ''] ?? 'berakhir'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        );
      })}
      {dels.length > 0 && <h2 className="adm__h2">Sebagai Operator</h2>}
      {dels.map((d) => {
        const p = pos(d.positionId);
        const by = db.occupancies.find((o) => o.id === d.appointedByOccupancyId);
        return (
          <Card
            key={d.id}
            eyebrow={
              <span className="adm__chips">
                <LineChip line={positionLine(db, p.id)} /> <CapacityChip capacity="operator" />
              </span>
            }
            title={p.name}
            aside={
              <Link className="btn btn--secondary" to={`/jabatan/${p.id}/papan/${year}`}>
                <span>Buka Papan</span>
              </Link>
            }
          >
            <dl className="adm__kv">
              <div>
                <dt>Ditunjuk oleh</dt>
                <dd>{by ? user(by.userId) : '—'}</dd>
              </div>
              <div>
                <dt>Surat</dt>
                <dd className="t-mono">
                  {d.letterNo} · {formatDate(d.letterDate)}
                </dd>
              </div>
              <div>
                <dt>Masa</dt>
                <dd>
                  {formatDate(d.startDate)} – {d.endDate ? formatDate(d.endDate) : 'tanpa batas'}
                </dd>
              </div>
            </dl>
          </Card>
        );
      })}
      {appoint && <AppointDialog positionId={appoint} onClose={() => setAppoint(null)} />}
      <ConfirmDialog
        open={!!revoke}
        destructive
        title={`Cabut ${revoke ? user(revoke.userId) : ''} sebagai operator?`}
        confirmLabel="Cabut Operator"
        onCancel={() => setRevoke(null)}
        onConfirm={async () => {
          try {
            await adminApi.revokeOperator(revoke!.id);
            toast.success('Operator dicabut');
          } catch (e) {
            toast.error('Gagal', (e as Error).message);
          }
          setRevoke(null);
        }}
      >
        Penunjukan berakhir hari ini dan operator diberi tahu. Draf yang sudah disusunnya tetap ada.
      </ConfirmDialog>
    </div>
  );
}

function AppointDialog({ positionId, onClose }: { positionId: string; onClose: () => void }) {
  const auth = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ nip: string; fullName: string }[]>([]);
  const [chosen, setChosen] = useState<{ nip: string; fullName: string } | null>(null);
  const [v, setV] = useState({ letterNo: '', letterDate: auth.today, letterFile: '', endDate: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <SlideOver
      open
      eyebrow="Jabatan Saya"
      title="Tunjuk Operator"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setError(null);
              if (!chosen) {
                setError('Pilih pegawai terlebih dahulu.');
                return;
              }
              setBusy(true);
              try {
                await adminApi.appointOperator({
                  positionId,
                  nip: chosen.nip,
                  ...v,
                  endDate: v.endDate || null,
                });
                toast.success(`${chosen.fullName} ditunjuk sebagai operator`);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Tunjuk Operator
          </Button>
        </>
      }
    >
      <div className="adm__form">
        {error && <InlineAlert variant="error" title={error} />}
        <TextInput
          label="Cari pegawai (NIP atau nama)"
          value={query}
          onChange={async (e) => {
            setQuery(e.target.value);
            setResults(await adminApi.searchStaff(e.target.value));
          }}
        />
        {results.length > 0 && (
          <ul className="adm__picks" role="listbox" aria-label="Pegawai">
            {results.map((r) => (
              <li key={r.nip} role="option" aria-selected={chosen?.nip === r.nip}>
                <button
                  type="button"
                  className={['adm__pick', chosen?.nip === r.nip && 'is-on']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setChosen(r)}
                >
                  <strong>{r.fullName}</strong> <span className="t-mono adm__sub">{r.nip}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <TextInput
          label="Nomor surat penunjukan"
          required
          value={v.letterNo}
          onChange={(e) => setV({ ...v, letterNo: e.target.value })}
        />
        <DatePickerField
          label="Tanggal surat"
          required
          value={v.letterDate}
          onChange={(e) => setV({ ...v, letterDate: e.target.value })}
        />
        <TextInput
          label="Berkas surat (PDF)"
          required
          placeholder="nama-berkas.pdf"
          value={v.letterFile}
          onChange={(e) => setV({ ...v, letterFile: e.target.value })}
        />
        <DatePickerField
          label="Tanggal akhir (opsional)"
          min={auth.today}
          value={v.endDate}
          onChange={(e) => setV({ ...v, endDate: e.target.value })}
        />
      </div>
    </SlideOver>
  );
}
