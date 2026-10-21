import { Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, InlineAlert, PageHeader, TextInput, toast } from '@/components';
import { adminApi } from '@/data/repository';
import { useGateDb } from '@/components/DataGate/gateDb';
import { PERMISSIONS, type PermissionGroup } from '@/domain/permissions';
import type { Scope } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { initials } from '@/lib/format';
import './Admin.css';

const GROUPS: PermissionGroup[] = [
  'Lini 1',
  'Papan',
  'Lini 3',
  'Delegasi',
  'Master Data',
  'Administrasi',
  'Audit',
  'Pengawasan',
];
const SCOPE_LABEL: Record<Scope, string> = { sendiri: 'Sendiri', unit: 'Unit', semua: 'Semua' };

/** /pengaturan/peran — FR-ADM-001, 002, 003, 009. */
export default function RolesPage() {
  usePageMeta(['Pengaturan', 'Peran']);
  const db = useGateDb();
  const [selected, setSelected] = useState(db.roles[1]?.id ?? db.roles[0]!.id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const role = db.roles.find((r) => r.id === selected) ?? db.roles[0]!;
  const usedBy = db.positionTypes.filter((t) => t.defaultRoleId === role.id).map((t) => t.name);
  const holders = db.userRoles.filter((r) => r.roleId === role.id).length;
  const grant = (code: number) =>
    db.rolePermissions.find((p) => p.roleId === role.id && p.permission === code);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Pengaturan"
        title="Peran dan Izin"
        subtitle="Peran memegang izin; jabatan memberi peran bawaan; tindakan konten tetap memerlukan holding pada jabatan yang bertindak."
      />
      <div className="roles">
        <aside className="roles__list" aria-label="Daftar peran">
          {db.roles.map((r) => {
            const types = db.positionTypes.filter((t) => t.defaultRoleId === r.id).length;
            const users = db.userRoles.filter((x) => x.roleId === r.id).length;
            return (
              <button
                key={r.id}
                type="button"
                className={['roles__item', r.id === role.id && 'is-active']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelected(r.id)}
                aria-pressed={r.id === role.id}
              >
                <span className="roles__badge">{initials(r.name)}</span>
                <span className="roles__name">
                  {r.name}
                  <span className="adm__sub">
                    {types ? `bawaan ${types} jenis jabatan` : `${users} pengguna`}
                  </span>
                </span>
                {r.isLocked && <Lock aria-label="Terkunci" className="roles__lock" />}
              </button>
            );
          })}
          {adding ? (
            <div className="roles__add">
              <TextInput
                label="Nama peran"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <div className="adm__actions">
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Batal
                </Button>
                <Button
                  onClick={() =>
                    void run(async () => {
                      const id = await adminApi.addRole(name);
                      setSelected(id);
                      setAdding(false);
                      setName('');
                    }, 'Peran ditambahkan')
                  }
                >
                  Simpan
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
              Tambah Peran
            </Button>
          )}
        </aside>
        <section className="roles__panel" aria-labelledby="role-title">
          <header className="roles__head">
            <div>
              <h2 id="role-title" className="roles__title">
                {role.name}
              </h2>
              <p className="adm__sub">
                {usedBy.length
                  ? `Peran bawaan: ${usedBy.join(', ')}`
                  : `Peran manual · ${holders} pengguna`}
              </p>
            </div>
            {!role.isLocked && (
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={() =>
                  void run(() => adminApi.deleteRole(role.id), 'Peran dihapus').then(() =>
                    setSelected(db.roles[0]!.id),
                  )
                }
              >
                Hapus Peran
              </Button>
            )}
          </header>
          {role.isLocked && (
            <InlineAlert variant="info" title="Peran terkunci">
              Superadmin memegang semua izin dan hanya dapat dibaca. Tindakan konten tetap
              memerlukan holding (INV-25).
            </InlineAlert>
          )}
          {error && <InlineAlert variant="error" title={error} />}
          <table className="perm">
            <caption className="sr-only">Izin peran {role.name}</caption>
            <thead>
              <tr>
                <th scope="col">Izin</th>
                <th scope="col">Aktif</th>
                <th scope="col">Cakupan</th>
              </tr>
            </thead>
            {GROUPS.map((g) => (
              <tbody key={g}>
                <tr className="perm__group">
                  <th colSpan={3} scope="colgroup">
                    {g}
                  </th>
                </tr>
                {PERMISSIONS.filter((p) => p.group === g).map((p) => {
                  const gr = grant(p.code);
                  return (
                    <tr key={p.code}>
                      <th scope="row" className="perm__label">
                        <span className="t-mono perm__code">{p.code}</span> {p.label}
                        {p.requiresOfficial && <span className="perm__tag">Hanya Pejabat</span>}
                        {p.isDrafting && (
                          <span className="perm__tag perm__tag--draft">Penyusunan</span>
                        )}
                      </th>
                      <td>
                        <input
                          type="checkbox"
                          className="perm__check"
                          aria-label={`Aktifkan izin ${p.code} ${p.label}`}
                          checked={!!gr}
                          disabled={role.isLocked}
                          onChange={(e) =>
                            void run(() =>
                              adminApi.setPermission(
                                role.id,
                                p.code,
                                e.target.checked,
                                gr?.scope ?? 'sendiri',
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        {p.scopeKind === 'scoped' ? (
                          <select
                            className="control control--select perm__scope"
                            aria-label={`Cakupan izin ${p.code}`}
                            value={gr?.scope ?? 'sendiri'}
                            disabled={!gr || role.isLocked}
                            onChange={(e) =>
                              void run(() =>
                                adminApi.setPermission(
                                  role.id,
                                  p.code,
                                  true,
                                  e.target.value as Scope,
                                ),
                              )
                            }
                          >
                            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                              <option key={s} value={s}>
                                {SCOPE_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="adm__sub">
                            {p.scopeKind === 'own' ? 'Hanya Sendiri' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </section>
      </div>
    </div>
  );
}
