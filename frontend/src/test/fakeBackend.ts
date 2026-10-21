// Test fake of the B1 backend endpoints over the local store, so page tests keep running on
// the prototype seed: /me comes from meFromLocal, sign-in/notifications from the local
// implementations. Requests arrive through the real client (UUIDs from the id bridge).

import { ApiError } from '@/data/errors';
import { toLocalIds } from '@/data/http/legacyIds';
import { masterApi as localMasterApi, type PositionInput } from '@/data/api/master';
import { localAuthApi, localNotificationApi } from '@/data/local/authApi';
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
      typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    );
    let reply: Reply = fail('not_found', 'Data tidak ditemukan.', 404);
    for (const [m, re, handler] of [...ROUTES, ...MASTER_ROUTES]) {
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
