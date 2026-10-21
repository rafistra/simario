import type { components } from './schema';
import { apiFetch } from './client';

/** GET /api/v1/me after the id bridge (prototype ids where known). */
export type MeResponse = components['schemas']['Me'];
export type MeHolding = MeResponse['holdings'][number];

export const meApi = {
  get: () => apiFetch<MeResponse>('/me'),
  setActivePosition: (positionId: string) =>
    apiFetch<void>('/me/active-position', { method: 'PUT', body: { positionId } }),
};
