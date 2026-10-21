import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * Runs an async repository call. A change in `deps` is a new query (skeleton, data cleared); a
 * change in `refresh` (a namespace revision bumped after mutations or a poll) reloads the same
 * query and keeps the previous data on screen.
 */
export function useQuery<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  refresh?: unknown,
): QueryState<T> {
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
  }, [depsKey, refresh, attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
