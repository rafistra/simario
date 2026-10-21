// preferenceApi over HTTP (spec §4.10): per-user conveniences (board filters, collapsed sidebar)
// live on the server. Reads stay synchronous from a cache filled after sign-in; writes update
// the cache at once and are saved in the background.

import { create } from 'zustand';
import { apiFetch } from './client';

interface Cache {
  userId: string | null;
  values: Record<string, unknown>;
}

export const usePreferences = create<Cache>(() => ({ userId: null, values: {} }));

/** Loads the signed-in user's preferences (called with /me). */
export async function loadPreferences(userId: string) {
  const res = await apiFetch<{ items: { key: string; value: unknown }[] }>('/preferences', {
    background: true,
  });
  usePreferences.setState({
    userId,
    values: Object.fromEntries(res.items.map((p) => [p.key, p.value])),
  });
}

export const preferenceApi = {
  get: <T>(userId: string, key: string): T | undefined => {
    const s = usePreferences.getState();
    return s.userId === userId ? (s.values[key] as T | undefined) : undefined;
  },
  /** Saves in the background; the returned promise settles when the server has it. */
  set: (userId: string, key: string, value: unknown): Promise<void> => {
    const s = usePreferences.getState();
    if (s.userId === userId) usePreferences.setState({ values: { ...s.values, [key]: value } });
    return apiFetch<void>(`/preferences/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { value },
      background: true,
    }).catch(() => undefined);
  },
};
