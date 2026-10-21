// History and home routes of the test fake backend (B6): the HTTP historyApi/homeApi in Vitest
// reach the local implementations in data/api/{history,home}.ts over the prototype seed.

import { historyApi as localHistory } from '@/data/api/history';
import { homeApi as localHome } from '@/data/api/home';
import type { Handler } from './fakeRegisterRoutes';

const path = (p: string) => new RegExp(`^/api/v1${p.replace(/:[a-z]+/g, '([^/]+)')}$`);
const ok = (body: unknown) => ({ status: 200, body });

export const HOME_ROUTES: [string, RegExp, Handler][] = [
  [
    'GET',
    path('/positions/:pos/history/:year'),
    async (m) => ok(await localHistory.history(m[1]!, Number(m[2]))),
  ],
  ['GET', path('/home'), async (_m, b) => ok(await localHome.home((b.position as string) ?? null))],
  ['GET', path('/my-positions'), async () => ok(await localHome.positions())],
];
