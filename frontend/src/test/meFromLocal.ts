// Test helper: the GET /api/v1/me response the backend would give, computed from the local seed
// with the prototype's access rules (the logic useAuth used before B1).

import type { DB } from '@/test/fake/db';
import type { MeResponse } from '@/data/http/me';
import { quarterContaining } from '@/domain/calendar';
import type { RoleViewCode } from '@/domain/permissions';
import {
  effectiveRoleIds,
  finalisingOfficial,
  holdingsOf,
  permissionScopes,
} from '@/domain/rules/access';
import { now } from '@/state/clock';

const VIEW_ORDER: RoleViewCode[] = ['PMR', 'PMT', 'PJM', 'PMD', 'SAD'];

export function meFromLocal(db: DB, userId: string, day: string): MeResponse | null {
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.active) return null;
  const roleCode = (roleId: string) => db.roles.find((r) => r.id === roleId)?.code ?? null;
  const holdings = holdingsOf(db, userId, day).map((h) => {
    const position = db.positions.find((p) => p.id === h.positionId)!;
    const type = db.positionTypes.find((t) => t.id === position.positionTypeId)!;
    return {
      ...h,
      position: {
        ...position,
        deactivatedAt: position.deactivatedAt ?? null,
        deactivationReason: position.deactivationReason ?? null,
        shortName: position.shortName ?? null,
      },
      unitCode: db.orgUnits.find((o) => o.id === position.orgUnitId)?.code ?? '',
      officialName: finalisingOfficial(db, position.id, day)?.fullName ?? null,
      roleView: roleCode(type.defaultRoleId),
    };
  });
  const codes = effectiveRoleIds(db, userId, day).map(roleCode);
  const me = {
    user: {
      id: user.id,
      nip: user.nip,
      email: user.email,
      fullName: user.fullName,
      isLocalAccount: user.isLocalAccount,
      mustChangePassword: user.mustChangePassword,
      orgUnitId: user.orgUnitId ?? null,
    },
    serverNow: now(),
    today: day,
    devTools: true,
    holdings,
    activePositionId: null,
    permissions: [...permissionScopes(db, userId, day).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([code, scope]) => ({ code, scope })),
    roleViews: VIEW_ORDER.filter((v) => codes.includes(v)),
    currentQuarter: quarterContaining(db.quarters, day) ?? null,
  };
  return me as unknown as MeResponse;
}
