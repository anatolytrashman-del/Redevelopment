import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  WebmasterSiteId,
  YandexWebmasterStat,
  YandexWebmasterStatRow,
  YandexWebmasterQuery,
  YandexWebmasterQueryRow,
} from '../data/yandexWebmasterStats';

function asSite(value: string | null | undefined): WebmasterSiteId {
  if (value === 'malls' || value === 'offices' || value === 'platform') return value;
  return 'platform';
}

function fromRow(row: YandexWebmasterStatRow): YandexWebmasterStat {
  return {
    date: row.date,
    site: asSite(row.site),
    pagesInSearch: row.pages_in_search,
    impressions: row.impressions,
    clicks: row.clicks,
    avgPosition: row.avg_position,
    avgClickPosition: row.avg_click_position,
  };
}

const PAGE_SIZE = 1000;

export function fetchYandexWebmasterStats(site?: WebmasterSiteId): Promise<YandexWebmasterStat[]> {
  return withRetry(async () => {
    const rows: YandexWebmasterStat[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from('yandex_webmaster_stats')
        .select('*')
        .order('date', { ascending: true })
        .order('site', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (site) query = query.eq('site', site);
      const { data, error } = await query;
      if (error) throw error;
      const page = (data as YandexWebmasterStatRow[]).map(fromRow);
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  });
}

function queryFromRow(row: YandexWebmasterQueryRow): YandexWebmasterQuery {
  return {
    query: row.query,
    site: asSite(row.site),
    impressions: row.impressions,
    clicks: row.clicks,
    avgPosition: row.avg_position,
    avgClickPosition: row.avg_click_position,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    updatedAt: row.updated_at,
  };
}

export function fetchYandexWebmasterQueries(site?: WebmasterSiteId): Promise<YandexWebmasterQuery[]> {
  return withRetry(async () => {
    let query = supabase
      .from('yandex_webmaster_queries')
      .select('*')
      .order('impressions', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (site) query = query.eq('site', site);
    const { data, error } = await query;
    if (error) throw error;
    return (data as YandexWebmasterQueryRow[]).map(queryFromRow);
  });
}
