import { useCallback, useEffect, useRef, useState } from 'react';
import { useDb } from '@/data/local/store';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * Runs an async repository call and re-runs it whenever the database changes. The first load
 * shows `loading` (skeleton); refreshes after mutations keep the previous data on screen.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const version = useDb((s) => s.version);
  const [state, setState] = useState<{
    data: T | undefined;
    loading: boolean;
    error: Error | null;
  }>({
    data: undefined,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const depsKey = JSON.stringify(deps);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fresh = lastKey.current !== depsKey;
    lastKey.current = depsKey;
    if (fresh) setState({ data: undefined, loading: true, error: null });
    fnRef.current().then(
      (data) => !cancelled && setState({ data, loading: false, error: null }),
      (error: Error) => !cancelled && setState((s) => ({ data: s.data, loading: false, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [depsKey, version, attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
