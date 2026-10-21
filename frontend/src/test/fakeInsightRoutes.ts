// Metrics and audit routes of the test fake backend (B8): the HTTP insightsApi in Vitest
// reaches the local implementation in data/api/insights.ts over the prototype seed.

import { insightsApi as local, type AuditFilter } from '@/data/api/insights';
import { getDb } from '@/data/local/store';
import type { Handler } from './fakeRegisterRoutes';

const path = (p: string) => new RegExp(`^/api/v1${p.replace(/:[a-z]+/g, '([^/]+)')}$`);
const ok = (body: unknown) => ({ status: 200, body });

export const INSIGHT_ROUTES: [string, RegExp, Handler][] = [
  ['GET', path('/metrics/:year'), async (m) => ok(await local.metrics(Number(m[1])))],
  [
    'GET',
    path('/audit'),
    async (_m, b) => {
      const { original, ...filter } = b as Record<string, string>;
      const rows = await local.audit(filter as AuditFilter, original === '1');
      // The real server logs every original read; here a repeat would bump the store and reload
      // the page forever, so it logs once in a row.
      if (original === '1' && getDb().audit.at(-1)?.action !== 'tampilkan_nilai_asli')
        await local.logShowOriginal();
      return ok(rows);
    },
  ],
  [
    'GET',
    path('/audit/facets'),
    () => {
      const db = getDb();
      return ok({
        actions: [...new Set(db.audit.map((a) => a.action))].sort(),
        entityTypes: [...new Set(db.audit.map((a) => a.entityType))].sort(),
      });
    },
  ],
];
