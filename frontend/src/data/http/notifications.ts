// notificationApi over HTTP (docs/03_api_contract.md §4.2). Same signatures as the local version.

import type { Notification } from '@/domain/types';
import { apiFetch } from './client';

interface Page<T> {
  results: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const notificationApi = {
  /** All of the signed-in user's notifications, newest first. */
  list: async (userId: string): Promise<Notification[]> => {
    void userId; // the server reads the user from the session
    const all: Notification[] = [];
    for (let page = 1; ; page++) {
      const res = await apiFetch<Page<Notification>>('/notifications', { query: { page } });
      all.push(...res.results);
      if (all.length >= res.total || res.results.length === 0) return all;
    }
  },
  markRead: (id: string) => apiFetch<void>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: (userId: string) => {
    void userId;
    return apiFetch<void>('/notifications/read-all', { method: 'POST' });
  },
};
