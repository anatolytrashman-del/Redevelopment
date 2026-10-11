import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  PageViewDaily,
  PageViewDailyRow,
  PageViewSiteId,
  SearchVisitDaily,
  SearchVisitDailyRow,
} from '../data/pageViews';

const PAGE_SIZE = 1000;

function asSite(value: string | null | undefined): PageViewSiteId {
  if (value === 'malls' || value === 'offices' || value === 'platform') return value;
  return 'platform';
}

function fromRow(row: PageViewDailyRow): PageViewDaily {
  return {
    day: row.day,
    path: row.path,
    site: asSite(row.site),
    views: row.views,
    entries: row.entries,
  };
}

// Строк «день × путь × сайт» на растущем сайте легко больше 1000 (лимит
// PostgREST) — листаем .range(), иначе хвост молча пропадает.
export function fetchPageViewsDaily(
  sinceDate: string,
  site?: PageViewSiteId | 'all',
): Promise<PageViewDaily[]> {
  return withRetry(async () => {
    const rows: PageViewDaily[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from('page_views_daily')
        .select('*')
        .gte('day', sinceDate)
        .order('day', { ascending: true })
        .order('path', { ascending: true })
        .order('site', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (site && site !== 'all') query = query.eq('site', site);
      const { data, error } = await query;
      if (error) throw error;
      const page = (data as PageViewDailyRow[]).map(fromRow);
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  });
}

export function fetchSearchVisitsDaily(
  sinceDate: string,
  site?: PageViewSiteId | 'all',
): Promise<SearchVisitDaily[]> {
  return withRetry(async () => {
    const rows: SearchVisitDaily[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from('search_visits_daily')
        .select('*')
        .gte('day', sinceDate)
        .order('day', { ascending: true })
        .order('source', { ascending: true })
        .order('site', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (site && site !== 'all') query = query.eq('site', site);
      const { data, error } = await query;
      if (error) throw error;
      const page = (data as SearchVisitDailyRow[]).map((row) => ({
        day: row.day,
        source: row.source,
        site: asSite(row.site),
        visits: row.visits,
      }));
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  });
}
