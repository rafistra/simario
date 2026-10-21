import { useDevSettings } from '@/state/devSettings';
import { mockFetch } from '@/test/fetchMock';
import { ApiError } from '../errors';
import { apiFetch, setUnauthenticatedHandler, toLocalDateTime } from './client';

const ANDI = '640e8841-12a2-598c-a4d1-f5905f6c4c70';

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthenticatedHandler(null);
  useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
});

beforeEach(() => useDevSettings.getState().set({ latency: false }));

describe('apiFetch', () => {
  it('turns the error envelope into ApiError', async () => {
    mockFetch({
      'GET /api/v1/x': () => ({
        status: 409,
        body: { code: 'archived', message: 'Tahun anggaran sudah diarsipkan.', details: null },
      }),
    });
    const err = await apiFetch('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('archived');
    expect((err as ApiError).message).toBe('Tahun anggaran sudah diarsipkan.');
  });

  it('sends the CSRF token on writes', async () => {
    document.cookie = 'csrftoken=abc123';
    const calls = mockFetch({ 'POST /api/v1/x': () => ({ status: 204 }) });
    await apiFetch('/x', { method: 'POST', body: { a: 1 } });
    expect(calls[0]!.headers['X-CSRFToken']).toBe('abc123');
  });

  it('fetches the CSRF cookie first when a write has none', async () => {
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const calls = mockFetch({
      'GET /api/v1/auth/config': () => {
        document.cookie = 'csrftoken=fresh1';
        return { body: { devTools: true, oidcEnabled: true } };
      },
      'POST /api/v1/x': () => ({ status: 204 }),
    });
    await apiFetch('/x', { method: 'POST' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/v1/auth/config',
      'POST /api/v1/x',
    ]);
    expect(calls[1]!.headers['X-CSRFToken']).toBe('fresh1');
  });

  it('calls the handler on 401 unauthenticated only', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    mockFetch({
      'GET /api/v1/a': () => ({ status: 401, body: { code: 'unauthenticated', message: 'x' } }),
      'POST /api/v1/b': () => ({ status: 401, body: { code: 'login_failed', message: 'y' } }),
    });
    await apiFetch('/a').catch(() => undefined);
    await apiFetch('/b', { method: 'POST' }).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fails the next call once when the DevPanel asks', async () => {
    mockFetch({ 'GET /api/v1/x': () => ({ body: {} }) });
    useDevSettings.getState().set({ failNext: true });
    await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'server' });
    await expect(apiFetch('/x')).resolves.toEqual({});
  });

  it('bridges ids and normalises server datetimes', async () => {
    const calls = mockFetch({
      'GET /api/v1/x': () => ({ body: { userId: ANDI, at: '2027-04-06T09:00:00+08:00' } }),
    });
    const res = await apiFetch<{ userId: string; at: string }>('/x', {
      query: { user: 'usr-andi' },
    });
    expect(res).toEqual({ userId: 'usr-andi', at: '2027-04-06T09:00' });
    expect(calls[0]!.url).toContain(ANDI);
  });

  it('converts UTC datetimes to WITA', () => {
    expect(toLocalDateTime('2027-04-06T01:00:00Z')).toBe('2027-04-06T09:00');
    expect(toLocalDateTime('2027-04-06')).toBe('2027-04-06');
  });
});
