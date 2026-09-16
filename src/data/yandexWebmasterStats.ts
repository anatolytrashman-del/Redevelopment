// Ежедневный снимок статистики Яндекс.Вебмастера по redevelopment.pro —
// сколько страниц реально в поиске + показы/клики/позиция по запросам.
// Заполняется Edge Function supabase/functions/sync-yandex-webmaster (раз
// в сутки по pg_cron; воркфлоу того же имени в Actions — ручной запуск) —
// источник данных для страницы "Показатели" в маркетинге (владелец,
// 2026-09-10: там же будут данные Яндекс.Метрики).
//
// impressions/clicks/avgPosition/avgClickPosition бывают null — Вебмастер
// отдаёт их не за каждый день (в дни без показов индикатора позиции просто
// нет). Если они пустые СПЛОШЬ — это не "сайт молодой", а сломанный синк:
// до 2026-09-16 скрипт запрашивал индикаторы параметром с неверным именем
// и получал пустой объект при HTTP 200 (см. шапку
// supabase/functions/sync-yandex-webmaster). pagesInSearch за сегодняшний
// день — живое число страниц в поиске, за прошлые дни — история от
// Яндекса, которая обновляется по апдейтам поисковой базы и отстаёт.
export interface YandexWebmasterStat {
  date: string;
  pagesInSearch: number | null;
  impressions: number | null;
  clicks: number | null;
  avgPosition: number | null;
  avgClickPosition: number | null;
}

export interface YandexWebmasterStatRow {
  date: string;
  pages_in_search: number | null;
  impressions: number | null;
  clicks: number | null;
  avg_position: number | null;
  avg_click_position: number | null;
  updated_at: string;
}

// Разбивка тех же показов/кликов ПО ЗАПРОСАМ (2026-09-16, владелец: «очень
// интересно, по каким запросам идут показы и клики»). Это СНИМОК за окно, а
// не история по дням: Вебмастер отдаёт запросы только суммой за период
// (/search-queries/popular), суточной разбивки по каждому запросу у него
// нет. Таблица целиком перезаписывается синком, поэтому выбор периода
// 7/30/90 на странице «Показатели» на неё НЕ влияет — фактические даты окна
// лежат в самих строках (dateFrom/dateTo, приходят из ответа Яндекса, он
// обрезает запрошенное окно своей глубиной истории) и подписываются в
// интерфейсе.
//
// avgClickPosition пустой у запроса без кликов — это нормально, не дефект
// синка (позицию клика считать не по чему).
export interface YandexWebmasterQuery {
  query: string;
  impressions: number | null;
  clicks: number | null;
  avgPosition: number | null;
  avgClickPosition: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  updatedAt: string;
}

export interface YandexWebmasterQueryRow {
  query: string;
  impressions: number | null;
  clicks: number | null;
  avg_position: number | null;
  avg_click_position: number | null;
  date_from: string | null;
  date_to: string | null;
  updated_at: string;
}
