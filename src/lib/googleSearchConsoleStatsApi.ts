import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  GscSiteId,
  GoogleSearchConsoleStat,
  GoogleSearchConsoleStatRow,
  GoogleSearchConsolePage,
  GoogleSearchConsolePageRow,
  GoogleSearchConsoleQuery,
  GoogleSearchConsoleQueryRow,
  GoogleSearchConsoleAiStat,
  GoogleSearchConsoleAiStatRow,
  GoogleSearchConsoleAiPage,
  GoogleSearchConsoleAiPageRow,
} from '../data/googleSearchConsoleStats';

function asSite(value: string | null | undefined): GscSiteId {
  if (value === 'malls' || value === 'offices' || value === 'platform') return value;
  return 'platform';
}

function fromRow(row: GoogleSearchConsoleStatRow): GoogleSearchConsoleStat {
  return {
    date: row.date,
    site: asSite(row.site),
    pagesSubmitted: row.pages_submitted,
    pagesIndexed: row.pages_indexed,
    impressions: row.impressions,
    clicks: row.clicks,
    avgPosition: row.avg_position,
  };
}

const PAGE_SIZE = 1000;

export function fetchGoogleSearchConsoleStats(site?: GscSiteId): Promise<GoogleSearchConsoleStat[]> {
  return withRetry(async () => {
    const rows: GoogleSearchConsoleStat[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from('google_search_console_stats')
        .select('*')
        .order('date', { ascending: true })
        .order('site', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (site) query = query.eq('site', site);
      const { data, error } = await query;
      if (error) throw error;
      const page = (data as GoogleSearchConsoleStatRow[]).map(fromRow);
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  });
}

function queryFromRow(row: GoogleSearchConsoleQueryRow): GoogleSearchConsoleQuery {
  return {
    query: row.query,
    site: asSite(row.site),
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    avgPosition: row.avg_position,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    updatedAt: row.updated_at,
  };
}

export function fetchGoogleSearchConsoleQueries(site?: GscSiteId): Promise<GoogleSearchConsoleQuery[]> {
  return withRetry(async () => {
    let query = supabase
      .from('google_search_console_queries')
      .select('*')
      .order('impressions', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (site) query = query.eq('site', site);
    const { data, error } = await query;
    if (error) throw error;
    return (data as GoogleSearchConsoleQueryRow[]).map(queryFromRow);
  });
}

export function fetchGoogleSearchConsolePages(site?: GscSiteId): Promise<GoogleSearchConsolePage[]> {
  return withRetry(async () => {
    let query = supabase
      .from('google_search_console_pages')
      .select('*')
      .order('impressions', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (site) query = query.eq('site', site);
    const { data, error } = await query;
    if (error) throw error;
    return (data as GoogleSearchConsolePageRow[]).map((row) => ({
      page: row.page,
      site: asSite(row.site),
      impressions: row.impressions,
      clicks: row.clicks,
      avgPosition: row.avg_position,
      dateFrom: row.date_from,
      dateTo: row.date_to,
    }));
  });
}

export function fetchGoogleSearchConsoleAiStats(): Promise<GoogleSearchConsoleAiStat[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('google_search_console_ai_stats')
      .select('*')
      .order('date', { ascending: true });
    if (error) throw error;
    return (data as GoogleSearchConsoleAiStatRow[]).map((row) => ({
      date: row.date,
      impressions: row.impressions,
      source: row.source,
    }));
  });
}

export function fetchGoogleSearchConsoleAiPages(): Promise<GoogleSearchConsoleAiPage[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('google_search_console_ai_pages')
      .select('*')
      .order('impressions', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw error;
    return (data as GoogleSearchConsoleAiPageRow[]).map((row) => ({
      page: row.page,
      impressions: row.impressions,
      dateFrom: row.date_from,
      dateTo: row.date_to,
    }));
  });
}
