// Register routes of the test fake backend (B3): the HTTP registerApi in Vitest reaches the local
// implementation in data/api/register.ts over the prototype seed.

import { registerApi as local, type RegisterKey } from '@/data/api/register';
import type { RiskType } from '@/domain/types';

type Reply = { status: number; body?: unknown };
type Body = Record<string, unknown>;
export type Handler = (match: RegExpMatchArray, body: Body) => Promise<Reply> | Reply;

/** '/registers/:pos/:year/publish' → a regex with one group per ':param'. */
const path = (p: string) => new RegExp(`^/api/v1${p.replace(/:[a-z]+/g, '([^/]+)')}$`);

const ok = (body?: unknown, status = 200): Reply =>
  body === undefined ? { status: 204 } : { status, body };
const key = (m: RegExpMatchArray): RegisterKey => ({
  positionId: m[1]!,
  fiscalYear: Number(m[2]),
});
const riskType = (v: unknown) => (v ?? null) as RiskType | null;

const R = '/registers/:pos/:year';

export const REGISTER_ROUTES: [string, RegExp, Handler][] = [
  ['GET', path(R), async (m) => ok(await local.view(key(m)))],
  ['PATCH', path(R), async (m, b) => ok(void (await local.updateDataUmum(key(m), b as never)))],
  [
    'PUT',
    path(`${R}/template-risks/:tpl`),
    async (m, b) => ok(void (await local.toggleTemplateRisk(key(m), m[3]!, Boolean(b.selected)))),
  ],
  [
    'POST',
    path(`${R}/risks`),
    async (m, b) =>
      ok(
        {
          id: await local.addCustomRisk(
            key(m),
            String(b.stageId),
            b.riskType as RiskType,
            String(b.description),
          ),
        },
        201,
      ),
  ],
  [
    'PUT',
    path(`${R}/declarations`),
    async (m, b) =>
      ok(
        void (await local.setDeclaration(
          key(m),
          String(b.stageId),
          riskType(b.riskType),
          Boolean(b.on),
          Boolean(b.force),
        )),
      ),
  ],
  [
    'PATCH',
    path(`${R}/declarations`),
    async (m, b) =>
      ok(
        void (await local.setDeclarationReason(
          key(m),
          String(b.stageId),
          riskType(b.riskType),
          String(b.reason),
        )),
      ),
  ],
  ['POST', path(`${R}/mark-ready`), async (m) => ok(void (await local.markReady(key(m))))],
  ['POST', path(`${R}/publish`), async (m) => ok(await local.publish(key(m)))],
  ['POST', path(`${R}/copy-from-previous`), async (m) => ok(await local.copyFromPrevious(key(m)))],
  ['DELETE', path('/register-risks/:id'), async (m) => ok(void (await local.deleteRisk(m[1]!)))],
  [
    'PUT',
    path('/register-risks/:id/template-mitigations/:tpl'),
    async (m, b) =>
      ok(void (await local.toggleTemplateMitigation(m[1]!, m[2]!, Boolean(b.selected)))),
  ],
  [
    'POST',
    path('/register-risks/:id/mitigations'),
    async (m, b) => ok(void (await local.addCustomMitigation(m[1]!, String(b.text)))),
  ],
  [
    'POST',
    path('/register-risks/:id/deactivate'),
    async (m, b) => ok(void (await local.deactivateRisk(m[1]!, String(b.reason)))),
  ],
  [
    'DELETE',
    path('/register-mitigations/:id'),
    async (m) => ok(void (await local.deleteMitigation(m[1]!))),
  ],
  [
    'POST',
    path('/register-mitigations/:id/deactivate'),
    async (m, b) => ok(void (await local.deactivateMitigation(m[1]!, String(b.reason)))),
  ],
];
