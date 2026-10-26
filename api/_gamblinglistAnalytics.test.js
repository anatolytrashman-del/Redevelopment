import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_auth.js', () => ({ requireStaffAuth: vi.fn(async () => ({ id: 'staff' })) }));

import handler, { normalizeBreakdown, normalizeDaily } from './gamblinglist-analytics.js';

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}

afterEach(() => {
  delete process.env.VERCEL_ANALYTICS_TOKEN;
  vi.unstubAllGlobals();
});

describe('api/gamblinglist-analytics', () => {
  it('без VERCEL_ANALYTICS_TOKEN — configured:false, в Vercel не ходит', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ configured: false, source: 'vercel-web-analytics' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('с токеном — 4 запроса к Web Analytics API проекта gamblinglist', async () => {
    process.env.VERCEL_ANALYTICS_TOKEN = 'test-token';
    const fetchSpy = vi.fn(async (url) => {
      const by = new URL(url).searchParams.get('by');
      const data = by === 'day'
        ? [{ timestamp: '2026-10-25T00:00:00.000Z', pageviews: 4, visitors: 2 }]
        : [{ [by]: by === 'requestPath' ? '/' : '', pageviews: 4, visitors: 2 }];
      return new Response(JSON.stringify({ version: 1, data }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { days: '7' } }, res);
    expect(res.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    const first = new URL(fetchSpy.mock.calls[0][0]);
    expect(first.pathname).toBe('/v1/query/web-analytics/visits/aggregate');
    expect(first.searchParams.get('projectId')).toBe('gamblinglist');
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
    expect(res.body.daily).toEqual([{ day: '2026-10-25', pageviews: 4, visitors: 2 }]);
    expect(res.body.pages[0].key).toBe('/');
    expect(JSON.stringify(res.body)).not.toContain('test-token');
  });

  it('ошибка Vercel → 502 с текстом, без токена в ответе', async () => {
    process.env.VERCEL_ANALYTICS_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'forbidden', message: 'Not authorized' } }), { status: 403 })));
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain('Not authorized');
    expect(JSON.stringify(res.body)).not.toContain('test-token');
  });

  it('normalize: сортировка и чистка', () => {
    expect(normalizeDaily([
      { timestamp: '2026-10-02T00:00:00.000Z', pageviews: '3', visitors: 1 },
      { timestamp: '2026-10-01T00:00:00.000Z', pageviews: 1, visitors: 1 },
      { timestamp: 'bad' },
    ]).map((r) => r.day)).toEqual(['2026-10-01', '2026-10-02']);
    expect(normalizeBreakdown([{ country: 'BY', pageviews: 1 }, { country: 'RU', pageviews: 5 }], 'country')[0].key).toBe('RU');
  });
});
