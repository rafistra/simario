// Access rules — PRD §1.4, §1.5, FR-ADM-002, RB-ADM-001:
// permission (capability) → holding / assignment / line rule (object) → Pejabat (finalising).
// Role names are never consulted (RB-ADM-002).

import type { DB } from '@/test/fake/db';
import { PERMISSION_BY_CODE } from '../permissions';
import type { Capacity, ISODate, Line, Position, Quarter, Scope } from '../types';

export interface Holding {
  kind: 'occupancy' | 'delegate';
  id: string;
  positionId: string;
  capacity: Capacity;
  line: Line;
  /** Occupancy: is the Pengisi (always true for single-Pejabat positions). */
  isFiller: boolean;
}

const activeOn = (start: ISODate, end: ISODate | null, today: ISODate) =>
  start <= today && (end === null || end >= today);

export function positionLine(db: DB, positionId: string): Line {
  const pos = db.positions.find((p) => p.id === positionId);
  return db.positionTypes.find((t) => t.id === pos?.positionTypeId)?.line ?? 1;
}

/** Active holdings of a user on `today`, Pejabat first. INV-11: a delegation needs its appointer active and Pengisi. */
export function holdingsOf(db: DB, userId: string, today: ISODate): Holding[] {
  const user = db.users.find((u) => u.id === userId);
  if (!user?.active) return [];
  const occ = db.occupancies
    .filter((o) => o.userId === userId && activeOn(o.startDate, o.endDate, today))
    .map<Holding>((o) => ({
      kind: 'occupancy',
      id: o.id,
      positionId: o.positionId,
      capacity: 'pejabat',
      line: positionLine(db, o.positionId),
      isFiller: o.isFiller,
    }));
  const del = db.delegates
    .filter((d) => d.userId === userId && activeOn(d.startDate, d.endDate, today))
    .filter((d) => {
      const appointer = db.occupancies.find((o) => o.id === d.appointedByOccupancyId);
      return (
        appointer && appointer.isFiller && activeOn(appointer.startDate, appointer.endDate, today)
      );
    })
    .map<Holding>((d) => ({
      kind: 'delegate',
      id: d.id,
      positionId: d.positionId,
      capacity: 'operator',
      line: positionLine(db, d.positionId),
      isFiller: false,
    }));
  return [...occ, ...del].sort((a, b) => a.line - b.line);
}

/** Manual roles + the default role of every held position type (§1.4.3). */
export function effectiveRoleIds(db: DB, userId: string, today: ISODate): string[] {
  const manual = db.userRoles.filter((r) => r.userId === userId).map((r) => r.roleId);
  const fromHoldings = holdingsOf(db, userId, today).map((h) => {
    const pos = db.positions.find((p) => p.id === h.positionId)!;
    return db.positionTypes.find((t) => t.id === pos.positionTypeId)!.defaultRoleId;
  });
  return [...new Set([...manual, ...fromHoldings])];
}

const SCOPE_RANK: Record<Scope, number> = { sendiri: 0, unit: 1, semua: 2 };

/** Union of all roles' permissions; the widest scope wins. */
export function permissionScopes(
  db: DB,
  userId: string,
  today: ISODate,
): Map<number, Scope | null> {
  const roles = effectiveRoleIds(db, userId, today);
  const out = new Map<number, Scope | null>();
  for (const rp of db.rolePermissions) {
    if (!roles.includes(rp.roleId)) continue;
    const prev = out.get(rp.permission);
    if (prev === undefined || (rp.scope && (!prev || SCOPE_RANK[rp.scope] > SCOPE_RANK[prev])))
      out.set(rp.permission, rp.scope);
  }
  return out;
}

export function hasPermission(db: DB, userId: string, code: number, today: ISODate): boolean {
  return permissionScopes(db, userId, today).has(code);
}

const quarterKey = (q: Pick<Quarter, 'fiscalYear' | 'number'>) => q.fiscalYear * 10 + q.number;

/** Lini 2 positions assigned to a Lini 1 position for a quarter (lead + supports). */
export function assignedLini2(db: DB, lini1PositionId: string, quarterId: string): string[] {
  const q = db.quarters.find((x) => x.id === quarterId);
  if (!q) return [];
  const key = quarterKey(q);
  return db.assignments
    .filter((a) => a.targetPositionId === lini1PositionId)
    .filter((a) => {
      const from = db.quarters.find((x) => x.id === a.quarterFromId)!;
      const to = db.quarters.find((x) => x.id === a.quarterToId)!;
      return quarterKey(from) <= key && key <= quarterKey(to);
    })
    .flatMap((a) => [a.leadPositionId, ...a.supports.map((s) => s.positionId)]);
}

/** Lini 1 positions assigned to any Lini 2 position the user holds, optionally within one fiscal year. */
function monitoredPositions(db: DB, lini2PositionIds: string[], fiscalYear?: number): string[] {
  return db.assignments
    .filter((a) =>
      [a.leadPositionId, ...a.supports.map((s) => s.positionId)].some((p) =>
        lini2PositionIds.includes(p),
      ),
    )
    .filter((a) => {
      if (fiscalYear === undefined) return true;
      const from = db.quarters.find((x) => x.id === a.quarterFromId)!;
      const to = db.quarters.find((x) => x.id === a.quarterToId)!;
      return from.fiscalYear <= fiscalYear && fiscalYear <= to.fiscalYear;
    })
    .map((a) => a.targetPositionId);
}

const isLini1 = (db: DB, p: Position) =>
  db.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1;

/**
 * Lini 1 positions the user may see under a scoped permission (default 1, view register and
 * board) — §1.5. Lini 2 "Own" covers positions assigned in any quarter of the viewed fiscal year.
 */
export function lini1PositionsInScope(
  db: DB,
  userId: string,
  today: ISODate,
  code = 1,
  fiscalYear?: number,
): string[] {
  const scope = permissionScopes(db, userId, today).get(code);
  if (scope === undefined) return [];
  const lini1 = db.positions.filter((p) => isLini1(db, p));
  if (scope === 'semua') return lini1.map((p) => p.id);
  const holdings = holdingsOf(db, userId, today);
  if (scope === 'unit') {
    const units = new Set(
      holdings.map((h) => db.positions.find((p) => p.id === h.positionId)!.orgUnitId),
    );
    const user = db.users.find((u) => u.id === userId);
    if (user?.orgUnitId) units.add(user.orgUnitId);
    return lini1.filter((p) => units.has(p.orgUnitId)).map((p) => p.id);
  }
  const own = holdings.filter((h) => h.line === 1).map((h) => h.positionId);
  const monitored = monitoredPositions(
    db,
    holdings.filter((h) => h.line === 2).map((h) => h.positionId),
    fiscalYear,
  );
  return [...new Set([...own, ...monitored])];
}

export function canViewPosition(
  db: DB,
  userId: string,
  lini1PositionId: string,
  today: ISODate,
  fiscalYear?: number,
) {
  return lini1PositionsInScope(db, userId, today, 1, fiscalYear).includes(lini1PositionId);
}

/**
 * Read access to a Lini 1 position's workspace data (§1.5): any holding on the position, or a
 * permission-1 scope that covers it for the viewed fiscal year. Checked by every read model, not
 * only by the route.
 */
export function canReadPosition(
  db: DB,
  userId: string,
  lini1PositionId: string,
  today: ISODate,
  fiscalYear?: number,
) {
  return (
    holdingsOf(db, userId, today).some((h) => h.positionId === lini1PositionId) ||
    canViewPosition(db, userId, lini1PositionId, today, fiscalYear)
  );
}

/**
 * The holding through which a user participates in a Lini 1 position's threads for a quarter
 * (§1.5, permission 6): its own holders, the Lini 2 positions assigned for that quarter, any Lini 3
 * holder. Returns null for readers.
 */
export function participationHolding(
  db: DB,
  userId: string,
  lini1PositionId: string,
  quarterId: string,
  today: ISODate,
): Holding | null {
  if (!hasPermission(db, userId, 6, today)) return null;
  const holdings = holdingsOf(db, userId, today);
  const own = holdings.find((h) => h.positionId === lini1PositionId);
  if (own) return own;
  const lini2 = assignedLini2(db, lini1PositionId, quarterId);
  const monitor = holdings.find((h) => h.line === 2 && lini2.includes(h.positionId));
  if (monitor) return monitor;
  return holdings.find((h) => h.line === 3) ?? null;
}

export type DenyReason = 'permission' | 'holding' | 'official' | 'filler';

/**
 * Content actions (INV-25) from the acting position: requires the permission, a holding on that
 * position, Pejabat/Pengisi for requires_official (INV-12), and Pengisi or Operator for drafting on
 * multi-Pejabat positions (INV-24).
 */
export function checkAction(
  db: DB,
  userId: string,
  code: number,
  actingPositionId: string,
  today: ISODate,
): { ok: true; holding: Holding } | { ok: false; reason: DenyReason } {
  const def = PERMISSION_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown permission ${code}`);
  if (!hasPermission(db, userId, code, today)) return { ok: false, reason: 'permission' };
  const holding = holdingsOf(db, userId, today).find((h) => h.positionId === actingPositionId);
  if (!holding) return { ok: false, reason: 'holding' };
  if (def.requiresOfficial && !(holding.capacity === 'pejabat' && holding.isFiller))
    return { ok: false, reason: holding.capacity === 'operator' ? 'official' : 'filler' };
  if (def.isDrafting && holding.capacity === 'pejabat' && !holding.isFiller) {
    const type = db.positionTypes.find(
      (t) => t.id === db.positions.find((p) => p.id === actingPositionId)?.positionTypeId,
    );
    if (type?.allowsMultipleOfficials) return { ok: false, reason: 'filler' };
  }
  return { ok: true, holding };
}

/** The Pejabat (Pokja: Pengisi) who performs finalising actions — for "Dilakukan oleh [Nama Pejabat]". */
export function finalisingOfficial(db: DB, positionId: string, today: ISODate) {
  const occ = db.occupancies.find(
    (o) => o.positionId === positionId && o.isFiller && activeOn(o.startDate, o.endDate, today),
  );
  return occ ? (db.users.find((u) => u.id === occ.userId) ?? null) : null;
}

/** Current Pejabat holders (all Pokja members) of a position. */
export function officialsOf(db: DB, positionId: string, today: ISODate) {
  return db.occupancies
    .filter((o) => o.positionId === positionId && activeOn(o.startDate, o.endDate, today))
    .map((o) => ({ occupancy: o, user: db.users.find((u) => u.id === o.userId)! }));
}
