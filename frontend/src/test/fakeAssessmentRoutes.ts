// Assessment routes of the test fake backend (B5): the HTTP assessmentApi in Vitest reaches the
// local implementation in data/api/assessment.ts over the prototype seed.

import { assessmentApi as local, finalisePreview } from '@/test/fake/api/assessment';
import { getDb } from '@/test/fake/local/store';
import { now } from '@/state/clock';
import type { Handler } from './fakeRegisterRoutes';

const path = (p: string) => new RegExp(`^/api/v1${p.replace(/:[a-z]+/g, '([^/]+)')}$`);
const ok = (body?: unknown, status = 200) =>
  body === undefined ? { status: 204 } : { status, body };

export const ASSESSMENT_ROUTES: [string, RegExp, Handler][] = [
  [
    'GET',
    path('/positions/:pos/assessments/:year/:tw'),
    async (m, b) => {
      const blind = b.blind === '1';
      const view = await local.page(m[1]!, Number(m[2]), Number(m[3]), blind);
      // The real server logs every blind load; here a repeat would bump the store and reload forever.
      const last = getDb().audit.at(-1);
      const logged =
        last?.action === 'lihat_penilaian_sebelum_dibuka' && last.entityId === view.quarter.id;
      if (view.blind.granted && !logged) await local.logBlindView(m[1]!, view.quarter.id);
      return ok(view);
    },
  ],
  [
    'GET',
    path('/positions/:pos/assessments/:year/:tw/finalise-preview'),
    (m, b) => {
      const db = getDb();
      const q = db.quarters.find(
        (x) => x.fiscalYear === Number(m[2]) && x.number === Number(m[3]),
      )!;
      return ok(finalisePreview(db, m[1]!, q, String(b.assessorPositionId), now()));
    },
  ],
  [
    'GET',
    path('/assessment-queue'),
    async (_m, b) => ok(await local.queue((b.quarterId as string) ?? null)),
  ],
  [
    'PATCH',
    path('/risk-quarters/:rq/assessments/:pos'),
    async (m, b) => ok(void (await local.saveCell(m[1]!, m[2]!, b))),
  ],
  [
    'POST',
    path('/risk-quarters/:rq/assessments/:pos/files'),
    async (m, b) => {
      const files = (b.__files as File[] | undefined) ?? [];
      const flags = (b.confidential as boolean[] | undefined) ?? [];
      await local.addFiles(
        m[1]!,
        m[2]!,
        files.map((f, i) => ({
          name: f.name,
          size: f.size,
          mime: f.type || 'application/octet-stream',
          confidential: flags[i] ?? true,
        })),
      );
      return ok();
    },
  ],
  ['DELETE', path('/assessment-files/:id'), async (m) => ok(void (await local.removeFile(m[1]!)))],
  [
    'POST',
    path('/positions/:pos/quarters/:q/assessments/:a/ready'),
    async (m) => ok({ count: await local.markReady(m[1]!, m[2]!, m[3]!) }),
  ],
  [
    'POST',
    path('/positions/:pos/quarters/:q/assessments/:a/finalise'),
    async (m) => ok(await local.finalise(m[1]!, m[2]!, m[3]!)),
  ],
  ['POST', path('/assessments/:id/reopen'), async (m) => ok(void (await local.reopen(m[1]!)))],
  [
    'PATCH',
    path('/results/:id/explanation'),
    async (m, b) => ok(void (await local.saveExplanation(m[1]!, b))),
  ],
  [
    'POST',
    path('/positions/:pos/explanations/ready'),
    async (m, b) => ok(void (await local.markExplanationsReady(m[1]!, b.resultIds as string[]))),
  ],
  [
    'POST',
    path('/positions/:pos/explanations/send'),
    async (m, b) => ok({ count: await local.sendExplanations(m[1]!, b.resultIds as string[]) }),
  ],
];
