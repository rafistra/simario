import { useDevSettings } from '@/state/devSettings';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps a synchronous local operation as an async API call: simulated latency, the DevPanel's
 * "next call fails" switch, and offline simulation. Swap this file for HTTP calls later.
 */
export async function call<T>(fn: () => T, opts: { write?: boolean } = {}): Promise<T> {
  const dev = useDevSettings.getState();
  if (dev.latency) await wait(150 + Math.random() * 250);
  if (dev.offline)
    throw new ApiError('offline', 'Anda sedang luring. Periksa jaringan Anda, lalu coba lagi.');
  if (dev.failNext) {
    useDevSettings.getState().set({ failNext: false });
    throw new ApiError(
      'server',
      'Koneksi ke server terputus. Periksa jaringan Anda, lalu coba lagi.',
    );
  }
  void opts;
  return fn();
}
