import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cumulativeMetrics, searchTotals, visibleMetricsSites, type MetricsSnapshot, type MetricsSite } from './searchMetrics';

const snapshot = JSON.parse(readFileSync(new URL('../../data/search-metrics.json', import.meta.url), 'utf8')) as MetricsSnapshot;

describe('показатели на реальном снимке', () => {
  it('GamblingList первым; WG только в общей истории', () => {
    const sites = visibleMetricsSites([...snapshot.sites].reverse());
    expect(sites[0].id).toBe('gamblinglist');
    expect(sites.map((s) => s.id).sort()).toEqual(['gamblinglist', 'malls', 'offices', 'platform']);
  });
  it('включает каждый клик один раз и сохраняет монотонность всех серий', () => {
    const rows = cumulativeMetrics(snapshot.sites);
    const last = rows[rows.length - 1];
    expect(last.clicks).toBe(snapshot.sites.reduce((n, s) => n + searchTotals(s.gsc.daily).clicks + searchTotals(s.bing.daily).clicks, 0));
    expect(last.wg).toBe(snapshot.sites.filter((s) => s.historical).reduce((n, s) => n + searchTotals(s.gsc.daily).clicks + searchTotals(s.bing.daily).clicks, 0));
    expect(last.search).toBe(snapshot.sites.flatMap((s) => s.analytics.daily).reduce((n, r) => n + r.search, 0));
    expect(last.ai).toBe(snapshot.sites.flatMap((s) => s.analytics.daily).reduce((n, r) => n + r.ai, 0));
    for (let i = 1; i < rows.length; i++) {
      for (const key of ['clicks', 'wg', 'search', 'ai'] as const) expect(rows[i][key]).toBeGreaterThanOrEqual(rows[i - 1][key]);
      expect(new Date(rows[i].day).getTime() - new Date(rows[i - 1].day).getTime()).toBe(86400000);
    }
  });
  it('не превращает отсутствие Bing у GamblingList в фиктивные нулевые строки', () => {
    expect(snapshot.sites.find((s) => s.id === 'gamblinglist')!.bing).toMatchObject({ status: 'ok', daily: [] });
  });
});

describe('математика показателей', () => {
  it('CTR и позиция взвешены по показам, а не усреднены по дням', () => {
    expect(searchTotals([
      { day: '2026-10-24', clicks: 1, impressions: 10, position: 2 },
      { day: '2026-10-25', clicks: 2, impressions: 90, position: 10 },
    ])).toEqual({ clicks: 3, impressions: 100, ctr: 0.03, position: 9.2 });
    expect(searchTotals([])).toEqual({ clicks: 0, impressions: 0, ctr: null, position: null });
  });
  it('пропущенный день переносит предыдущий итог, WG не удваивается', () => {
    const site: MetricsSite = { id: 'wg', label: 'WG (история)', domain: 'whitegambling.pro', historical: true,
      gsc: { status: 'ok', daily: [{ day: '2026-10-01', clicks: 2, impressions: 10 }, { day: '2026-10-03', clicks: 3, impressions: 20 }] },
      bing: { status: 'ok', daily: [{ day: '2026-10-03', clicks: 1, impressions: 2 }] }, analytics: { status: 'no-separate-source', daily: [] } };
    expect(cumulativeMetrics([site])).toEqual([
      { day: '2026-10-01', clicks: 2, wg: 2, search: 0, ai: 0 },
      { day: '2026-10-02', clicks: 2, wg: 2, search: 0, ai: 0 },
      { day: '2026-10-03', clicks: 6, wg: 6, search: 0, ai: 0 },
    ]);
  });
});
