// historyApi over HTTP (docs/03_api_contract.md §4.7). Same signature as data/api/history.ts.

import type { HistoryView } from '@/test/fake/api/history';
import { apiFetch } from './client';

export const historyApi = {
  history: (positionId: string, fiscalYear: number) =>
    apiFetch<HistoryView>(`/positions/${positionId}/history/${fiscalYear}`),
};
