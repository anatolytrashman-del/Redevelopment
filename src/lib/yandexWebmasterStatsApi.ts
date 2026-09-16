import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  YandexWebmasterStat,
  YandexWebmasterStatRow,
  YandexWebmasterQuery,
  YandexWebmasterQueryRow,
} from '../data/yandexWebmasterStats';

function fromRow(row: YandexWebmasterStatRow): YandexWebmasterStat {
  return {
    date: row.date,
    pagesInSearch: row.pages_in_search,
    impressions: row.impressions,
    clicks: row.clicks,
    avgPosition: row.avg_position,
    avgClickPosition: row.avg_click_position,
  };
}

export function fetchYandexWebmasterStats(): Promise<YandexWebmasterStat[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('yandex_webmaster_stats').select('*').order('date', { ascending: true });
    if (error) throw error;
    return (data as YandexWebmasterStatRow[]).map(fromRow);
  });
}

function queryFromRow(row: YandexWebmasterQueryRow): YandexWebmasterQuery {
  return {
    query: row.query,
    impressions: row.impressions,
    clicks: row.clicks,
    avgPosition: row.avg_position,
    avgClickPosition: row.avg_click_position,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    updatedAt: row.updated_at,
  };
}

// Снимок запросов целиком (не по дням) — сортировка по показам сразу в
// базе, чтобы страница не тянула лишнего; строк здесь сотни, до предела
// PostgREST в 1000 далеко, но limit ставим явно — если сайт вырастет,
// молча обрезанный хвост заметить будет нечем.
export function fetchYandexWebmasterQueries(): Promise<YandexWebmasterQuery[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('yandex_webmaster_queries')
      .select('*')
      .order('impressions', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw error;
    return (data as YandexWebmasterQueryRow[]).map(queryFromRow);
  });
}
