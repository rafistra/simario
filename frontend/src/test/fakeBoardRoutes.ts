// Board and thread routes of the test fake backend (B4): the HTTP boardApi/threadApi in Vitest
// reach the local implementations in data/api/{board,thread}.ts over the prototype seed.

import { boardApi as localBoard } from '@/test/fake/api/board';
import { threadApi as localThread } from '@/test/fake/api/thread';
import { getDb } from '@/test/fake/local/store';
import { threadParticipants } from '@/domain/rules/board';
import { today } from '@/state/clock';
import { useSession } from '@/state/session';
import type { Handler } from './fakeRegisterRoutes';

const path = (p: string) => new RegExp(`^/api/v1${p.replace(/:[a-z]+/g, '([^/]+)')}$`);
const ok = (body?: unknown, status = 200) =>
  body === undefined ? { status: 204 } : { status, body };

export const BOARD_ROUTES: [string, RegExp, Handler][] = [
  [
    'GET',
    path('/positions/:pos/board/:year'),
    async (m) => ok(await localBoard.board(m[1]!, Number(m[2]))),
  ],
  [
    'GET',
    path('/register-risks/:id/thread'),
    async (m, b) => {
      if (b.since) {
        const me = useSession.getState().userId;
        const newer = getDb().comments.filter(
          (c) =>
            c.registerRiskId === m[1] &&
            c.createdAt >= String(b.since) &&
            c.authorUserId !== me &&
            !c.withdrawnAt,
        );
        return ok({ comments: newer.length, commentIds: newer.map((c) => c.id) });
      }
      return ok(await localBoard.thread(m[1]!));
    },
  ],
  [
    'GET',
    path('/register-risks/:id/participants'),
    (m, b) => {
      const db = getDb();
      const risk = db.risks.find((r) => r.id === m[1])!;
      const reg = db.registers.find((r) => r.id === risk.registerId)!;
      return ok(
        threadParticipants(
          db,
          reg.positionId,
          String(b.quarterId),
          today(),
          useSession.getState().userId ?? undefined,
        ),
      );
    },
  ],
  [
    'POST',
    path('/register-risks/:id/comments'),
    async (m, b) => {
      const files = (b.__files as File[] | undefined) ?? [];
      const flags = (b.confidential as boolean[] | undefined) ?? [];
      const id = await localThread.post({
        riskId: m[1]!,
        mitigationId: (b.mitigationId as string | null) ?? null,
        body: String(b.body ?? ''),
        quarterId: (b.quarterId as string | null) ?? undefined,
        isStep: Boolean(b.isStep),
        mentionUserIds: (b.mentionUserIds as string[] | undefined) ?? [],
        files: files.map((f, i) => ({
          name: f.name,
          size: f.size,
          mime: f.type || 'application/octet-stream',
          confidential: Boolean(flags[i]),
        })),
      });
      return ok({ id }, 201);
    },
  ],
  [
    'PATCH',
    path('/comments/:id'),
    async (m, b) => ok(void (await localThread.edit(m[1]!, String(b.body)))),
  ],
  [
    'POST',
    path('/comments/:id/withdraw'),
    async (m) => ok(void (await localThread.withdraw(m[1]!))),
  ],
  [
    'PATCH',
    path('/attachments/:id'),
    async (m, b) => ok(void (await localThread.setConfidential(m[1]!, Boolean(b.isConfidential)))),
  ],
  [
    'PUT',
    path('/register-risks/:id/subscription'),
    async (m) => ok(void (await localThread.follow(m[1]!, true))),
  ],
  [
    'DELETE',
    path('/register-risks/:id/subscription'),
    async (m) => ok(void (await localThread.follow(m[1]!, false))),
  ],
  ['POST', path('/register-risks/:id/seen'), (m) => ok(void localThread.markSeen(m[1]!))],
];
