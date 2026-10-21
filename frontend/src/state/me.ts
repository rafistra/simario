// Signed-in context from the backend (GET /api/v1/me, spec §4.10). Namespaces that are still
// local read the actor from useSession, so a loaded /me also signs the same user in locally (the
// id bridge already turned its ids into prototype ids).

import { create } from 'zustand';
import { ApiError } from '@/data/errors';
import { authApi } from '@/data/http/auth';
import { meApi, type MeResponse } from '@/data/http/me';
import { minutesBetween, now, useClock } from './clock';
import { useSession } from './session';

export type MeStatus = 'idle' | 'loading' | 'ready' | 'anonymous' | 'expired' | 'error';

interface MeState {
  me: MeResponse | null;
  status: MeStatus;
  error: string | null;
  set: (me: MeResponse | null) => void;
  refresh: () => Promise<void>;
  clear: () => void;
  /** The server ended the session (401): the shell sends the user to /login?alasan=sesi-berakhir. */
  expire: () => void;
}

function syncLocal(me: MeResponse) {
  const session = useSession.getState();
  if (session.userId !== me.user.id) session.signIn(me.user.id);
  // Keep the local clock (still used by local namespaces) on the server's simulated time.
  if (me.devTools && Math.abs(minutesBetween(now(), me.serverNow)) > 1)
    useClock.getState().setNow(me.serverNow);
}

export const useMe = create<MeState>((set) => ({
  me: null,
  status: 'idle',
  error: null,
  set: (me) => {
    set({ me, status: me ? 'ready' : 'anonymous', error: null });
    if (me) syncLocal(me);
  },
  refresh: async () => {
    set((s) => ({ status: s.me ? s.status : 'loading' }));
    try {
      useMe.getState().set(await meApi.get());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'unauthenticated') useMe.getState().set(null);
      else set({ status: 'error', error: (e as Error).message });
    }
  },
  clear: () => set({ me: null, status: 'anonymous', error: null }),
  expire: () => {
    useSession.getState().signOut();
    set({ me: null, status: 'expired', error: null });
  },
}));

/** Where /login continues after Keycloak's sign-out, which always returns to a bare /login. */
export const LOGIN_AFTER_KEY = 'simario:login-after';

/**
 * Ends the session on the server and locally (sign-out menu, idle timeout). `after` is the
 * /login URL to show once back from Keycloak (e.g. the idle-timeout reason).
 */
export async function signOutEverywhere(after?: string) {
  const res = await authApi.signOut().catch(() => undefined);
  useSession.getState().signOut();
  useMe.getState().clear();
  if (!res?.redirectUrl) return;
  if (after)
    try {
      sessionStorage.setItem(LOGIN_AFTER_KEY, after);
    } catch {
      // Storage blocked: the reason is lost, the sign-out still happens.
    }
  window.location.assign(res.redirectUrl);
}

/** Position switcher (FR-AUT-009): local choice now, remembered by the server for next time. */
export function chooseActivePosition(positionId: string) {
  useSession.getState().setActivePosition(positionId);
  void meApi.setActivePosition(positionId).catch(() => undefined);
}
