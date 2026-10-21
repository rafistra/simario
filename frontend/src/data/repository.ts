// Repository: the only door to data for pages and components (CLAUDE.md §4). Each namespace is
// async; namespaces move from the local implementation to data/http/ stage by stage (spec §4.10).

import type { Notification } from '@/domain/types';
import { getDb, mutateDb } from './local/store';

export { ApiError } from './errors';
export { authApi, type SsoOutcome } from './http/auth';
export { notificationApi } from './http/notifications';

export const preferenceApi = {
  get: <T>(userId: string, key: string): T | undefined =>
    getDb().preferences.find((p) => p.userId === userId && p.key === key)?.value as T | undefined,
  set: (userId: string, key: string, value: unknown) =>
    mutateDb((d) => {
      const p = d.preferences.find((x) => x.userId === userId && x.key === key);
      if (p) p.value = value;
      else d.preferences.push({ userId, key, value });
    }),
};

export type { Notification };

export { masterApi, proposalApi, type ProposalRow } from './http/master';
export { registerApi, registerViewKey, useRegisterViews } from './http/register';
export { threadApi } from './api/thread';
export { boardApi } from './api/board';
export { assessmentApi } from './api/assessment';
export { historyApi } from './api/history';
export { homeApi } from './api/home';
export { sheetApi } from './api/sheets';
export { adminApi } from './http/admin';
export { calendarApi } from './http/calendar';
export { importApi } from './http/importer';
export { insightsApi } from './api/insights';
