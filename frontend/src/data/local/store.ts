// The in-memory database with localStorage persistence. All reads and writes go through the
// repository (data/repository.ts); pages never touch localStorage directly (CLAUDE.md §4).

import { produce } from 'immer';
import { create } from 'zustand';
import { COLLECTIONS, SCHEMA_VERSION, STORAGE_PREFIX, type DB } from '../db';
import { buildSeed } from '../seed';
import { seedAsOf } from '../seed/asOf';

const VERSION_KEY = `${STORAGE_PREFIX}schemaVersion`;

function readStorage(): DB | null {
  try {
    if (localStorage.getItem(VERSION_KEY) !== String(SCHEMA_VERSION)) return null;
    const db = {} as Record<string, unknown>;
    for (const c of COLLECTIONS) {
      const raw = localStorage.getItem(STORAGE_PREFIX + c);
      if (raw === null) return null;
      db[c] = JSON.parse(raw);
    }
    return db as unknown as DB;
  } catch {
    return null;
  }
}

function writeStorage(db: DB, only?: Set<string>) {
  try {
    for (const c of COLLECTIONS) {
      if (only && !only.has(c)) continue;
      localStorage.setItem(STORAGE_PREFIX + c, JSON.stringify(db[c]));
    }
    localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
  } catch {
    // Quota or private mode: the session continues in memory.
  }
}

function loadOrSeed(): DB {
  const stored = readStorage();
  if (stored) return stored;
  const seed = buildSeed();
  writeStorage(seed);
  return seed;
}

interface DbState {
  db: DB;
  /** Bumped on every mutation; queries re-run when it changes. */
  version: number;
  mutate: (recipe: (draft: DB) => void) => void;
  /** Reloads the sample data; with `asOf`, as it stood at that moment (prototype scenarios). */
  reset: (asOf?: string) => void;
}

export const useDb = create<DbState>((set, get) => ({
  db: loadOrSeed(),
  version: 0,
  mutate: (recipe) => {
    const prev = get().db;
    const next = produce(prev, recipe);
    if (next === prev) return;
    const changed = new Set(COLLECTIONS.filter((c) => next[c] !== prev[c]));
    writeStorage(next, changed);
    set((s) => ({ db: next, version: s.version + 1 }));
  },
  reset: (asOf) => {
    const seed = asOf ? seedAsOf(buildSeed(), asOf) : buildSeed();
    writeStorage(seed);
    set((s) => ({ db: seed, version: s.version + 1 }));
  },
}));

/** Synchronous snapshot for domain functions outside React. */
export const getDb = () => useDb.getState().db;
export const mutateDb = (recipe: (draft: DB) => void) => useDb.getState().mutate(recipe);

// Keep tabs of the same browser in sync (e.g. switching persona in one tab).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(STORAGE_PREFIX)) return;
    const fresh = readStorage();
    if (fresh) useDb.setState((s) => ({ db: fresh, version: s.version + 1 }));
  });
}
