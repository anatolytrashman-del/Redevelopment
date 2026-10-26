// Разовая выгрузка Vercel Observability (CLI `vercel metrics vercel.request.count
// -p gamblinglist --prod --since 30d -g 1d`), 2026-10-26. Хранится у Vercel ~30 дней,
// поэтому зафиксирована в репозитории; Web Analytics задним числом не считает.
// Сутки — UTC. Неполный день выгрузки (26 окт) не включён.
//   requests  — все запросы к проекту gamblinglist (боты, ассеты, редиректы);
//   pageHits  — фильтр botCategory:"" AND contentType:"text/html; charset=utf-8"
//               (на 25–26 окт: ~90% ответов 200, остальное 404, все на gamblinglist.pro);
//   uniqueIps — то же, aggregation unique/clientIp; null — в этот день хитов не было.
// Ничего не досчитано и не оценено — только то, что вернул Vercel.

export interface GamblingRequestDay {
  day: string;
  requests: number;
  pageHits: number;
  uniqueIps: number | null;
}

export const GAMBLINGLIST_REQUEST_HISTORY_META = {
  from: '2026-10-07',
  to: '2026-10-25',
  exportedAt: '2026-10-26',
  retentionDays: 30,
} as const;

export const GAMBLINGLIST_REQUEST_HISTORY: GamblingRequestDay[] = [
  { day: '2026-10-07', requests: 546, pageHits: 55, uniqueIps: 38 },
  { day: '2026-10-08', requests: 1131, pageHits: 101, uniqueIps: 33 },
  { day: '2026-10-09', requests: 1308, pageHits: 105, uniqueIps: 42 },
  { day: '2026-10-10', requests: 916, pageHits: 26, uniqueIps: 13 },
  { day: '2026-10-11', requests: 2628, pageHits: 150, uniqueIps: 21 },
  { day: '2026-10-12', requests: 5232, pageHits: 229, uniqueIps: 15 },
  { day: '2026-10-13', requests: 2889, pageHits: 69, uniqueIps: 28 },
  { day: '2026-10-14', requests: 7769, pageHits: 128, uniqueIps: 32 },
  { day: '2026-10-15', requests: 8508, pageHits: 57, uniqueIps: 24 },
  { day: '2026-10-16', requests: 1969, pageHits: 0, uniqueIps: null },
  { day: '2026-10-17', requests: 1555, pageHits: 0, uniqueIps: null },
  { day: '2026-10-18', requests: 3395, pageHits: 0, uniqueIps: null },
  { day: '2026-10-19', requests: 20370, pageHits: 0, uniqueIps: null },
  { day: '2026-10-20', requests: 17203, pageHits: 177, uniqueIps: 107 },
  { day: '2026-10-21', requests: 8742, pageHits: 380, uniqueIps: 322 },
  { day: '2026-10-22', requests: 16408, pageHits: 423, uniqueIps: 396 },
  { day: '2026-10-23', requests: 8618, pageHits: 449, uniqueIps: 438 },
  { day: '2026-10-24', requests: 7960, pageHits: 1435, uniqueIps: 1423 },
  { day: '2026-10-25', requests: 4977, pageHits: 1158, uniqueIps: 1150 },
];
