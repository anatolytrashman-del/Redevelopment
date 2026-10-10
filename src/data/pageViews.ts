// Собственный счётчик посещаемости без cookie (владелец, 2026-09-28) —
// таблица `page_views_daily`, миграция supabase/migrations/20260928-page-views-daily.sql.
// С 2026-10-10 — колонка site (platform | malls | offices), см.
// 20261010-page-views-site.sql: хиты каждого домена разделены, чтобы сводить
// все проекты в один дашборд.
// Хранит агрегаты «день + путь + сайт»: views (просмотры) и entries
// (визиты — первый просмотр загрузки страницы, см. pageViewTracker.ts).
// Ни IP, ни user-agent, ни идентификатора посетителя — поэтому не требует
// согласия на cookie и считает всех подряд, в отличие от Метрики.

export type PageViewSiteId = 'platform' | 'malls' | 'offices';

export interface PageViewDaily {
  day: string; // 'YYYY-MM-DD'
  path: string;
  site: PageViewSiteId;
  views: number;
  entries: number;
}

export interface PageViewDailyRow {
  day: string;
  path: string;
  site: string;
  views: number;
  entries: number;
}

export interface SearchVisitDaily {
  day: string;
  source: string;
  site: PageViewSiteId;
  visits: number;
}

export interface SearchVisitDailyRow {
  day: string;
  source: string;
  site: string;
  visits: number;
}
