// Sheet routes of the test fake backend (B7): the HTTP sheetApi in Vitest reaches the local
// implementation in data/api/sheets.ts over the prototype seed.

import { sheetApi as local } from '@/test/fake/api/sheets';
import type { SheetSection } from '@/domain/rules/sheetPayload';
import type { PrintSnapshot } from '@/domain/types';
import type { Handler } from './fakeRegisterRoutes';

const path = (p: string) => new RegExp(`^/api/v1${p.replace(/:[a-z]+/g, '([^/]+)')}$`);
const ok = (body?: unknown, status = 200) =>
  body === undefined ? { status: 204 } : { status, body };

export const SHEET_ROUTES: [string, RegExp, Handler][] = [
  [
    'GET',
    path('/positions/:pos/sheets/:year/:tw'),
    async (m, b) =>
      ok(await local.view(m[1]!, Number(m[2]), Number(m[3]), (b.snapshot as string) ?? null)),
  ],
  [
    'POST',
    path('/positions/:pos/sheets/:year/:tw/print'),
    async (m, b) =>
      ok(
        {
          ids: await local.print(
            m[1]!,
            Number(m[2]),
            Number(m[3]),
            b.kinds as PrintSnapshot['kind'][],
          ),
        },
        201,
      ),
  ],
  [
    'PUT',
    path('/positions/:pos/sheet-photos/:section'),
    async (m, b) =>
      ok(
        void (await local.setPhotos(
          m[1]!,
          String(b.quarterId),
          m[2] as SheetSection,
          b.attachmentIds as string[],
        )),
      ),
  ],
  ['GET', path('/snapshots'), async (_m, b) => ok(await local.findByNumber(String(b.number)))],
];
