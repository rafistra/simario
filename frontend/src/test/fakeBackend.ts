// Test fake of the B1 backend endpoints over the local store, so page tests keep running on
// the prototype seed: /me comes from meFromLocal, sign-in/notifications from the local
// implementations. Requests arrive through the real client (UUIDs from the id bridge).

import { ApiError } from '@/data/errors';
import { toLocalIds } from '@/data/http/legacyIds';
import { adminApi as localAdminApi } from '@/data/api/admin';
import { calendarApi as localCalendarApi } from '@/data/api/calendar';
import { importApi as localImportApi, type ImportKind } from '@/data/api/importer';
import { masterApi as localMasterApi, type PositionInput } from '@/data/api/master';
import { localAuthApi, localNotificationApi } from '@/data/local/authApi';
import { ASSESSMENT_ROUTES } from './fakeAssessmentRoutes';
import { BOARD_ROUTES } from './fakeBoardRoutes';
import { REGISTER_ROUTES } from './fakeRegisterRoutes';
import { getDb, useDb } from '@/data/local/store';
import { staffDirectory } from '@/data/seed';
import { holdingsOf } from '@/domain/rules/access';
import { today, useClock } from '@/state/clock';
import { useSession } from '@/state/session';
import { meFromLocal } from './meFromLocal';

type Reply = { status: number; body?: unknown };
type Handler = (match: RegExpMatchArray, body: Record<string, unknown>) => Promise<Reply> | Reply;

const json = (body: unknown, status = 200): Reply => ({ status, body });
const fail = (code: string, message: string, status: number): Reply =>
  json({ code, message, details: null }, status);
const noContent: Reply = { status: 204 };

const signInReply = (o: { ok: true; userId: string } | { ok: false; message: string }) =>
  o.ok
    ? json(o)
    : o.message.startsWith('Akun dikunci')
      ? fail('locked_out', o.message, 423)
      : fail('login_failed', o.message, 401);

const userId = () => useSession.getState().userId;

/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are untyped JSON */
const MASTER_ROUTES: [string, RegExp, Handler][] = [
  [
    'PATCH',
    /^\/api\/v1\/position-types\/([^/]+)$/,
    async (m, b) => (
      await localMasterApi.setPositionTypeActive(m[1]!, Boolean(b.active)),
      noContent
    ),
  ],
  [
    'POST',
    /^\/api\/v1\/positions$/,
    async (_, b) => json({ id: await localMasterApi.savePosition(b as unknown as PositionInput) }),
  ],
  [
    'PUT',
    /^\/api\/v1\/positions\/([^/]+)$/,
    async (m, b) =>
      json({ id: await localMasterApi.savePosition(b as unknown as PositionInput, m[1]!) }),
  ],
  [
    'POST',
    /^\/api\/v1\/positions\/([^/]+)\/deactivate$/,
    async (m, b) => (await localMasterApi.deactivatePosition(m[1]!, String(b.reason)), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/positions\/([^/]+)\/reactivate$/,
    async (m) => (await localMasterApi.reactivatePosition(m[1]!), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/stages$/,
    async (_, b) =>
      json({ id: await localMasterApi.addStage(String(b.positionTypeId), String(b.name)) }),
  ],
  [
    'PATCH',
    /^\/api\/v1\/stages\/([^/]+)$/,
    async (m, b) => {
      if (b.name !== undefined) await localMasterApi.renameStage(m[1]!, String(b.name));
      if (b.active !== undefined) await localMasterApi.setStageActive(m[1]!, Boolean(b.active));
      return noContent;
    },
  ],
  [
    'DELETE',
    /^\/api\/v1\/stages\/([^/]+)$/,
    async (m) => (await localMasterApi.deleteStage(m[1]!), noContent),
  ],
  [
    'PUT',
    /^\/api\/v1\/position-types\/([^/]+)\/stage-order$/,
    async (m, b) => (
      await localMasterApi.reorderStages(m[1]!, b.orderedIds as string[]),
      noContent
    ),
  ],
  [
    'POST',
    /^\/api\/v1\/risk-templates$/,
    async (_, b) => json({ id: await localMasterApi.saveTemplate(b as any) }),
  ],
  [
    'PUT',
    /^\/api\/v1\/risk-templates\/([^/]+)$/,
    async (m, b) => json({ id: await localMasterApi.saveTemplate(b as any, m[1]!) }),
  ],
  [
    'PATCH',
    /^\/api\/v1\/risk-templates\/([^/]+)$/,
    async (m, b) => (await localMasterApi.setTemplateActive(m[1]!, Boolean(b.active)), noContent),
  ],
  [
    'DELETE',
    /^\/api\/v1\/risk-templates\/([^/]+)$/,
    async (m) => (await localMasterApi.deleteTemplate(m[1]!), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/position-types\/([^/]+)\/data-umum-forms$/,
    async (m, b) =>
      json({
        version: await localMasterApi.saveDataUmumForm(
          m[1]!,
          String(b.defaultObjective),
          b.fields as any,
          Boolean(b.objectiveEnabled),
        ),
      }),
  ],
  [
    'POST',
    /^\/api\/v1\/score-band-versions$/,
    async (_, b) => json({ id: await localMasterApi.createBandDraft(String(b.effectiveFrom)) }),
  ],
  [
    'PUT',
    /^\/api\/v1\/score-band-versions\/([^/]+)$/,
    async (m, b) => (
      await localMasterApi.updateBandDraft(
        m[1]!,
        (b.bands as any[]).map((x) => ({ ...x, versionId: m[1]! })),
        String(b.effectiveFrom),
        b.options as any,
      ),
      noContent
    ),
  ],
  [
    'DELETE',
    /^\/api\/v1\/score-band-versions\/([^/]+)$/,
    async (m) => (await localMasterApi.discardBandDraft(m[1]!), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/score-band-versions\/([^/]+)\/schedule$/,
    async (m, b) => (await localMasterApi.saveBandVersion(m[1]!, b as any), noContent),
  ],
  [
    'PATCH',
    /^\/api\/v1\/score-bands\/([^/]+)$/,
    async (m, b) => (
      await localMasterApi.updateActiveGuidance(m[1]! as any, String(b.guidance)),
      noContent
    ),
  ],
  [
    'PATCH',
    /^\/api\/v1\/score-options\/([^/]+)$/,
    async (m, b) => (await localMasterApi.updateOptionLabel(m[1]!, String(b.label)), noContent),
  ],
];
const importJobs: { id: string; kind: ImportKind; text: string }[] = [];

const ADMIN_ROUTES: [string, RegExp, Handler][] = [
  [
    'POST',
    /^\/api\/v1\/users$/,
    async (_, b) => {
      const r = await localAdminApi.addUser(b as any);
      return json({ id: r.id, temporaryPassword: r.tempPassword }, 201);
    },
  ],
  [
    'PUT',
    /^\/api\/v1\/users\/([^/]+)\/roles$/,
    async (m, b) => (await localAdminApi.setManualRoles(m[1]!, b.roleIds as string[]), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/users\/([^/]+)\/deactivate$/,
    async (m) => json(await localAdminApi.deactivateUser(m[1]!)),
  ],
  [
    'POST',
    /^\/api\/v1\/users\/([^/]+)\/reactivate$/,
    async (m) => (await localAdminApi.reactivateUser(m[1]!), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/users\/([^/]+)\/reset-password$/,
    async (m) => json({ temporaryPassword: await localAdminApi.resetPassword(m[1]!) }),
  ],
  [
    'POST',
    /^\/api\/v1\/occupancies$/,
    async (_, b) => json(await localAdminApi.assignPosition(b as any)),
  ],
  [
    'POST',
    /^\/api\/v1\/positions\/([^/]+)\/replace-official$/,
    async (m, b) => json(await localAdminApi.replaceOfficial({ ...(b as any), positionId: m[1]! })),
  ],
  [
    'POST',
    /^\/api\/v1\/positions\/([^/]+)\/filler$/,
    async (m, b) =>
      json({ operatorsEnded: await localAdminApi.moveFiller(m[1]!, String(b.toOccupancyId)) }),
  ],
  [
    'POST',
    /^\/api\/v1\/positions\/([^/]+)\/delegates$/,
    async (m, b) =>
      json({ id: await localAdminApi.appointOperator({ ...(b as any), positionId: m[1]! }) }, 201),
  ],
  [
    'POST',
    /^\/api\/v1\/delegates\/([^/]+)\/revoke$/,
    async (m) => (await localAdminApi.revokeOperator(m[1]!), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/roles$/,
    async (_, b) => json({ id: await localAdminApi.addRole(String(b.name)) }, 201),
  ],
  [
    'DELETE',
    /^\/api\/v1\/roles\/([^/]+)$/,
    async (m) => (await localAdminApi.deleteRole(m[1]!), noContent),
  ],
  [
    'PUT',
    /^\/api\/v1\/roles\/([^/]+)\/permissions\/(\d+)$/,
    async (m, b) => (
      await localAdminApi.setPermission(
        m[1]!,
        Number(m[2]),
        Boolean(b.enabled),
        (b.scope ?? null) as any,
      ),
      noContent
    ),
  ],
  [
    'POST',
    /^\/api\/v1\/monitoring-assignments$/,
    async (_, b) => (
      await localAdminApi.addAssignments({
        targets: b.targetPositionIds as string[],
        lead: String(b.leadPositionId ?? ''),
        supports: (b.supports ?? []) as any,
        fromQuarterId: String(b.quarterFromId),
        toQuarterId: String(b.quarterToId),
        decreeNo: String(b.decreeNo),
      }),
      noContent
    ),
  ],
  [
    'DELETE',
    /^\/api\/v1\/monitoring-assignments\/([^/]+)$/,
    async (m) => (await localAdminApi.removeAssignment(m[1]!), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/fiscal-years$/,
    async (_, b) => (await localCalendarApi.createFiscalYear(Number(b.year)), noContent),
  ],
  [
    'PATCH',
    /^\/api\/v1\/fiscal-years\/(\d+)$/,
    async (m, b) => (await localCalendarApi.updateFiscalYear(Number(m[1]), b as any), noContent),
  ],
  [
    'POST',
    /^\/api\/v1\/fiscal-years\/(\d+)\/archive$/,
    async (m) => (await localCalendarApi.archiveManually(Number(m[1])), noContent),
  ],
  [
    'PATCH',
    /^\/api\/v1\/quarters\/([^/]+)$/,
    async (m, b) => {
      const { confirmPastDeadline, ...patch } = b;
      await localCalendarApi.updateQuarter(m[1]!, patch as any, Boolean(confirmPastDeadline));
      return noContent;
    },
  ],
  [
    'POST',
    /^\/api\/v1\/quarters\/([^/]+)\/assessors\/([^/]+)\/exclude$/,
    async (m, b) => (
      await localCalendarApi.excludeAssessor(m[1]!, m[2]!, String(b.reason)),
      noContent
    ),
  ],
  [
    'POST',
    /^\/api\/v1\/imports$/,
    async (_, b) => {
      const id = `job-${importJobs.length + 1}`;
      importJobs.push({ id, kind: b.kind as ImportKind, text: String(b.text) });
      const dry = await localImportApi.dryRun(b.kind as ImportKind, String(b.text));
      return json({ id, status: 'dry_run', ...dry }, 201);
    },
  ],
  [
    'POST',
    /^\/api\/v1\/imports\/([^/]+)\/commit$/,
    async (m) => {
      const job = importJobs.find((j) => j.id === m[1])!;
      return json({
        id: job.id,
        status: 'applied',
        rows: await localImportApi.apply(job.kind, job.text),
      });
    },
  ],
  ['GET', /^\/api\/v1\/imports$/, async () => json(await localImportApi.history())],
  [
    'GET',
    /^\/api\/v1\/staff$/,
    async (_, b) => json(await localAdminApi.searchStaff(String(b.q ?? ''))),
  ],
];
/* eslint-enable @typescript-eslint/no-explicit-any */

const ROUTES: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/v1\/auth\/config$/, () => json({ devTools: true, oidcEnabled: true })],
  [
    'GET',
    /^\/api\/v1\/collections\/([A-Za-z]+)$/,
    (m) => {
      const rows = (getDb() as unknown as Record<string, unknown>)[m[1]!];
      return rows ? json(rows) : fail('not_found', 'Data tidak ditemukan.', 404);
    },
  ],
  [
    'GET',
    /^\/api\/v1\/me$/,
    () => {
      const me = userId() && meFromLocal(getDb(), userId()!, today());
      return me ? json(me) : fail('unauthenticated', 'Sesi Anda berakhir.', 401);
    },
  ],
  ['PUT', /^\/api\/v1\/me\/active-position$/, () => noContent],
  [
    'POST',
    /^\/api\/v1\/dev\/impersonate$/,
    async (_, b) => signInReply(await localAuthApi.signInSso(String(b.nip))),
  ],
  [
    'POST',
    /^\/api\/v1\/auth\/login$/,
    async (_, b) => signInReply(await localAuthApi.signInLocal(String(b.nip), String(b.password))),
  ],
  [
    'POST',
    /^\/api\/v1\/auth\/logout$/,
    () => {
      useSession.getState().signOut();
      return noContent;
    },
  ],
  [
    'POST',
    /^\/api\/v1\/auth\/password$/,
    async (_, b) => {
      await localAuthApi.changePassword(userId()!, b as { newPassword: string });
      return noContent;
    },
  ],
  [
    'GET',
    /^\/api\/v1\/notifications$/,
    async () => {
      const results = await localNotificationApi.list(userId()!);
      return json({ results, page: 1, pageSize: results.length, total: results.length });
    },
  ],
  [
    'POST',
    /^\/api\/v1\/notifications\/read-all$/,
    async () => {
      await localNotificationApi.markAllRead(userId()!);
      return noContent;
    },
  ],
  [
    'POST',
    /^\/api\/v1\/notifications\/([^/]+)\/read$/,
    async (m) => {
      await localNotificationApi.markRead(m[1]!);
      return noContent;
    },
  ],
  [
    'GET',
    /^\/api\/v1\/dev\/personas$/,
    () => {
      const db = getDb();
      const day = today();
      return json({
        personas: db.users.map((u) => ({
          userId: u.id,
          nip: u.nip,
          fullName: u.fullName,
          active: u.active,
          holdings: holdingsOf(db, u.id, day).map((h) => ({
            positionName: db.positions.find((p) => p.id === h.positionId)!.name,
            line: h.line,
            capacity: h.capacity,
          })),
          roleViews: meFromLocal(db, u.id, day)?.roleViews ?? [],
        })),
        unregistered: { nip: staffDirectory[0]!.nip, fullName: staffDirectory[0]!.fullName },
      });
    },
  ],
  [
    'POST',
    /^\/api\/v1\/dev\/clock$/,
    (_, b) => {
      useClock.getState().setNow(String(b.at));
      return json({ serverNow: String(b.at), ran: [] });
    },
  ],
  [
    'POST',
    /^\/api\/v1\/dev\/reset$/,
    (_, b) => {
      useDb.getState().reset(b.asOf ? String(b.asOf) : undefined);
      return json({ counts: {} });
    },
  ],
];

/** Installs the fake as global fetch (src/test/setup.ts). */
export function installFakeBackend() {
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const path = toLocalIds(url.pathname);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = toLocalIds(
      init.body instanceof FormData
        ? (JSON.parse(String(init.body.get('data'))) as Record<string, unknown>)
        : typeof init.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : Object.fromEntries(url.searchParams),
    );
    if (init.body instanceof FormData) body.__files = init.body.getAll('files');
    let reply: Reply = fail('not_found', 'Data tidak ditemukan.', 404);
    for (const [m, re, handler] of [
      ...ROUTES,
      ...MASTER_ROUTES,
      ...ADMIN_ROUTES,
      ...REGISTER_ROUTES,
      ...BOARD_ROUTES,
      ...ASSESSMENT_ROUTES,
    ]) {
      const match = method === m ? path.match(re) : null;
      if (!match) continue;
      try {
        reply = await handler(match, body);
      } catch (e) {
        reply =
          e instanceof ApiError
            ? json(
                { code: e.code, message: e.message, details: e.details ?? null },
                e.code === 'forbidden' ? 403 : 422,
              )
            : fail('server', String(e), 500);
      }
      break;
    }
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? null), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}
