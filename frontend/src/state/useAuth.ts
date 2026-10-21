// Signed-in context for pages: user, holdings, acting holding, permissions, role views — built
// from GET /api/v1/me (state/me.ts). The acting position and role view are chosen locally.

import { useMemo } from 'react';
import type { MeResponse } from '@/data/http/me';
import type { RoleViewCode } from '@/domain/permissions';
import type { Holding } from '@/domain/rules/access';
import type { Position, Quarter, Scope } from '@/domain/types';
import { today as todayFn } from './clock';
import { useMe } from './me';
import { useSession } from './session';

export interface AuthUser {
  id: string;
  nip: string;
  email: string;
  fullName: string;
  isLocalAccount: boolean;
  mustChangePassword: boolean;
  orgUnitId: string | null;
}

export interface AuthContext {
  user: AuthUser;
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

export function authFromMe(
  me: MeResponse,
  activePositionId: string | null,
  chosenView: RoleViewCode | null,
): AuthContext {
  const holdings = me.holdings as unknown as (Holding & {
    position: Position;
    unitCode: string;
    officialName: string | null;
    roleView: RoleViewCode | null;
  })[];
  const picked =
    holdings.find((h) => h.positionId === activePositionId) ??
    holdings.find((h) => h.positionId === me.activePositionId) ??
    holdings[0] ??
    null;
  const roleViews = me.roleViews as RoleViewCode[];
  const permissions = new Map(me.permissions.map((p) => [p.code, p.scope as Scope | null]));
  const active = picked
    ? (({ roleView: _view, ...h }) => {
        void _view;
        return h;
      })(picked)
    : null;
  // Default view: the acting holding's line role, else the last role view.
  const roleView =
    chosenView && roleViews.includes(chosenView)
      ? chosenView
      : (picked?.roleView ?? roleViews[roleViews.length - 1] ?? null);
  return {
    user: me.user as AuthUser,
    today: me.today,
    holdings: holdings.map(({ kind, id, positionId, capacity, line, isFiller }) => ({
      kind,
      id,
      positionId,
      capacity,
      line,
      isFiller,
    })),
    active,
    permissions,
    can: (code) => permissions.has(code),
    roleViews,
    roleView,
    currentQuarter: (me.currentQuarter ?? undefined) as Quarter | undefined,
    currentFiscalYear: Number(me.today.slice(0, 4)),
  };
}

/** Throws when nobody is signed in — use inside the authenticated shell only. */
export function useAuth(): AuthContext {
  const ctx = useMaybeAuth();
  if (!ctx) throw new Error('useAuth outside an authenticated route');
  return ctx;
}

export function useMaybeAuth(): AuthContext | null {
  const me = useMe((s) => s.me);
  const { activePositionId, roleView } = useSession();
  return useMemo(
    () => (me ? authFromMe(me, activePositionId, roleView) : null),
    [me, activePositionId, roleView],
  );
}

export const todayNow = todayFn;
