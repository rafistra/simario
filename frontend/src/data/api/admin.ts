// Administration — PRD ch. 12: users and Pejabat holdings (FR-ADM-004/005), roles and access
// (FR-ADM-001/002/009), monitoring assignments (FR-ADM-006), and Operators (FR-ADM-010).

import { addDays } from '@/domain/calendar';
import { checkAction, hasPermission } from '@/domain/rules/access';
import { PERMISSION_BY_CODE } from '@/domain/permissions';
import type {
  DelegateEndReason,
  MonitoringSupport,
  PositionDelegate,
  PositionOccupancy,
  Scope,
} from '@/domain/types';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { requireActor, type Actor } from '../local/actor';
import { ApiError, call } from '../local/call';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit, writeNotification } from '../local/writers';
import { staffDirectory } from '../seed';

const audit = (
  d: DB,
  a: Actor,
  action: string,
  type: string,
  id: string,
  before: unknown,
  after: unknown,
) =>
  writeAudit(d, {
    at: a.at,
    actorUserId: a.userId,
    actingAs: a.actingAs,
    actingPositionId: null,
    action,
    entityType: type,
    entityId: id,
    before,
    after,
  });

const activeOn = (start: string, end: string | null, day: string) =>
  start <= day && (end === null || end >= day);
const posName = (d: DB, id: string) => d.positions.find((p) => p.id === id)?.name ?? id;
const userName = (d: DB, id: string) => d.users.find((u) => u.id === id)?.fullName ?? id;

/** Ends delegations, notifying the Operators (FR-NTF-011). */
function endDelegations(
  d: DB,
  list: PositionDelegate[],
  reason: DelegateEndReason,
  a: Actor,
): number {
  let n = 0;
  for (const del of list) {
    const x = d.delegates.find((y) => y.id === del.id)!;
    if (x.endDate && x.endDate < a.today) continue;
    x.endDate = addDays(a.today, -1) < x.startDate ? x.startDate : addDays(a.today, -1);
    x.endReason = reason;
    n++;
    if (reason !== 'promoted' && reason !== 'user_deactivated')
      writeNotification(d, {
        userId: x.userId,
        kind: 'operator_revoked',
        text: `Penunjukan Anda sebagai operator untuk ${posName(d, x.positionId)} berakhir`,
        targetUrl: '/jabatan-saya',
        createdAt: a.at,
        eventKey: `op-end:${x.id}`,
      });
  }
  return n;
}

const activeDelegatesOfOccupancy = (d: DB, occId: string, day: string) =>
  d.delegates.filter(
    (x) => x.appointedByOccupancyId === occId && activeOn(x.startDate, x.endDate, day),
  );

function multi(d: DB, positionId: string) {
  const p = d.positions.find((x) => x.id === positionId)!;
  return !!d.positionTypes.find((t) => t.id === p.positionTypeId)?.allowsMultipleOfficials;
}

/** INV-5: at least one active user keeps permission 22. */
function assertManageRolesRemains(d: DB, today: string) {
  if (!d.users.some((u) => u.active && hasPermission(d, u.id, 22, today)))
    throw new ApiError(
      'inv5',
      'Harus tetap ada setidaknya satu pengguna aktif yang dapat mengelola peran dan akses.',
    );
}

export interface AssignInput {
  userId: string;
  positionId: string;
  decreeNo: string;
  decreeDate: string;
  decreeFile: string | null;
  startDate: string;
  isFiller: boolean;
}

export interface ReplaceInput {
  positionId: string;
  outgoingOccupancyId: string;
  incomingUserId: string;
  effectiveDate: string;
  decreeNo: string;
  decreeDate: string;
  decreeFile: string | null;
}

/** What deactivating a user would end (dialog consequences, FR-ADM-004). */
export function deactivationImpact(db: DB, userId: string, today: string) {
  const occ = db.occupancies.filter(
    (o) => o.userId === userId && activeOn(o.startDate, o.endDate, today),
  );
  const dels = db.delegates.filter(
    (x) => x.userId === userId && activeOn(x.startDate, x.endDate, today),
  );
  const appointed = occ.flatMap((o) => activeDelegatesOfOccupancy(db, o.id, today));
  const fillerBlock = occ.find(
    (o) =>
      o.isFiller &&
      multi(db, o.positionId) &&
      db.occupancies.some(
        (x) =>
          x.positionId === o.positionId && x.id !== o.id && activeOn(x.startDate, x.endDate, today),
      ),
  );
  return {
    occupancies: occ.length,
    delegations: dels.length,
    appointedOperators: appointed.length,
    fillerBlock: fillerBlock ? posName(db, fillerBlock.positionId) : null,
  };
}

/** Core appointment, shared with the bulk import (FR-ADM-013). Mutates the draft. */
export function applyAssignment(d: DB, input: AssignInput, a: Actor) {
  const { userId, positionId } = input;
  if (input.startDate > a.today)
    throw new ApiError('validation', 'Tanggal mulai tidak boleh di masa depan.');
  if (!input.decreeNo.trim() || !input.decreeDate)
    throw new ApiError('validation', 'Nomor dan tanggal SK wajib diisi.');
  const user = d.users.find((u) => u.id === userId);
  if (!user?.active) throw new ApiError('validation', 'Pengguna tidak aktif.');
  const current = d.occupancies.filter(
    (o) => o.positionId === positionId && activeOn(o.startDate, o.endDate, a.today),
  );
  if (current.some((o) => o.userId === userId))
    throw new ApiError(
      'validation',
      `${user.fullName} sudah menjadi Pejabat ${posName(d, positionId)}.`,
    );
  const isMulti = multi(d, positionId);
  if (!isMulti && current.length > 0)
    throw new ApiError('occupied', 'Jabatan ini sudah memiliki Pejabat. Gunakan Alih Pejabat.');
  const promoted = d.delegates.filter(
    (x) =>
      x.userId === userId &&
      x.positionId === positionId &&
      activeOn(x.startDate, x.endDate, a.today),
  );
  const ended = endDelegations(d, promoted, 'promoted', a); // INV-13
  const filler = !isMulti || input.isFiller || current.length === 0;
  let fillerChanged = 0;
  if (isMulti && filler) {
    for (const o of current.filter((x) => x.isFiller)) {
      fillerChanged += endDelegations(
        d,
        activeDelegatesOfOccupancy(d, o.id, a.today),
        'filler_changed',
        a,
      );
      d.occupancies.find((x) => x.id === o.id)!.isFiller = false;
    }
  }
  const occ: PositionOccupancy = {
    id: newId('occ'),
    positionId,
    userId,
    isFiller: filler,
    startDate: input.startDate,
    endDate: null,
    decreeNo: input.decreeNo.trim(),
    decreeDate: input.decreeDate,
    decreeFile: input.decreeFile,
  };
  d.occupancies.push(occ);
  audit(d, a, 'tetapkan_jabatan', 'PositionOccupancy', occ.id, null, {
    user: userId,
    position: positionId,
    isFiller: filler,
    promoted: ended,
    fillerChanged,
  });
  return { occupancyId: occ.id, promoted: ended, fillerChanged };
}

function sessionUserId() {
  const id = useSession.getState().userId;
  if (!id) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  return id;
}

export const adminApi = {
  /* ---------- Users (FR-ADM-004) ---------- */

  addUser: (input: {
    nip: string;
    fullName: string;
    email: string;
    orgUnitId: string;
    isLocalAccount: boolean;
  }) =>
    call<{ id: string; tempPassword: string | null }>(() => {
      const a = requireActor([21]);
      const db = getDb();
      const nip = input.nip.trim();
      if (!/^\d{18}$/.test(nip)) throw new ApiError('validation', 'NIP harus 18 digit.');
      if (db.users.some((u) => u.nip === nip))
        throw new ApiError('validation', 'NIP ini sudah terdaftar.');
      if (!input.fullName.trim()) throw new ApiError('validation', 'Nama lengkap wajib diisi.');
      if (!/^[^@\s]+@[^@\s]+$/.test(input.email.trim()))
        throw new ApiError('validation', 'Format email tidak valid.');
      const id = newId('usr');
      const tempPassword = input.isLocalAccount
        ? `Simario-${Math.random().toString(36).slice(2, 8)}!`
        : null;
      mutateDb((d) => {
        d.users.push({
          id,
          nip,
          email: input.email.trim(),
          fullName: input.fullName.trim(),
          isLocalAccount: input.isLocalAccount,
          mustChangePassword: input.isLocalAccount,
          password: tempPassword ?? undefined,
          createdVia: 'admin',
          active: true,
          orgUnitId: input.orgUnitId,
        });
        audit(d, a, 'tambah_pengguna', 'User', id, null, {
          nip,
          fullName: input.fullName.trim(),
          local: input.isLocalAccount,
        });
      });
      return { id, tempPassword };
    }),

  setManualRoles: (userId: string, roleIds: string[]) =>
    call(() => {
      const a = requireActor([22]);
      mutateDb((d) => {
        const before = d.userRoles
          .filter((r) => r.userId === userId && r.source === 'manual')
          .map((r) => r.roleId);
        d.userRoles = [
          ...d.userRoles.filter((r) => !(r.userId === userId && r.source === 'manual')),
          ...roleIds.map((roleId) => ({ userId, roleId, source: 'manual' as const })),
        ];
        assertManageRolesRemains(d, a.today);
        audit(d, a, 'ubah_peran_pengguna', 'User', userId, { roles: before }, { roles: roleIds });
      });
    }),

  assignPosition: (input: AssignInput) =>
    call(() => {
      const a = requireActor([21]);
      let result = { occupancyId: '', promoted: 0, fillerChanged: 0 };
      mutateDb((d) => {
        result = applyAssignment(d, input, a);
      });
      return result;
    }),

  /** FR-ADM-005: closes the old occupancy and opens the new one atomically. Nothing moves. */
  replaceOfficial: (input: ReplaceInput) =>
    call(() => {
      const a = requireActor([21]);
      if (input.effectiveDate > a.today)
        throw new ApiError('validation', 'Tanggal efektif tidak boleh melewati hari ini.');
      if (!input.decreeNo.trim() || !input.decreeDate)
        throw new ApiError('validation', 'Nomor dan tanggal SK wajib diisi.');
      const db = getDb();
      const out = db.occupancies.find(
        (o) => o.id === input.outgoingOccupancyId && o.positionId === input.positionId,
      );
      if (!out || !activeOn(out.startDate, out.endDate, a.today))
        throw new ApiError('validation', 'Pejabat keluar tidak ditemukan.');
      if (out.userId === input.incomingUserId)
        throw new ApiError('validation', 'Pejabat masuk sama dengan Pejabat keluar.');
      if (
        db.occupancies.some(
          (o) =>
            o.positionId === input.positionId &&
            o.userId === input.incomingUserId &&
            activeOn(o.startDate, o.endDate, a.today),
        )
      )
        throw new ApiError('validation', 'Pengguna ini sudah menjadi Pejabat jabatan ini.');
      let summary = { operatorsEnded: 0, promoted: 0 };
      mutateDb((d) => {
        const o = d.occupancies.find((x) => x.id === out.id)!;
        const operatorsEnded = endDelegations(
          d,
          activeDelegatesOfOccupancy(d, o.id, a.today),
          'official_changed',
          a,
        );
        const promoted = endDelegations(
          d,
          d.delegates.filter(
            (x) =>
              x.userId === input.incomingUserId &&
              x.positionId === input.positionId &&
              activeOn(x.startDate, x.endDate, a.today),
          ),
          'promoted',
          a,
        );
        o.endDate =
          addDays(input.effectiveDate, -1) < o.startDate
            ? o.startDate
            : addDays(input.effectiveDate, -1);
        const occ: PositionOccupancy = {
          id: newId('occ'),
          positionId: input.positionId,
          userId: input.incomingUserId,
          isFiller: o.isFiller,
          startDate: input.effectiveDate,
          endDate: null,
          decreeNo: input.decreeNo.trim(),
          decreeDate: input.decreeDate,
          decreeFile: input.decreeFile,
        };
        d.occupancies.push(occ);
        audit(
          d,
          a,
          'alih_pejabat',
          'Position',
          input.positionId,
          { occupancy: o.id, user: o.userId },
          {
            occupancy: occ.id,
            user: input.incomingUserId,
            effectiveDate: input.effectiveDate,
            operatorsEnded,
            promoted,
          },
        );
        summary = { operatorsEnded, promoted };
      });
      return summary;
    }),

  /** Pokja: move the Pengisi mark; Operators appointed by the previous Pengisi end. */
  moveFiller: (positionId: string, toOccupancyId: string) =>
    call(() => {
      const a = requireActor([21]);
      let ended = 0;
      mutateDb((d) => {
        const current = d.occupancies.filter(
          (o) => o.positionId === positionId && activeOn(o.startDate, o.endDate, a.today),
        );
        const to = current.find((o) => o.id === toOccupancyId);
        if (!to) throw new ApiError('validation', 'Anggota tidak ditemukan.');
        for (const o of current.filter((x) => x.isFiller && x.id !== to.id)) {
          ended += endDelegations(
            d,
            activeDelegatesOfOccupancy(d, o.id, a.today),
            'filler_changed',
            a,
          );
          d.occupancies.find((x) => x.id === o.id)!.isFiller = false;
        }
        d.occupancies.find((x) => x.id === to.id)!.isFiller = true;
        audit(d, a, 'pindah_pengisi', 'Position', positionId, null, {
          occupancy: to.id,
          operatorsEnded: ended,
        });
      });
      return ended;
    }),

  resetPassword: (userId: string) =>
    call<string>(() => {
      const a = requireActor([21]);
      const u = getDb().users.find((x) => x.id === userId);
      if (!u?.isLocalAccount)
        throw new ApiError('validation', 'Akun SSO mengatur kata sandinya di Keycloak.');
      const temp = `Simario-${Math.random().toString(36).slice(2, 8)}!`;
      mutateDb((d) => {
        const x = d.users.find((y) => y.id === userId)!;
        x.password = temp;
        x.mustChangePassword = true;
        // Passwords are never recorded in the audit trail (FR-ADM-008).
        audit(d, a, 'atur_ulang_kata_sandi', 'User', userId, null, null);
      });
      return temp;
    }),

  /** Deactivate, never delete: holdings and delegations end; INV-4/INV-5 guards. */
  deactivateUser: (userId: string) =>
    call(() => {
      const a = requireActor([21]);
      const db = getDb();
      const impact = deactivationImpact(db, userId, a.today);
      if (impact.fillerBlock)
        throw new ApiError(
          'filler',
          `Pengguna ini Pengisi ${impact.fillerBlock}. Pindahkan tanda Pengisi ke anggota lain terlebih dahulu.`,
        );
      mutateDb((d) => {
        const u = d.users.find((x) => x.id === userId)!;
        const occ = d.occupancies.filter(
          (o) => o.userId === userId && activeOn(o.startDate, o.endDate, a.today),
        );
        for (const o of occ) {
          endDelegations(d, activeDelegatesOfOccupancy(d, o.id, a.today), 'official_changed', a);
          d.occupancies.find((x) => x.id === o.id)!.endDate =
            addDays(a.today, -1) < o.startDate ? o.startDate : addDays(a.today, -1);
        }
        endDelegations(
          d,
          d.delegates.filter(
            (x) => x.userId === userId && activeOn(x.startDate, x.endDate, a.today),
          ),
          'user_deactivated',
          a,
        );
        u.active = false;
        assertManageRolesRemains(d, a.today);
        audit(
          d,
          a,
          'nonaktifkan_pengguna',
          'User',
          userId,
          { active: true },
          { active: false, ...impact },
        );
      });
      return impact;
    }),

  reactivateUser: (userId: string) =>
    call(() => {
      const a = requireActor([21]);
      mutateDb((d) => {
        d.users.find((x) => x.id === userId)!.active = true;
        audit(d, a, 'aktifkan_pengguna', 'User', userId, { active: false }, { active: true });
      });
    }),

  /* ---------- Roles (FR-ADM-001, 002, 009) ---------- */

  addRole: (name: string) =>
    call<string>(() => {
      const a = requireActor([22]);
      const n = name.trim();
      if (!n) throw new ApiError('validation', 'Nama peran wajib diisi.');
      if (getDb().roles.some((r) => r.name.toLowerCase() === n.toLowerCase()))
        throw new ApiError('validation', 'Nama peran sudah dipakai.');
      const id = newId('role');
      mutateDb((d) => {
        d.roles.push({
          id,
          code: n
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 3),
          name: n,
          isLocked: false,
        });
        audit(d, a, 'tambah_peran', 'Role', id, null, { name: n });
      });
      return id;
    }),

  deleteRole: (roleId: string) =>
    call(() => {
      const a = requireActor([22]);
      const db = getDb();
      const role = db.roles.find((r) => r.id === roleId)!;
      if (role.isLocked) throw new ApiError('locked', 'Peran Superadmin terkunci.');
      const holders = db.userRoles.filter((r) => r.roleId === roleId).length;
      const types = db.positionTypes.filter((t) => t.defaultRoleId === roleId).map((t) => t.name);
      if (holders || types.length)
        throw new ApiError(
          'in_use',
          types.length
            ? `Peran ini menjadi peran bawaan ${types.join(', ')}.`
            : `Peran ini dipegang ${holders} pengguna.`,
        );
      mutateDb((d) => {
        d.roles = d.roles.filter((r) => r.id !== roleId);
        d.rolePermissions = d.rolePermissions.filter((p) => p.roleId !== roleId);
        audit(d, a, 'hapus_peran', 'Role', roleId, { name: role.name }, null);
      });
    }),

  setPermission: (roleId: string, code: number, enabled: boolean, scope: Scope | null) =>
    call(() => {
      const a = requireActor([22]);
      const db = getDb();
      const role = db.roles.find((r) => r.id === roleId)!;
      const def = PERMISSION_BY_CODE.get(code)!;
      if (role.isLocked) throw new ApiError('locked', 'Peran terkunci dan hanya dapat dibaca.');
      if (enabled && !hasPermission(db, a.userId, code, a.today))
        throw new ApiError('forbidden', 'Anda tidak dapat memberikan izin yang tidak Anda miliki.');
      if (enabled && code === 10) {
        const lini3Default = db.positionTypes.some(
          (t) => t.line === 3 && t.defaultRoleId === roleId,
        );
        if (!lini3Default)
          throw new ApiError(
            'validation',
            'Izin 10 hanya dapat diberikan pada peran bawaan jenis jabatan Lini 3 dan Superadmin.',
          );
      }
      mutateDb((d) => {
        const before =
          d.rolePermissions.find((p) => p.roleId === roleId && p.permission === code) ?? null;
        d.rolePermissions = d.rolePermissions.filter(
          (p) => !(p.roleId === roleId && p.permission === code),
        );
        if (enabled)
          d.rolePermissions.push({
            roleId,
            permission: code,
            scope: def.scopeKind === 'scoped' ? (scope ?? 'sendiri') : null,
          });
        assertManageRolesRemains(d, a.today);
        audit(d, a, 'ubah_izin_peran', 'Role', roleId, before, {
          permission: code,
          enabled,
          scope,
        });
      });
    }),

  /* ---------- Monitoring assignments (FR-ADM-006, INV-14) ---------- */

  addAssignments: (input: {
    targets: string[];
    lead: string;
    supports: MonitoringSupport[];
    fromQuarterId: string;
    toQuarterId: string;
    decreeNo: string;
  }) =>
    call(() => {
      const a = requireActor([20]);
      const db = getDb();
      if (input.targets.length === 0)
        throw new ApiError('validation', 'Pilih minimal satu jabatan Lini 1.');
      if (!input.lead) throw new ApiError('validation', 'Penanggung jawab wajib dipilih.');
      if (!input.decreeNo.trim()) throw new ApiError('validation', 'Nomor SK wajib diisi.');
      const key = (id: string) => {
        const q = db.quarters.find((x) => x.id === id)!;
        return q.fiscalYear * 10 + q.number;
      };
      const from = key(input.fromQuarterId);
      const to = key(input.toQuarterId);
      if (from > to)
        throw new ApiError(
          'validation',
          'Triwulan awal harus sebelum atau sama dengan triwulan akhir.',
        );
      for (const t of input.targets) {
        const clash = db.assignments.find(
          (x) =>
            x.targetPositionId === t && key(x.quarterFromId) <= to && from <= key(x.quarterToId),
        );
        if (clash) {
          const qs = db.quarters
            .filter(
              (q) =>
                key(q.id) >= Math.max(from, key(clash.quarterFromId)) &&
                key(q.id) <= Math.min(to, key(clash.quarterToId)),
            )
            .sort((x, y) => key(x.id) - key(y.id));
          const q = qs[0]!;
          throw new ApiError(
            'inv14',
            `${posName(db, t)} sudah memiliki penanggung jawab pada TW ${['I', 'II', 'III', 'IV'][q.number - 1]} TA ${q.fiscalYear}.`,
          );
        }
      }
      mutateDb((d) => {
        for (const t of input.targets) {
          const id = newId('asg');
          d.assignments.push({
            id,
            targetPositionId: t,
            leadPositionId: input.lead,
            supports: input.supports,
            quarterFromId: input.fromQuarterId,
            quarterToId: input.toQuarterId,
            decreeNo: input.decreeNo.trim(),
          });
          audit(d, a, 'tambah_penugasan', 'MonitoringAssignment', id, null, {
            target: t,
            lead: input.lead,
            from: input.fromQuarterId,
            to: input.toQuarterId,
          });
        }
      });
    }),

  removeAssignment: (id: string) =>
    call(() => {
      const a = requireActor([20]);
      mutateDb((d) => {
        const before = d.assignments.find((x) => x.id === id);
        d.assignments = d.assignments.filter((x) => x.id !== id);
        audit(d, a, 'hapus_penugasan', 'MonitoringAssignment', id, before ?? null, null);
      });
    }),

  /* ---------- Operators (FR-ADM-010) ---------- */

  searchStaff: (query: string) =>
    call(() => {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      const db = getDb();
      const known = db.users.map((u) => ({
        nip: u.nip,
        fullName: u.fullName,
        email: u.email,
        orgUnitId: u.orgUnitId ?? '',
      }));
      const all = [...known, ...staffDirectory.filter((s) => !known.some((k) => k.nip === s.nip))];
      return all
        .filter((s) => s.fullName.toLowerCase().includes(q) || s.nip.includes(q))
        .slice(0, 8);
    }),

  appointOperator: (input: {
    positionId: string;
    nip: string;
    letterNo: string;
    letterDate: string;
    letterFile: string;
    endDate: string | null;
  }) =>
    call(() => {
      const userId = sessionUserId();
      const db = getDb();
      const actor = requireActor([]);
      const res = checkAction(db, userId, 11, input.positionId, actor.today);
      if (!res.ok)
        throw new ApiError(
          'forbidden',
          'Menunjuk operator hanya dapat dilakukan Pejabat (Pokja: Pengisi).',
        );
      if (!input.letterNo.trim() || !input.letterDate || !input.letterFile)
        throw new ApiError('validation', 'Nomor surat, tanggal, dan berkas PDF wajib diisi.');
      if (input.endDate && input.endDate < actor.today)
        throw new ApiError('validation', 'Tanggal akhir tidak boleh sebelum hari ini.');
      const staff =
        db.users.find((u) => u.nip === input.nip) ??
        staffDirectory.find((s) => s.nip === input.nip);
      if (!staff) throw new ApiError('validation', 'Pegawai tidak ditemukan.');
      const existing = db.users.find((u) => u.nip === input.nip);
      if (
        existing &&
        db.occupancies.some(
          (o) =>
            o.userId === existing.id &&
            o.positionId === input.positionId &&
            activeOn(o.startDate, o.endDate, actor.today),
        )
      )
        throw new ApiError('inv13', `Pegawai ini sudah Pejabat ${posName(db, input.positionId)}.`);
      if (
        existing &&
        db.delegates.some(
          (x) =>
            x.userId === existing.id &&
            x.positionId === input.positionId &&
            activeOn(x.startDate, x.endDate, actor.today),
        )
      )
        throw new ApiError(
          'validation',
          `Pegawai ini sudah Operator ${posName(db, input.positionId)}.`,
        );
      const occ = db.occupancies.find((o) => o.id === res.holding.id)!;
      let operatorId = existing?.id ?? '';
      mutateDb((d) => {
        if (!existing) {
          operatorId = newId('usr');
          const s = staff as (typeof staffDirectory)[number];
          d.users.push({
            id: operatorId,
            nip: s.nip,
            email: s.email,
            fullName: s.fullName,
            isLocalAccount: false,
            mustChangePassword: false,
            createdVia: 'delegation',
            active: true,
            orgUnitId: s.orgUnitId,
          });
        }
        const id = newId('del');
        d.delegates.push({
          id,
          positionId: input.positionId,
          userId: operatorId,
          appointedByOccupancyId: occ.id,
          letterNo: input.letterNo.trim(),
          letterDate: input.letterDate,
          letterFile: input.letterFile,
          startDate: actor.today,
          endDate: input.endDate,
          endReason: null,
        });
        writeNotification(d, {
          userId: operatorId,
          kind: 'operator_appointed',
          text: `Anda ditunjuk sebagai operator untuk ${posName(d, input.positionId)} oleh ${userName(d, userId)}`,
          targetUrl: '/jabatan-saya',
          createdAt: actor.at,
          eventKey: `op-new:${id}`,
        });
        writeAudit(d, {
          at: actor.at,
          actorUserId: userId,
          actingAs: 'pejabat',
          actingPositionId: input.positionId,
          action: 'tunjuk_operator',
          entityType: 'PositionDelegate',
          entityId: id,
          before: null,
          after: { user: operatorId, letterNo: input.letterNo.trim() },
        });
      });
      return operatorId;
    }),

  revokeOperator: (delegateId: string) =>
    call(() => {
      const userId = sessionUserId();
      const actor = requireActor([]);
      const db = getDb();
      const del = db.delegates.find((x) => x.id === delegateId);
      if (!del) throw new ApiError('not_found', 'Operator tidak ditemukan.');
      if (!checkAction(db, userId, 11, del.positionId, actor.today).ok)
        throw new ApiError(
          'forbidden',
          'Mencabut operator hanya dapat dilakukan Pejabat (Pokja: Pengisi).',
        );
      mutateDb((d) => {
        endDelegations(d, [del], 'revoked', actor);
        writeAudit(d, {
          at: actor.at,
          actorUserId: userId,
          actingAs: 'pejabat',
          actingPositionId: del.positionId,
          action: 'cabut_operator',
          entityType: 'PositionDelegate',
          entityId: del.id,
          before: null,
          after: { endReason: 'revoked' },
        });
      });
    }),
};

/** Scheduled: delegations past their end date are closed as expired (FR-ADM-010). */
export function expireDelegations(d: DB, at: string) {
  const today = at.slice(0, 10);
  for (const x of d.delegates)
    if (x.endDate && x.endDate < today && !x.endReason) x.endReason = 'expired';
}
