// The signed-in actor for repository calls: who acts, and checks that they may.

import { canReadPosition, hasPermission } from '@/domain/rules/access';
import type { AuditLog, ISODate } from '@/domain/types';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { ApiError } from './call';
import { getDb } from './store';

export interface Actor {
  userId: string;
  at: string;
  today: string;
  actingAs: AuditLog['actingAs'];
}

/** Resolves the actor and enforces at least one of the permission codes (server-side check). */
export function requireActor(anyOf: number[]): Actor {
  const userId = useSession.getState().userId;
  if (!userId) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  const at = now();
  const today = at.slice(0, 10);
  const db = getDb();
  if (anyOf.length && !anyOf.some((c) => hasPermission(db, userId, c, today)))
    throw new ApiError('forbidden', 'Anda tidak memiliki akses untuk tindakan ini.');
  // Audit label only: configuration actors are recorded as superadmin when they can manage roles.
  const configAdmin = hasPermission(db, userId, 22, today);
  return { userId, at, today, actingAs: configAdmin ? 'superadmin' : 'pengelola' };
}

/** Read models (permission 1, §1.5): refuses viewers without a holding or scope over the position. */
export function assertCanRead(
  db: DB,
  userId: string,
  lini1PositionId: string,
  today: ISODate,
  fiscalYear?: number,
) {
  if (!canReadPosition(db, userId, lini1PositionId, today, fiscalYear))
    throw new ApiError('forbidden', 'Anda tidak memiliki akses ke jabatan ini.');
}
