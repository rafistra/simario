// Development endpoints (spec §4.5): only answer when the backend runs with SIMARIO_DEV_TOOLS.

import { authApi } from './auth';
import { apiFetch } from './client';

export interface Persona {
  userId: string;
  nip: string;
  fullName: string;
  active: boolean;
  holdings: { positionName: string; line: 1 | 2 | 3; capacity: 'pejabat' | 'operator' }[];
  roleViews: string[];
}

export const devApi = {
  personas: () =>
    apiFetch<{ personas: Persona[]; unregistered: { nip: string; fullName: string } }>(
      '/dev/personas',
    ),
  impersonate: (nip: string) => authApi.signInSso(nip),
  /** `at` = 'YYYY-MM-DDTHH:mm' (WITA); also runs the scheduled tasks. */
  setClock: (at: string) =>
    apiFetch<{ serverNow: string; ran: string[] }>('/dev/clock', {
      method: 'POST',
      body: { at },
    }),
  /** Reloads the demo seed (optionally as of a moment) and signs everyone out. */
  reset: (asOf?: string) =>
    apiFetch<{ counts: Record<string, number> }>('/dev/reset', {
      method: 'POST',
      body: asOf ? { asOf } : {},
    }),
};
