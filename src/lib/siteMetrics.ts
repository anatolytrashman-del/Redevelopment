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

export interface SearchDailyPoint {
  date: string;
  impressions: number | null;
  clicks: number | null;
}

export interface CombinedSearchDay {
  date: string;
  impressions: number;
  clicks: number;
  yandexImpressions: number;
  yandexClicks: number;
  googleImpressions: number;
  googleClicks: number;
}

function positiveSearch(point: SearchDailyPoint | undefined): boolean {
  return (point?.impressions ?? 0) > 0 || (point?.clicks ?? 0) > 0;
}

// Сумма показов и кликов Яндекса и Google по дням: с первого дня, где хоть
// один источник показал сайт, по `today` включительно. Дыры и ещё не
// пришедший сегодняшний день — нули, чтобы правый край всегда был «сейчас»,
// а не последней строкой синка. Ведущие нули до первого показа не рисуем:
// Вебмастер хранит их с июня, когда показов ещё не было.
export function combineSearchDaily(
  yandex: SearchDailyPoint[],
  google: SearchDailyPoint[],
  today: string,
): CombinedSearchDay[] {
  const yandexByDate = new Map(yandex.map((row) => [row.date, row]));
  const googleByDate = new Map(google.map((row) => [row.date, row]));
  const known = [...new Set([...yandexByDate.keys(), ...googleByDate.keys()])].sort();
  const start = known.find((date) => positiveSearch(yandexByDate.get(date)) || positiveSearch(googleByDate.get(date)));
  if (!start) return [];
  const end = today >= start ? today : [...known].sort().at(-1) ?? start;
  const days: CombinedSearchDay[] = [];
  for (let date = start, guard = 0; date <= end && guard < 4000; date = shiftMetricsDate(date, 1), guard += 1) {
    const yandexDay = yandexByDate.get(date);
    const googleDay = googleByDate.get(date);
    const yandexImpressions = yandexDay?.impressions ?? 0;
    const yandexClicks = yandexDay?.clicks ?? 0;
    const googleImpressions = googleDay?.impressions ?? 0;
    const googleClicks = googleDay?.clicks ?? 0;
    days.push({
      date,
      yandexImpressions,
      yandexClicks,
      googleImpressions,
      googleClicks,
      impressions: yandexImpressions + googleImpressions,
      clicks: yandexClicks + googleClicks,
    });
  }
  return days;
}

// Хвост после последнего дня, который Яндекс уже отдал. null — отставания нет.
export function yandexLagNote(days: CombinedSearchDay[]): string | null {
  let lastYandex = -1;
  days.forEach((day, index) => {
    if (day.yandexImpressions > 0 || day.yandexClicks > 0) lastYandex = index;
  });
  if (lastYandex === days.length - 1) return null;
  const pending = days.slice(lastYandex + 1);
  if (pending.length === 0) return null;
  const from = pending[0].date;
  const label = `${from.slice(8, 10)}.${from.slice(5, 7)}`;
  if (pending.every((day) => day.impressions === 0 && day.clicks === 0)) {
    return `С ${label} оба источника ещё не прислали показы и клики.`;
  }
  if (pending.some((day) => day.googleImpressions > 0 || day.googleClicks > 0)) {
    return `С ${label} Яндекс ещё не отдал день. Ненулевые столбцы справа — пока только Google.`;
  }
  return null;
}

// Деления оси: 3–4 подписи, верхняя не ниже максимума.
export function chartAxisTicks(maxValue: number): number[] {
  if (maxValue <= 0) return [0, 1];
  const rough = maxValue / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((multiplier) => multiplier * pow).find((candidate) => candidate >= rough - 1e-9) ?? pow * 10;
  const top = Math.ceil((maxValue - 1e-9) / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step * 1e-6; value += step) ticks.push(Math.round(value * 1000) / 1000);
  return ticks;
}

// Шаг подписей дат, чтобы «26.08» не наезжали, когда дней становится больше,
// чем влезает в ширину графика. 1 — подпись у каждого дня.
export function chartDateEvery(plotWidth: number, dayCount: number): number {
  if (dayCount <= 1) return 1;
  if (plotWidth <= 0) return dayCount;
  return Math.max(1, Math.ceil(36 / (plotWidth / dayCount)));
}

export function chartShowsValues(plotWidth: number, dayCount: number): boolean {
  if (dayCount <= 0 || plotWidth <= 0) return false;
  return plotWidth / dayCount >= 18;
}
