// Minimal fetch stub for HTTP-layer tests: route by "METHOD /path" (query ignored).

export interface MockRequest {
  method: string;
  path: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface MockReply {
  status?: number;
  body?: unknown;
}

export type Routes = Record<string, (req: MockRequest) => MockReply | Promise<MockReply>>;

export function mockFetch(routes: Routes): MockRequest[] {
  const calls: MockRequest[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const method = (init.method ?? 'GET').toUpperCase();
    const req: MockRequest = {
      method,
      path: url.pathname,
      url: url.pathname + url.search,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    calls.push(req);
    const handler = routes[`${method} ${url.pathname}`];
    const reply = handler ? await handler(req) : { status: 404, body: { code: 'not_found' } };
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? null), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return calls;
}
