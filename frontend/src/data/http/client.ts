// HTTP client for the Django API (spec §4.10): same-origin session cookie, CSRF header, the
// error envelope as ApiError, the DevPanel's latency/offline/fail-next switches, the temporary
// id bridge, and server datetimes normalised to the prototype's 'YYYY-MM-DDTHH:mm' (WITA).

import { useDevSettings } from '@/state/devSettings';
import { ApiError, DISCONNECTED_MESSAGE, OFFLINE_MESSAGE } from '../errors';
import { toBackendIds, toLocalIds } from './legacyIds';

const BASE = '/api/v1';
const WITA_MS = 8 * 60 * 60 * 1000;
const SERVER_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

let onUnauthenticated: (() => void) | null = null;

/** Called once by the app: a 401 `unauthenticated` ends the session (→ /login?alasan=…). */
export function setUnauthenticatedHandler(fn: (() => void) | null) {
  onUnauthenticated = fn;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : '';
}

/** '2027-04-06T09:00:00+08:00' → '2027-04-06T09:00' (WITA). Other strings are unchanged. */
export function toLocalDateTime(value: string): string {
  if (!SERVER_DATETIME.test(value)) return value;
  if (value.endsWith('+08:00')) return value.slice(0, 16);
  return new Date(new Date(value).getTime() + WITA_MS).toISOString().slice(0, 16);
}

function normaliseDates(value: unknown): unknown {
  if (typeof value === 'string') return toLocalDateTime(value);
  if (Array.isArray(value)) return value.map(normaliseDates);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseDates(v)]));
  return value;
}

export interface FetchInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Multipart body (uploads); ids inside are the caller's to translate. */
  form?: FormData;
  query?: Record<string, string | number | undefined>;
}

export async function apiFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
  const dev = useDevSettings.getState();
  if (dev.latency) await wait(150 + Math.random() * 250);
  if (dev.offline) throw new ApiError('offline', OFFLINE_MESSAGE);
  if (dev.failNext) {
    useDevSettings.getState().set({ failNext: false });
    throw new ApiError('server', DISCONNECTED_MESSAGE);
  }

  const method = init.method ?? 'GET';
  const url = new URL(BASE + toBackendIds(path), window.location.origin);
  for (const [key, value] of Object.entries(init.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, String(toBackendIds(value)));
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined && !init.form) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    // A fresh browser (or a session restored from its cookie) has no CSRF cookie yet;
    // GET /auth/config sets it.
    if (!csrfToken())
      await fetch(`${BASE}/auth/config`, { credentials: 'same-origin' }).catch(() => undefined);
    headers['X-CSRFToken'] = csrfToken();
  }

  let res: Response;
  try {
    res = await fetch(url.pathname + url.search, {
      method,
      credentials: 'same-origin',
      headers,
      body:
        init.form ??
        (init.body === undefined ? undefined : JSON.stringify(toBackendIds(init.body))),
    });
  } catch {
    throw new ApiError('offline', OFFLINE_MESSAGE);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    const code = body.code ?? 'server';
    if (res.status === 401 && code === 'unauthenticated') onUnauthenticated?.();
    throw new ApiError(code, body.message ?? DISCONNECTED_MESSAGE, toLocalIds(body.details));
  }
  return toLocalIds(normaliseDates(data)) as T;
}
