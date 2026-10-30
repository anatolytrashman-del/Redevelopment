import { authFetch } from './authFetch';
import metricsSources from '../../data/metrics-sources.json';

export interface SearchDay { day: string; clicks: number; impressions: number; ctr?: number; position?: number }
export interface TrafficDay { day: string; search: number; ai: number; bots?: number }
export interface MetricsSource<T> { status: string; daily: T[]; updatedAt?: string; utmStatus?: string }
export interface MetricsSite {
  id: string; label: string; domain: string; domains?: string[]; historical?: boolean; project?: string;
  gsc: MetricsSource<SearchDay>; bing: MetricsSource<SearchDay>; analytics: MetricsSource<TrafficDay>;
}
export interface MetricsSnapshot { version: number; generatedAt: string; sites: MetricsSite[] }
export interface CumulativeDay { day: string; clicks: number; search: number; ai: number }

export async function fetchSearchMetrics(): Promise<MetricsSnapshot> {
  const response = await authFetch('/api/search-metrics');
  if (!response.ok) throw new Error('Не удалось загрузить показатели.');
  return response.json() as Promise<MetricsSnapshot>;
}

/** Cumulative across the entire available history, independent of the site's period selector.
 * С 30.10.2026 whitegambling.pro склеен с gamblinglist.pro в одном сайте (api/_searchMetricsLive.js),
 * отдельной линии WG нет.
 */
export function cumulativeMetrics(sites: MetricsSite[]): CumulativeDay[] {
  const days = new Map<string, CumulativeDay>();
  function row(day: string) {
    if (!days.has(day)) days.set(day, { day, clicks: 0, search: 0, ai: 0 });
    return days.get(day)!;
  }
  for (const site of sites) {
    for (const source of [site.gsc, site.bing]) {
      for (const d of source.daily) row(d.day).clicks += d.clicks;
    }
    for (const d of site.analytics.daily) {
      row(d.day).search += d.search;
      row(d.day).ai += d.ai;
    }
  }
  const dates = [...days.keys()].sort();
  if (!dates.length) return [];
  const totals = { clicks: 0, search: 0, ai: 0 };
  const result: CumulativeDay[] = [];
  const cursor = new Date(`${dates[0]}T00:00:00Z`);
  const last = dates[dates.length - 1];
  while (cursor.toISOString().slice(0, 10) <= last) {
    const day = cursor.toISOString().slice(0, 10);
    const d = days.get(day);
    for (const key of ['clicks', 'search', 'ai'] as const) totals[key] += d?.[key] ?? 0;
    result.push({ day, ...totals });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function searchTotals(rows: SearchDay[]) {
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const positioned = rows.filter((r) => r.position !== undefined);
  const positionWeight = positioned.reduce((n, r) => n + r.impressions, 0);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : null,
    position: positionWeight ? positioned.reduce((n, r) => n + r.position! * r.impressions, 0) / positionWeight : null };
}

export function visibleMetricsSites(sites: MetricsSite[]) {
  return sites.filter((s) => !s.historical).sort((a, b) => Number(b.id === 'gamblinglist') - Number(a.id === 'gamblinglist'));
}


const SEARCH_HOSTS = new Set<string>(metricsSources.searchHosts);
const AI_HOSTS = new Set<string>(metricsSources.aiHosts);

/** Поиск / ИИ / прочее (прямые и остальные рефереры скрываются) — те же списки, что у сборщика. */
export function classifyReferrerHost(raw: string): 'search' | 'ai' | null {
  const host = raw.trim().toLowerCase().replace(/^www\./, '');
  if (!host) return null;
  if (AI_HOSTS.has(host)) return 'ai';
  if (SEARCH_HOSTS.has(host) || /^(google|yandex|bing)\.[a-z.]{2,8}$/.test(host)) return 'search';
  return null;
}

/** Сайт снимка → id вкладки «Показателей» (у GamblingList вкладка исторически 'gambling'). */
export function snapshotSiteForTab(sites: MetricsSite[], tab: string): MetricsSite | undefined {
  const id = tab === 'gambling' ? 'gamblinglist' : tab;
  return sites.find((s) => s.id === id && !s.historical);
}
