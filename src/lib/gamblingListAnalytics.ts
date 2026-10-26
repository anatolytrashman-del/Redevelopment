// Клиент для api/gamblinglist-analytics.js — Vercel Web Analytics проекта
// gamblinglist (gamblinglist.pro). Своего счётчика у сайта нет: он в другом
// репозитории (whitegambling), см. комментарий в api-эндпоинте.

import { authFetch } from './authFetch';

export interface GamblingDailyRow {
  day: string; // YYYY-MM-DD (UTC)
  pageviews: number;
  visitors: number;
}

export interface GamblingBreakdownRow {
  key: string;
  pageviews: number;
  visitors: number;
}

export type GamblingAnalytics =
  | { status: 'not-configured' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      since: string;
      until: string;
      daily: GamblingDailyRow[];
      pages: GamblingBreakdownRow[];
      referrers: GamblingBreakdownRow[];
      countries: GamblingBreakdownRow[];
    };

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function parseGamblingAnalytics(httpOk: boolean, body: unknown): GamblingAnalytics {
  const data = (body ?? {}) as Record<string, unknown>;
  if (!httpOk || typeof data.error === 'string') {
    return { status: 'error', message: typeof data.error === 'string' ? data.error : 'Не удалось загрузить данные' };
  }
  if (data.configured === false) return { status: 'not-configured' };
  return {
    status: 'ok',
    since: String(data.since ?? ''),
    until: String(data.until ?? ''),
    daily: rows<GamblingDailyRow>(data.daily),
    pages: rows<GamblingBreakdownRow>(data.pages),
    referrers: rows<GamblingBreakdownRow>(data.referrers),
    countries: rows<GamblingBreakdownRow>(data.countries),
  };
}

export async function fetchGamblingAnalytics(days: number): Promise<GamblingAnalytics> {
  try {
    const res = await authFetch(`/api/gamblinglist-analytics?days=${encodeURIComponent(String(days))}`);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return parseGamblingAnalytics(res.ok, body);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Сеть недоступна' };
  }
}

/** Дополняет ряд нулями за дни без строк, чтобы график не «склеивал» дыры. */
export function fillDailyGaps(daily: GamblingDailyRow[], since: string, until: string): GamblingDailyRow[] {
  const start = since.slice(0, 10);
  const end = until.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return daily;
  const byDay = new Map(daily.map((row) => [row.day, row]));
  const out: GamblingDailyRow[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cursor <= stop) {
    const day = cursor.toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, pageviews: 0, visitors: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
