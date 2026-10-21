// calendarApi over HTTP (docs/03_api_contract.md §4.12). Same signatures as data/api/calendar.ts.

import type { Quarter } from '@/domain/types';
import { useCollectionCache } from '@/lib/useCollections';
import { apiFetch, type FetchInit } from './client';
import type { CollectionName } from './collections';

const CALENDAR: CollectionName[] = ['fiscalYears', 'quarters', 'quarterAssessors'];

async function mutate(path: string, init: FetchInit): Promise<void> {
  await apiFetch<void>(path, init);
  await useCollectionCache.getState().load(CALENDAR);
}

export const calendarApi = {
  createFiscalYear: (year: number) => mutate('/fiscal-years', { method: 'POST', body: { year } }),

  updateFiscalYear: (year: number, patch: { toleranceDays?: number; archiveGraceDays?: number }) =>
    mutate(`/fiscal-years/${year}`, { method: 'PATCH', body: patch }),

  updateQuarter: (
    quarterId: string,
    patch: Partial<Omit<Quarter, 'id' | 'fiscalYear' | 'number' | 'scoreBandVersionId'>>,
    confirmPastDeadline = false,
  ) =>
    mutate(`/quarters/${quarterId}`, {
      method: 'PATCH',
      body: { ...patch, confirmPastDeadline },
    }),

  excludeAssessor: (quarterId: string, positionId: string, reason: string) =>
    mutate(`/quarters/${quarterId}/assessors/${positionId}/exclude`, {
      method: 'POST',
      body: { reason },
    }),

  archiveManually: (year: number) => mutate(`/fiscal-years/${year}/archive`, { method: 'POST' }),
};
