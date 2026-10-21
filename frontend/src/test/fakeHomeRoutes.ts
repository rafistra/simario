// History and home routes of the test fake backend (B6): the HTTP historyApi/homeApi in Vitest
// reach the local implementations in data/api/{history,home}.ts over the prototype seed.

import { historyApi as localHistory } from '@/test/fake/api/history';
import { homeApi as localHome } from '@/test/fake/api/home';
import { canReadPosition, officialsOf, positionLine } from '@/domain/rules/access';
import { today } from '@/state/clock';
import { useSession } from '@/state/session';
import { getDb, mutateDb } from './fake/local/store';
import type { Handler } from './fakeRegisterRoutes';

const path = (p: string) => new RegExp(`^/api/v1${p.replace(/:[a-z]+/g, '([^/]+)')}$`);
const ok = (body: unknown) => ({ status: 200, body });
const fail = (code: string, message: string, status: number) => ({
  status,
  body: { code, message },
});

export const HOME_ROUTES: [string, RegExp, Handler][] = [
  [
    'GET',
    path('/positions/:pos/history/:year'),
    async (m) => ok(await localHistory.history(m[1]!, Number(m[2]))),
  ],
  ['GET', path('/home'), async (_m, b) => ok(await localHome.home((b.position as string) ?? null))],
  ['GET', path('/my-positions'), async () => ok(await localHome.positions())],
  [
    'GET',
    path('/preferences'),
    () => {
      const uid = useSession.getState().userId;
      return ok({
        items: getDb()
          .preferences.filter((p) => p.userId === uid)
          .map((p) => ({ key: p.key, value: p.value })),
      });
    },
  ],
  [
    'PUT',
    path('/preferences/:key'),
    (m, b) => {
      const uid = useSession.getState().userId ?? '';
      const key = decodeURIComponent(m[1]!);
      mutateDb((d) => {
        const p = d.preferences.find((x) => x.userId === uid && x.key === key);
        if (p) p.value = b.value;
        else d.preferences.push({ userId: uid, key, value: b.value });
      });
      return { status: 204 };
    },
  ],
  [
    'GET',
    path('/positions/:pos/workspace'),
    (m, b) => {
      const db = getDb();
      const day = today();
      const year = Number(b.ta ?? day.slice(0, 4));
      const position = db.positions.find((p) => p.id === m[1]);
      if (!position || positionLine(db, position.id) !== 1)
        return fail('not_found', 'Jabatan tidak ditemukan.', 404);
      const uid = useSession.getState().userId ?? '';
      if (!canReadPosition(db, uid, position.id, day, year))
        return fail('forbidden', 'Anda tidak memiliki akses ke jabatan ini.', 403);
      const unit = db.orgUnits.find((o) => o.id === position.orgUnitId)!;
      const years = [
        ...new Set([
          ...db.registers.filter((r) => r.positionId === position.id).map((r) => r.fiscalYear),
          Number(day.slice(0, 4)),
        ]),
      ].sort((a, b) => b - a);
      return ok({
        position,
        unit: { id: unit.id, code: unit.code, name: unit.name },
        years: years.map((y) => ({
          year: y,
          archived: db.fiscalYears.find((f) => f.year === y)?.status === 'archived',
        })),
        officials: officialsOf(db, position.id, day).map((o) => ({
          name: o.user.fullName,
          isFiller: o.occupancy.isFiller,
        })),
        operators: db.delegates
          .filter(
            (d) =>
              d.positionId === position.id &&
              d.startDate <= day &&
              (!d.endDate || d.endDate >= day),
          )
          .map((d) => db.users.find((u) => u.id === d.userId)!.fullName),
      });
    },
  ],
];
