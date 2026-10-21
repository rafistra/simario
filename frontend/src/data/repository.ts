// Repository: the only door to data for pages and components (CLAUDE.md §4). Every namespace is
// served by the backend (data/http/, spec §4.10).

import type { Notification } from '@/domain/types';

export { ApiError } from './errors';
export { authApi, type SsoOutcome } from './http/auth';
export { notificationApi } from './http/notifications';

export { preferenceApi } from './http/preferences';

export type { Notification };

export { masterApi, proposalApi, type ProposalRow } from './http/master';
export { registerApi, registerViewKey, useRegisterViews } from './http/register';
export { threadApi, attachmentUrl, useBoardRevision } from './http/board';
export { boardApi } from './http/board';
export { assessmentApi, useAssessmentRevision } from './http/assessment';
export { historyApi } from './http/history';
export { homeApi } from './http/home';
export { sheetApi, useSheetRevision } from './http/sheets';
export { adminApi } from './http/admin';
export { calendarApi } from './http/calendar';
export { importApi } from './http/importer';
export { insightsApi } from './http/insights';
