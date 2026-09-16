// Ежедневный снимок статистики Google Search Console по redevelopment.pro —
// сколько страниц из sitemap.xml реально проиндексировано + показы/клики/
// позиция по запросам. Заполняется скриптом
// scripts/sync-google-search-console-stats.mjs (раз в сутки, см.
// .github/workflows/sync-google-search-console-stats.yml) — второй,
// параллельный Яндекс.Вебмастеру источник данных для той же страницы
// "Показатели" в маркетинге (владелец, 2026-09-10: "подключим гугл консоль
// в таком же формате").
//
// pagesSubmitted/pagesIndexed заполняются только в СЕГОДНЯШНЕЙ строке (это
// состояние sitemap на момент синка, не событие конкретного дня, у Google
// нет API для истории этого показателя по дням) — в остальных строках null.
// impressions/clicks/avgPosition могут быть null, если Search Console ещё
// не обработал этот день (обычный лаг 2-3 дня).
export interface GoogleSearchConsoleStat {
  date: string;
  pagesSubmitted: number | null;
  pagesIndexed: number | null;
  impressions: number | null;
  clicks: number | null;
  avgPosition: number | null;
}

export interface GoogleSearchConsoleStatRow {
  date: string;
  pages_submitted: number | null;
  pages_indexed: number | null;
  impressions: number | null;
  clicks: number | null;
  avg_position: number | null;
  updated_at: string;
}

// Разбивка показов/кликов ПО ЗАПРОСАМ — тот же снимок за окно, что и у
// Яндекса (см. YandexWebmasterQuery), заполняется тем же синком
// (scripts/sync-google-search-console-stats.mjs, dimensions=['query']).
//
// ПУСТАЯ ТАБЛИЦА ЗДЕСЬ — ОЖИДАЕМОЕ СОСТОЯНИЕ, а не «синк не отработал»:
// Google не раскрывает редкие («анонимизированные») запросы, и пока
// показов единицы, под фильтр попадают все до одного — живая проверка
// 2026-09-16 показала 0 строк по запросам при ненулевых показах в тот же
// период. У Яндекса такого фильтра нет, поэтому его список полный, а
// гугловский может оставаться пустым ещё долго — страница обязана
// объяснять это причиной, а не молчаливым «данных нет».
export interface GoogleSearchConsoleQuery {
  query: string;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  avgPosition: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  updatedAt: string;
}

export interface GoogleSearchConsoleQueryRow {
  query: string;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  avg_position: number | null;
  date_from: string | null;
  date_to: string | null;
  updated_at: string;
}
