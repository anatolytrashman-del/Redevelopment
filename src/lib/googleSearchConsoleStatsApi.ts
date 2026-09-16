import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  GoogleSearchConsoleStat,
  GoogleSearchConsoleStatRow,
  GoogleSearchConsoleQuery,
  GoogleSearchConsoleQueryRow,
} from '../data/googleSearchConsoleStats';

function fromRow(row: GoogleSearchConsoleStatRow): GoogleSearchConsoleStat {
  return {
    date: row.date,
    pagesSubmitted: row.pages_submitted,
    pagesIndexed: row.pages_indexed,
    impressions: row.impressions,
    clicks: row.clicks,
    avgPosition: row.avg_position,
  };
}

export function fetchGoogleSearchConsoleStats(): Promise<GoogleSearchConsoleStat[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('google_search_console_stats').select('*').order('date', { ascending: true });
    if (error) throw error;
    return (data as GoogleSearchConsoleStatRow[]).map(fromRow);
  });
}

function queryFromRow(row: GoogleSearchConsoleQueryRow): GoogleSearchConsoleQuery {
  return {
    query: row.query,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    avgPosition: row.avg_position,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    updatedAt: row.updated_at,
  };
}

export function fetchGoogleSearchConsoleQueries(): Promise<GoogleSearchConsoleQuery[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('google_search_console_queries')
      .select('*')
      .order('impressions', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw error;
    return (data as GoogleSearchConsoleQueryRow[]).map(queryFromRow);
  });
}
