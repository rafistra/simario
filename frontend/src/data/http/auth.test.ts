import { useDevSettings } from '@/state/devSettings';
import { mockFetch } from '@/test/fetchMock';
import { authApi } from './auth';

beforeEach(() => useDevSettings.getState().set({ latency: false }));
afterEach(() => vi.unstubAllGlobals());

describe('authApi over HTTP', () => {
  it('returns the lockout message as an outcome', async () => {
    const message = 'Akun dikunci sementara setelah 5 kali gagal masuk. Coba lagi dalam 15 menit.';
    mockFetch({
      'POST /api/v1/auth/login': () => ({ status: 423, body: { code: 'locked_out', message } }),
    });
    await expect(authApi.signInLocal('1', 'x')).resolves.toEqual({ ok: false, message });
  });

  it('signs in a persona by NIP', async () => {
    const calls = mockFetch({
      'POST /api/v1/dev/impersonate': () => ({
        body: { ok: true, userId: '640e8841-12a2-598c-a4d1-f5905f6c4c70' },
      }),
    });
    await expect(authApi.signInSso('198204172008011003')).resolves.toEqual({
      ok: true,
      userId: '640e8841-12a2-598c-a4d1-f5905f6c4c70',
    });
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ nip: '198204172008011003' });
  });

  it('still throws errors that are not sign-in refusals', async () => {
    mockFetch({
      'POST /api/v1/auth/login': () => ({ status: 500, body: { code: 'server', message: 'x' } }),
    });
    await expect(authApi.signInLocal('1', 'x')).rejects.toMatchObject({ code: 'server' });
  });
});
