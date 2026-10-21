import { useDevSettings } from '@/state/devSettings';
import { ApiError, DISCONNECTED_MESSAGE, OFFLINE_MESSAGE } from '@/data/errors';

export { ApiError } from '@/data/errors';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps a synchronous local operation as an async API call: simulated latency, the DevPanel's
 * "next call fails" switch, and offline simulation. Swap this file for HTTP calls later.
 */
export async function call<T>(fn: () => T, opts: { write?: boolean } = {}): Promise<T> {
  const dev = useDevSettings.getState();
  if (dev.latency) await wait(150 + Math.random() * 250);
  if (dev.offline) throw new ApiError('offline', OFFLINE_MESSAGE);
  if (dev.failNext) {
    useDevSettings.getState().set({ failNext: false });
    throw new ApiError('server', DISCONNECTED_MESSAGE);
  }
  void opts;
  return fn();
}
