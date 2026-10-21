// Register routes of the test fake backend (B3): the HTTP registerApi in Vitest reaches the local
// implementation in data/api/register.ts over the prototype seed.

import { registerApi as local, type RegisterKey } from '@/data/api/register';
import { masterApi as localMaster } from '@/data/api/master';
import { getDb } from '@/data/local/store';
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

function proposalRows() {
  const db = getDb();
  return db.proposals.map((p) => {
    const risk = db.risks.find((r) => r.id === p.sourceRegisterRiskId)!;
    const register = db.registers.find((r) => r.id === risk.registerId)!;
    const position = db.positions.find((x) => x.id === register.positionId)!;
    const type = db.positionTypes.find((t) => t.id === position.positionTypeId)!;
    return {
      ...p,
      proposerName: db.users.find((u) => u.id === p.proposerUserId)!.fullName,
      positionId: position.id,
      positionName: position.name,
      positionTypeId: type.id,
      positionTypeName: type.name,
      stageId: risk.stageId,
      stageName: db.stages.find((x) => x.id === risk.stageId)!.name,
      riskType: risk.riskType,
      mitigations: db.mitigations
        .filter((m) => m.registerRiskId === risk.id)
        .sort((a, b) => a.order - b.order)
        .map((m) => m.descriptionSnapshot),
    };
  });
}

export const REGISTER_ROUTES: [string, RegExp, Handler][] = [
  ['GET', path('/proposals'), () => ok(proposalRows())],
  [
    'POST',
    path('/proposals/:id/reject'),
    async (m, b) => ok(void (await localMaster.rejectProposal(m[1]!, String(b.reason)))),
  ],
  [
    'POST',
    path('/proposals/:id/accept'),
    async (m, b) => ok({ id: await localMaster.saveTemplate(b as never, undefined, m[1]!) }),
  ],
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
