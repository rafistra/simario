// Reads several backend collections for a page (B2): a shared cache per collection name, so two
// pages never overwrite each other, plus loading and error states for skeleton / "Coba Lagi".
// Pages call reload() after a mutation.

import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { DB } from '@/test/fake/db';
import { collectionsApi, type CollectionName } from '@/data/http/collections';

interface Cache {
  data: Partial<DB>;
  errors: Partial<Record<CollectionName, string>>;
  load: (names: CollectionName[]) => Promise<void>;
}

export const useCollectionCache = create<Cache>((set) => ({
  data: {},
  errors: {},
  load: async (names) => {
    await Promise.all(
      names.map(async (name) => {
        try {
          const rows = await collectionsApi.get(name);
          set((s) => ({
            data: { ...s.data, [name]: rows },
            errors: { ...s.errors, [name]: undefined },
          }));
        } catch (e) {
          set((s) => ({ errors: { ...s.errors, [name]: (e as Error).message } }));
        }
      }),
    );
  },
}));

export interface CollectionsState<K extends CollectionName> {
  db: Pick<DB, K> | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  reload: () => Promise<void>;
}

export function useCollections<K extends CollectionName>(names: K[]): CollectionsState<K> {
  const key = names.join(',');
  const data = useCollectionCache((s) => s.data);
  const errors = useCollectionCache((s) => s.errors);
  const reload = useCallback(
    () => useCollectionCache.getState().load(key.split(',') as K[]),
    [key],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return useMemo(() => {
    const list = key.split(',') as K[];
    const error = list.map((n) => errors[n]).find(Boolean) ?? null;
    const ready = list.every((n) => data[n] !== undefined);
    return {
      db: ready ? (Object.fromEntries(list.map((n) => [n, data[n]])) as Pick<DB, K>) : null,
      loading: !ready && !error,
      error,
      retry: () => void reload(),
      reload,
    };
  }, [data, errors, key, reload]);
}
