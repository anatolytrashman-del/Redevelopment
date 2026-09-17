// Снимок внешних ссылок на публичные страницы redevelopment.pro. Сейчас
// автоматически заполняется Яндекс.Вебмастером: его официальный API отдаёт
// source/destination URL и даты обнаружения/последнего обхода. Поле provider
// оставлено общим, чтобы данные из другого источника можно было добавить без
// второй параллельной таблицы.
export type SiteBacklinkProvider = 'yandex_webmaster' | 'google_search_console';

export interface SiteBacklink {
  linkKey: string;
  provider: SiteBacklinkProvider;
  sourceUrl: string;
  destinationUrl: string;
  discoveryDate: string | null;
  sourceLastAccessDate: string | null;
  updatedAt: string;
}

export interface SiteBacklinkRow {
  link_key: string;
  provider: SiteBacklinkProvider;
  source_url: string;
  destination_url: string;
  discovery_date: string | null;
  source_last_access_date: string | null;
  updated_at: string;
}
