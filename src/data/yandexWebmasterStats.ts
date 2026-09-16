// Ежедневный снимок статистики Яндекс.Вебмастера по redevelopment.pro —
// сколько страниц реально в поиске + показы/клики/позиция по запросам.
// Заполняется скриптом scripts/sync-yandex-webmaster-stats.mjs (раз в
// сутки, см. .github/workflows/sync-yandex-webmaster-stats.yml) —
// источник данных для страницы "Показатели" в маркетинге (владелец,
// 2026-09-10: там же будут данные Яндекс.Метрики).
//
// impressions/clicks/avgPosition/avgClickPosition бывают null — Вебмастер
// отдаёт их не за каждый день (в дни без показов индикатора позиции просто
// нет). Если они пустые СПЛОШЬ — это не "сайт молодой", а сломанный синк:
// до 2026-09-16 скрипт запрашивал индикаторы параметром с неверным именем
// и получал пустой объект при HTTP 200 (см. шапку
// scripts/sync-yandex-webmaster-stats.mjs). pagesInSearch за сегодняшний
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
