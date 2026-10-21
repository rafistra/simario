// Collection reads (GET /api/v1/collections/<name>): prototype-shaped rows for the master-data
// and administration pages, which keep their own derivations (B2).

import type { DB } from '@/data/db';
import { apiFetch } from './client';

export type CollectionName = keyof DB;

export const collectionsApi = {
  get: <K extends CollectionName>(name: K) => apiFetch<DB[K]>(`/collections/${name}`),
};
