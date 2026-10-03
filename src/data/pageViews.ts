// Собственный счётчик посещаемости без cookie (владелец, 2026-09-28) —
// таблица `page_views_daily`, миграция supabase/migrations/20260928-page-views-daily.sql.
// Хранит только агрегаты «день + путь»: views (просмотры страницы) и
// entries (визиты — первый просмотр загрузки страницы, см. pageViewTracker.ts).
// Ни IP, ни user-agent, ни идентификатора посетителя — поэтому не требует
// согласия на cookie и считает всех подряд, в отличие от Метрики (которая
// не считает тех, кто не принял cookie-баннер).

export interface PageViewDaily {
  day: string; // 'YYYY-MM-DD'
  path: string;
  views: number;
  entries: number;
}

export interface PageViewDailyRow {
  day: string;
  path: string;
  views: number;
  entries: number;
}

export interface SearchVisitDaily {
  day: string;
  source: string;
  visits: number;
}

export interface SearchVisitDailyRow {
  day: string;
  source: string;
  visits: number;
}
