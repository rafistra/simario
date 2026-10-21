import { useMemo, type ReactNode } from 'react';
import type { CollectionName } from '@/data/http/collections';
import { useDb } from '@/data/local/store';
import { useCollections } from '@/lib/useCollections';
import { InlineAlert, LoadingRegion, Skeleton } from '../Feedback/Feedback';
import { GateDb } from './gateDb';

/**
 * First-load gate for pages whose data moved to the backend (B2): loads `names` through
 * useCollections, shows the skeleton or the error with "Coba Lagi" (§2.4), then gives children
 * one database where those collections come from the backend and the rest (registers, risks —
 * still local until B3) from the local store. Mutations reload their collections themselves
 * (data/http/master.ts), so children re-render with the result.
 */
export function CollectionGate({
  names,
  children,
  label = 'Memuat…',
}: {
  names: CollectionName[];
  children: ReactNode;
  label?: string;
}) {
  const state = useCollections(names);
  const local = useDb((s) => s.db);
  const db = useMemo(() => (state.db ? { ...local, ...state.db } : null), [local, state.db]);
  if (state.error)
    return (
      <InlineAlert variant="error" title="Data gagal dimuat" onRetry={state.retry}>
        {state.error}
      </InlineAlert>
    );
  if (!db)
    return (
      <LoadingRegion label={label}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={56} width="40%" />
          <Skeleton height={44} />
          <Skeleton height={320} radius="lg" />
        </div>
      </LoadingRegion>
    );
  return <GateDb.Provider value={db}>{children}</GateDb.Provider>;
}
