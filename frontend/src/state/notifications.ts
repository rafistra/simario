// The signed-in user's notifications from GET /api/v1/notifications, shared by the bell, the
// panel and /notifikasi so their counts agree. Marking read updates the list at once and
// reloads from the server.

import { useEffect } from 'react';
import { create } from 'zustand';
import { notificationApi } from '@/data/repository';
import type { Notification } from '@/domain/types';
import { now } from './clock';

interface NotificationState {
  userId: string | null;
  items: Notification[];
  loaded: boolean;
  error: string | null;
  load: (userId: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  userId: null,
  items: [],
  loaded: false,
  error: null,
  load: async (userId) => {
    if (get().userId !== userId) set({ userId, items: [], loaded: false, error: null });
    try {
      const items = await notificationApi.list(userId);
      if (get().userId === userId) set({ items, loaded: true, error: null });
    } catch (e) {
      if (get().userId === userId) set({ loaded: true, error: (e as Error).message });
    }
  },
  markRead: async (id) => {
    set((s) => ({
      items: s.items.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now() } : n)),
    }));
    await notificationApi.markRead(id).catch(() => undefined);
  },
  markAllRead: async () => {
    const { userId } = get();
    if (!userId) return;
    set((s) => ({ items: s.items.map((n) => (n.readAt ? n : { ...n, readAt: now() })) }));
    await notificationApi.markAllRead(userId).catch(() => undefined);
  },
}));

/** Loads the notifications of `userId` (the bell polls; pages reload on mount). */
export function useNotifications(userId: string) {
  const state = useNotificationStore();
  useEffect(() => {
    void useNotificationStore.getState().load(userId);
  }, [userId]);
  const mine = state.userId === userId;
  return {
    items: mine ? state.items : [],
    loaded: mine && state.loaded,
    error: mine ? state.error : null,
    unread: mine ? state.items.filter((n) => !n.readAt).length : 0,
    retry: () => void state.load(userId),
    markRead: state.markRead,
    markAllRead: state.markAllRead,
  };
}
