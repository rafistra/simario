import { createContext, useContext } from 'react';
import type { DB } from '@/test/fake/db';

/** Database provided by CollectionGate (backend collections over the local store). */
export const GateDb = createContext<DB | null>(null);

/** The database of the nearest CollectionGate. */
export function useGateDb(): DB {
  const db = useContext(GateDb);
  if (!db) throw new Error('useGateDb outside CollectionGate');
  return db;
}
