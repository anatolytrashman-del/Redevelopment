import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { PageViewDaily, PageViewDailyRow, SearchVisitDaily, SearchVisitDailyRow } from '../data/pageViews';

const PAGE_SIZE = 1000;

function fromRow(row: PageViewDailyRow): PageViewDaily {
  return {
    day: row.day,
    path: row.path,
    views: row.views,
    entries: row.entries,
  };
}

// Строк «день × путь» на растущем сайте легко больше 1000 (лимит PostgREST) —
// листаем .range(), иначе хвост (обычно самые новые дни или редкие пути)
// молча пропадает (см. правило в CLAUDE.md про 1000 строк).
export function fetchPageViewsDaily(sinceDate: string): Promise<PageViewDaily[]> {
  return withRetry(async () => {
    const rows: PageViewDaily[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('page_views_daily')
        .select('*')
        .gte('day', sinceDate)
        .order('day', { ascending: true })
        .order('path', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data as PageViewDailyRow[]).map(fromRow);
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  });
}

export function fetchSearchVisitsDaily(sinceDate: string): Promise<SearchVisitDaily[]> {
  return withRetry(async () => {
    const rows: SearchVisitDaily[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('search_visits_daily')
        .select('*')
        .gte('day', sinceDate)
        .order('day', { ascending: true })
        .order('source', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data as SearchVisitDailyRow[]).map((row) => ({
        day: row.day,
        source: row.source,
        visits: row.visits,
      }));
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  });
}
