import type { MetrikaDailyStat } from '../data/metrikaStats';
import type { PageViewDaily } from '../data/pageViews';

export type SiteMetricsPeriod = 'today' | 'yesterday' | 7 | 30 | 90;

// Совпадает с часовым поясом track_page_view в базе, независимо от браузера.
export function siteMetricsToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function shiftMetricsDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function metricsPeriodBounds(period: SiteMetricsPeriod, today: string, previous = false) {
  const days = typeof period === 'number' ? period : 1;
  const end = shiftMetricsDate(today, (period === 'yesterday' ? -1 : 0) - (previous ? days : 0));
  return { start: shiftMetricsDate(end, 1 - days), end };
}

export function selectMetricsPeriod<T extends { date: string }>(
  rows: T[], period: SiteMetricsPeriod, today: string, previous = false,
): T[] {
  const { start, end } = metricsPeriodBounds(period, today, previous);
  return rows.filter((row) => row.date >= start && row.date <= end);
}

// Объединяем ДАТЫ обоих источников: день без строки Метрики тоже виден.
// Максимум, а не сумма: собственный счётчик уже включает согласившихся на cookie.
export function mergeSiteDailyStats(metrika: MetrikaDailyStat[], own: PageViewDaily[]): MetrikaDailyStat[] {
  const rows = new Map(metrika.map((row) => [row.date, { ...row }]));
  const totals = new Map<string, { views: number; entries: number }>();
  for (const row of own) {
    const total = totals.get(row.day) ?? { views: 0, entries: 0 };
    total.views += row.views;
    total.entries += row.entries;
    totals.set(row.day, total);
  }
  for (const [date, total] of totals) {
    const row = rows.get(date) ?? {
      date, visits: 0, users: 0, pageviews: 0,
      bounceRate: null, pageDepth: null, avgDurationSeconds: null,
    };
    row.visits = Math.max(row.visits, total.entries);
    // Без идентификаторов это заходы на сайт, не уникальные люди.
    row.users = Math.max(row.users, total.entries);
    row.pageviews = Math.max(row.pageviews, total.views);
    rows.set(date, row);
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}
