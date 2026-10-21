// insightsApi over HTTP (docs/03_api_contract.md §4.8). Same signatures as data/api/insights.ts,
// plus `auditFacets` (filter choices, which the page read from the local store).

import type { AuditFilter, AuditRow, MetricCard } from '@/test/fake/api/insights';
import { apiFetch } from './client';

const query = (f: AuditFilter, original: boolean) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
  if (original) p.set('original', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const insightsApi = {
  metrics: (year: number) => apiFetch<MetricCard[]>(`/metrics/${year}`),
  /** With `original` (izin 24) the server returns unredacted values and logs the view. */
  audit: (filter: AuditFilter, original: boolean) =>
    apiFetch<AuditRow[]>(`/audit${query(filter, original)}`),
  auditFacets: () => apiFetch<{ actions: string[]; entityTypes: string[] }>('/audit/facets'),
  /** The server logs "Tampilkan nilai asli" when it serves `audit(…, true)` (FR-ADM-008). */
  logShowOriginal: () => Promise.resolve(),
};
