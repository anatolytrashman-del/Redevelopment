import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { SiteBacklink, SiteBacklinkRow } from '../data/siteBacklinks';

const PAGE_SIZE = 500;

function fromRow(row: SiteBacklinkRow): SiteBacklink {
  return {
    linkKey: row.link_key,
    provider: row.provider,
    sourceUrl: row.source_url,
    destinationUrl: row.destination_url,
    discoveryDate: row.discovery_date,
    sourceLastAccessDate: row.source_last_access_date,
    updatedAt: row.updated_at,
  };
}

// Число обратных ссылок со временем может перевалить за стандартный лимит
// PostgREST в 1000 строк. Забираем снимок страницами, иначе хвост списка и
// агрегаты по доменам молча стали бы неверными.
export async function fetchSiteBacklinks(): Promise<SiteBacklink[]> {
  const rows: SiteBacklink[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await withRetry(async () => {
      const { data, error } = await supabase
        .from('site_backlinks')
        .select('*')
        .order('discovery_date', { ascending: false, nullsFirst: false })
        .order('link_key', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return (data as SiteBacklinkRow[]).map(fromRow);
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
