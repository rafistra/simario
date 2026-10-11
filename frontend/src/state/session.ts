// Signed-in session (prototype: no Keycloak). Persisted so a reload keeps the user signed in.

import { create } from 'zustand';
import type { RoleViewCode } from '@/domain/permissions';
import type { ISODateTime } from '@/domain/types';

interface Lockout {
  fails: number;
  until: ISODateTime | null;
}

interface SessionState {
  userId: string | null;
  /** Position of the acting holding chosen in the switcher (FR-AUT-009). */
  activePositionId: string | null;
  /** Role view selected in the user menu (menu only, never a permission check). */
  roleView: RoleViewCode | null;
  /** Local-account failed attempts per NIP (FR-AUT-002). */
  lockouts: Record<string, Lockout>;
  /** Last-used position per user (FR-AUT-009). */
  lastPosition: Record<string, string>;
  signIn: (userId: string) => void;
  signOut: () => void;
  setActivePosition: (positionId: string) => void;
  setRoleView: (view: RoleViewCode) => void;
  setLockout: (nip: string, lockout: Lockout | null) => void;
}

const KEY = 'simario:session';

type Persisted = Pick<
  SessionState,
  'userId' | 'activePositionId' | 'roleView' | 'lockouts' | 'lastPosition'
>;

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { lockouts: {}, lastPosition: {}, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { userId: null, activePositionId: null, roleView: null, lockouts: {}, lastPosition: {} };
}

export const useSession = create<SessionState>((set, get) => {
  const persist = () => {
    const { userId, activePositionId, roleView, lockouts, lastPosition } = get();
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ userId, activePositionId, roleView, lockouts, lastPosition }),
      );
    } catch {
      // ignore
    }
  };
  return {
    ...load(),
    signIn: (userId) => {
      set({ userId, activePositionId: get().lastPosition[userId] ?? null, roleView: null });
      persist();
    },
    signOut: () => {
      set({ userId: null, activePositionId: null, roleView: null });
      persist();
    },
    setActivePosition: (positionId) => {
      const { userId, lastPosition } = get();
      set({
        activePositionId: positionId,
        roleView: null,
        lastPosition: userId ? { ...lastPosition, [userId]: positionId } : lastPosition,
      });
      persist();
    },
    setRoleView: (view) => {
      set({ roleView: view });
      persist();
    },
    setLockout: (nip, lockout) => {
      const lockouts = { ...get().lockouts };
      if (lockout) lockouts[nip] = lockout;
      else delete lockouts[nip];
      set({ lockouts });
      persist();
    },
  };
});
