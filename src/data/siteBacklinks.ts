// Снимок внешних ссылок на публичные страницы redevelopment.pro. Сейчас
// автоматически заполняется Яндекс.Вебмастером: его официальный API отдаёт
// source/destination URL и даты обнаружения/последнего обхода. Поле provider
// оставлено общим, чтобы данные из другого источника можно было добавить без
// второй параллельной таблицы.
import type { PageViewSiteId } from './pageViews';

export type SiteBacklinkProvider = 'yandex_webmaster' | 'google_search_console';
export type SiteBacklinkSiteId = PageViewSiteId;

export interface SiteBacklink {
  linkKey: string;
  site: SiteBacklinkSiteId;
  provider: SiteBacklinkProvider;
  sourceUrl: string;
  destinationUrl: string;
  discoveryDate: string | null;
  sourceLastAccessDate: string | null;
  updatedAt: string;
}

export interface SiteBacklinkRow {
  link_key: string;
  site: string;
  provider: SiteBacklinkProvider;
  source_url: string;
  destination_url: string;
  discovery_date: string | null;
  source_last_access_date: string | null;
  updated_at: string;
}
