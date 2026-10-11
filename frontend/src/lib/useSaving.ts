import { useCallback, useState } from 'react';
import { toast } from '@/components';

/**
 * Runs repository writes, tracking whether any is in flight ("Menyimpan…") and surfacing failures
 * as an error toast. Resolves to the result, or undefined when the call failed.
 */
export function useSaving() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const run = useCallback(
    async <T>(
      work: Promise<T>,
      errorTitle = 'Perubahan tidak tersimpan',
    ): Promise<T | undefined> => {
      setPending((n) => n + 1);
      try {
        const result = await work;
        setFailed(false);
        return result;
      } catch (e) {
        setFailed(true);
        toast.error(errorTitle, (e as Error).message);
        return undefined;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [],
  );
  return { saving: pending > 0, failed, run };
}
