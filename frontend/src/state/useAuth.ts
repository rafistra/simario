// Derived signed-in context: user, holdings, acting holding, permissions, role views.

import { useMemo } from 'react';
import { useDb } from '@/data/local/store';
import type { DB } from '@/data/db';
import { quarterContaining } from '@/domain/calendar';
import type { RoleViewCode } from '@/domain/permissions';
import {
  effectiveRoleIds,
  finalisingOfficial,
  holdingsOf,
  permissionScopes,
  type Holding,
} from '@/domain/rules/access';
import type { Position, Quarter, Scope, User } from '@/domain/types';
import { today as todayFn, useNow } from './clock';
import { useSession } from './session';

export interface AuthContext {
  user: User;
  today: string;
  holdings: Holding[];
  /** The holding the user acts through (switcher card); null when holding no position. */
  active: (Holding & { position: Position; unitCode: string; officialName: string | null }) | null;
  permissions: Map<number, Scope | null>;
  can: (code: number) => boolean;
  roleViews: RoleViewCode[];
  roleView: RoleViewCode | null;
  currentQuarter: Quarter | undefined;
  currentFiscalYear: number;
}

const VIEW_ORDER: RoleViewCode[] = ['PMR', 'PMT', 'PJM', 'PMD', 'SAD'];

export function buildAuthContext(
  db: DB,
  userId: string,
  day: string,
  activePositionId: string | null,
  chosenView: RoleViewCode | null,
): AuthContext | null {
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.active) return null;
  const holdings = holdingsOf(db, userId, day);
  const holding = holdings.find((h) => h.positionId === activePositionId) ?? holdings[0] ?? null;
  const permissions = permissionScopes(db, userId, day);
  const roleCodes = effectiveRoleIds(db, userId, day)
    .map((id) => db.roles.find((r) => r.id === id)?.code as RoleViewCode)
    .filter(Boolean);
  const roleViews = VIEW_ORDER.filter((v) => roleCodes.includes(v));

  let active: AuthContext['active'] = null;
  if (holding) {
    const position = db.positions.find((p) => p.id === holding.positionId)!;
    active = {
      ...holding,
      position,
      unitCode: db.orgUnits.find((o) => o.id === position.orgUnitId)?.code ?? '',
      officialName: finalisingOfficial(db, position.id, day)?.fullName ?? null,
    };
  }

  // Default view: the acting holding's line role, else the first manual role.
  const holdingView = active
    ? (db.roles.find(
        (r) =>
          r.id ===
          db.positionTypes.find((t) => t.id === active!.position.positionTypeId)?.defaultRoleId,
      )?.code as RoleViewCode | undefined)
    : undefined;
  const roleView =
    chosenView && roleViews.includes(chosenView)
      ? chosenView
      : (holdingView ?? roleViews[roleViews.length - 1] ?? null);

  return {
    user,
    today: day,
    holdings,
    active,
    permissions,
    can: (code) => permissions.has(code),
    roleViews,
    roleView,
    currentQuarter: quarterContaining(db.quarters, day),
    currentFiscalYear: Number(day.slice(0, 4)),
  };
}

/** Throws when nobody is signed in — use inside the authenticated shell only. */
export function useAuth(): AuthContext {
  const ctx = useMaybeAuth();
  if (!ctx) throw new Error('useAuth outside an authenticated route');
  return ctx;
}

export function useMaybeAuth(): AuthContext | null {
  const db = useDb((s) => s.db);
  const { userId, activePositionId, roleView } = useSession();
  const day = useNow(60_000).slice(0, 10);
  return useMemo(
    () => (userId ? buildAuthContext(db, userId, day, activePositionId, roleView) : null),
    [db, userId, day, activePositionId, roleView],
  );
}

export const todayNow = todayFn;
