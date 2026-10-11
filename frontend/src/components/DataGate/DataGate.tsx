import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { call } from '@/data/local/call';
import { InlineAlert, LoadingRegion, Skeleton } from '../Feedback/Feedback';

/**
 * First-load gate for pages that read the local store synchronously: runs one repository round
 * trip (simulated latency, DevPanel failures, offline) so the page shows the skeleton and the
 * error state with "Coba Lagi" like an API-backed page would (§2.4).
 */
export function DataGate({ children, label = 'Memuat…' }: { children: ReactNode; label?: string }) {
  const [state, setState] = useState<'loading' | 'ready' | Error>('loading');
  const load = useCallback(() => {
    setState('loading');
    call(() => true).then(
      () => setState('ready'),
      (e: Error) => setState(e),
    );
  }, []);
  useEffect(load, [load]);
  if (state === 'ready') return <>{children}</>;
  if (state instanceof Error)
    return (
      <InlineAlert variant="error" title="Data gagal dimuat" onRetry={load}>
        {state.message}
      </InlineAlert>
    );
  return (
    <LoadingRegion label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton height={56} width="40%" />
        <Skeleton height={44} />
        <Skeleton height={320} radius="lg" />
      </div>
    </LoadingRegion>
  );
}
