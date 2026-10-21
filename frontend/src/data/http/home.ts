// homeApi over HTTP (docs/03_api_contract.md §4.7). Same signatures as data/api/home.ts.

import type { HomeView, PositionListRow } from '../api/home';
import { apiFetch } from './client';

export const homeApi = {
  home: (activePositionId: string | null) =>
    apiFetch<HomeView>(`/home${activePositionId ? `?position=${activePositionId}` : ''}`),
  positions: () => apiFetch<PositionListRow[]>('/my-positions'),
};
