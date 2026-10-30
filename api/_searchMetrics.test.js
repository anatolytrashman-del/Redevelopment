import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./_auth.js', () => ({ requireStaffAuth: vi.fn() }));
import { requireStaffAuth } from './_auth.js';
import handler, { currentMetrics, readMetricsConfig, readMetricsSnapshot, resetMetricsCache } from './search-metrics.js';
import { mergeSearchDays, normalizeSnapshot } from './_searchMetricsLive.js';
import { botExpression, botNames, withoutBots } from './_webAnalyticsBots.js';

const KEYS = ['GSC_SERVICE_ACCOUNT_JSON', 'BING_WEBMASTER_API_KEY', 'VERCEL_ANALYTICS_TOKEN'];
const saved = {};

function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
describe('GET /api/search-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMetricsCache();
    // Без ключей — только снимок, в сеть тесты не ходят.
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => { for (const k of KEYS) if (saved[k] !== undefined) process.env[k] = saved[k]; });
  it('без ключей отдаёт снимок только после авторизации', async () => {
    requireStaffAuth.mockResolvedValue({ id: 'staff' });
    const res = response();
    await handler({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const snapshot = res.json.mock.calls[0][0];
    expect(snapshot).toEqual(normalizeSnapshot(await readMetricsSnapshot(), await readMetricsConfig()));
    expect(snapshot.sites.map((s) => s.domain)).toEqual(['gamblinglist.pro', 'redevelopment.pro', 'malllist.pro', 'officelist.pro']);
    // 25.10: gamblinglist.pro 8/1098 + whitegambling.pro 0/2 (финальные данные GSC).
    expect(snapshot.sites[0].gsc.daily.find((d) => d.day === '2026-10-25')).toMatchObject({ clicks: 8, impressions: 1100 });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(JSON.stringify(snapshot)).not.toMatch(/private_key|client_email|api[_-]?key|Bearer |AuthenticationCode/i);
  });
  it('не отдаёт данные без сессии', async () => {
    requireStaffAuth.mockResolvedValue(null);
    const res = response();
    await handler({ method: 'GET' }, res);
    expect(res.json).not.toHaveBeenCalled();
  });
  it('запрещает запись', async () => {
    const res = response();
    await handler({ method: 'POST' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(requireStaffAuth).not.toHaveBeenCalled();
  });
});

describe('живой сбор', () => {
  it('склеивает домены: суммы, CTR заново, позиция взвешена по показам', () => {
    expect(mergeSearchDays([
      [{ day: '2026-10-01', clicks: 1, impressions: 10, position: 2 }],
      [{ day: '2026-10-01', clicks: 2, impressions: 90, position: 10 }, { day: '2026-10-02', clicks: 0, impressions: 0 }],
    ])).toEqual([
      { day: '2026-10-01', clicks: 3, impressions: 100, ctr: 0.03, position: 9.2 },
      { day: '2026-10-02', clicks: 0, impressions: 0 },
    ]);
  });
  it('старый снимок с отдельным whitegambling.pro склеивается в GamblingList', () => {
    const config = { sites: [{ id: 'gamblinglist', domain: 'gamblinglist.pro', domains: ['gamblinglist.pro', 'whitegambling.pro'] }] };
    const old = { generatedAt: 'x', sites: [
      { id: 'gamblinglist', gsc: { status: 'ok', daily: [{ day: '2026-10-25', clicks: 8, impressions: 1098, position: 38 }] }, bing: { status: 'ok', daily: [] }, analytics: { status: 'ok', daily: [] } },
      { id: 'wg-history', domain: 'whitegambling.pro', gsc: { status: 'ok', daily: [{ day: '2026-10-25', clicks: 0, impressions: 2, position: 60 }] }, bing: { status: 'ok', daily: [{ day: '2026-10-25', clicks: 0, impressions: 3 }] } },
    ] };
    const [site] = normalizeSnapshot(old, config).sites;
    expect(site.gsc.daily).toEqual([{ day: '2026-10-25', clicks: 8, impressions: 1100, ctr: 8 / 1100, position: (38 * 1098 + 60 * 2) / 1100 }]);
    expect(site.bing.daily).toEqual([{ day: '2026-10-25', clicks: 0, impressions: 3 }]);
  });
  it('с ключом Vercel — фильтр ботов в каждом запросе, без секретов в ответе', async () => {
    const config = await readMetricsConfig();
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      const u = new URL(url); urls.push(u);
      const by = u.searchParams.get('by');
      const data = by === 'browserName' ? [{ browserName: 'Chrome' }, { browserName: 'HeadlessChrome' }, { browserName: 'Others' }]
        : by === 'osName' ? [{ osName: 'iOS' }] : [{ timestamp: '2026-10-29T00:00:00.000Z', visitors: 3 }];
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    const data = await currentMetrics({ env: { VERCEL_ANALYTICS_TOKEN: 'secret-token' }, fetchImpl, now: new Date('2026-10-30T12:00:00Z') });
    const filters = urls.filter((u) => u.searchParams.get('by') === 'day').map((u) => u.searchParams.get('filter'));
    expect(filters.length).toBe(config.sites.length * 3);
    for (const f of filters) expect(f).toContain("browserName in ('HeadlessChrome')");
    expect(filters.filter((f) => f.includes('not ('))).toHaveLength(config.sites.length * 2);
    expect(data.sites[0].analytics.daily.at(-1)).toEqual({ day: '2026-10-29', search: 3, ai: 3, bots: 3 });
    expect(JSON.stringify(data)).not.toContain('secret-token');
  });
  it('правила ботов', () => {
    expect(botNames([{ b: 'Chrome' }, { b: 'GPTBot' }, { b: 'curl' }, { b: 'Others' }, { b: 'Yandex Browser' }], 'b', 'bot|curl|unknown')).toEqual(['GPTBot', 'curl']);
    expect(botExpression([{ match: 'names' }, { filter: "osName eq 'X'" }], { browserName: ["O'Bot"], osName: [] }))
      .toBe("browserName in ('O''Bot') or (osName eq 'X')");
    expect(withoutBots('a', 'b')).toBe('(a) and not (b)');
    expect(withoutBots(null, null)).toBeNull();
  });
});
