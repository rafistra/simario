// authApi over HTTP (docs/03_api_contract.md §4.1). Same signatures as the local version.

import { ApiError } from '../errors';
import { apiFetch } from './client';

export type SsoOutcome = { ok: true; userId: string } | { ok: false; message: string };

export interface AuthConfig {
  devTools: boolean;
  oidcEnabled: boolean;
}

/** Sign-in refusals come back as messages for the login page, not as thrown errors. */
async function outcome(run: () => Promise<{ ok: true; userId: string }>): Promise<SsoOutcome> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'login_failed' || e.code === 'locked_out'))
      return { ok: false, message: e.message };
    throw e;
  }
}

export const authApi = {
  /** Persona sign-in (development): POST /dev/impersonate, matched by NIP like SSO. */
  signInSso: (nip: string) =>
    outcome(() => apiFetch('/dev/impersonate', { method: 'POST', body: { nip } })),

  /** Local account fallback (FR-AUT-002). */
  signInLocal: (nip: string, password: string) =>
    outcome(() => apiFetch('/auth/login', { method: 'POST', body: { nip, password } })),

  /** Real SSO: the browser goes to Keycloak and returns to `next`. */
  startSso: (next: string) => {
    window.location.assign(`/oidc/authenticate/?next=${encodeURIComponent(next)}`);
  },

  /** FR-AUT-003 (forced, no old password) and FR-AUT-004 (self-service). */
  changePassword: (userId: string, input: { oldPassword?: string; newPassword: string }) => {
    void userId; // the server reads the user from the session
    return apiFetch<void>('/auth/password', { method: 'POST', body: input });
  },

  signOut: () => apiFetch<void>('/auth/logout', { method: 'POST' }),

  config: () => apiFetch<AuthConfig>('/auth/config'),
};
