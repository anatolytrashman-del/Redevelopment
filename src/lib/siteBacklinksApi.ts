import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { SiteBacklink, SiteBacklinkRow, SiteBacklinkSiteId } from '../data/siteBacklinks';

const PAGE_SIZE = 500;

function asSite(value: string | null | undefined): SiteBacklinkSiteId {
  if (value === 'malls' || value === 'offices' || value === 'platform') return value;
  return 'platform';
}

function fromRow(row: SiteBacklinkRow): SiteBacklink {
  return {
    linkKey: row.link_key,
    site: asSite(row.site),
    provider: row.provider,
    sourceUrl: row.source_url,
    destinationUrl: row.destination_url,
    discoveryDate: row.discovery_date,
    sourceLastAccessDate: row.source_last_access_date,
    updatedAt: row.updated_at,
  };
}

export async function fetchSiteBacklinks(site?: SiteBacklinkSiteId): Promise<SiteBacklink[]> {
  const rows: SiteBacklink[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await withRetry(async () => {
      let query = supabase
        .from('site_backlinks')
        .select('*')
        .order('discovery_date', { ascending: false, nullsFirst: false })
        .order('link_key', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (site) query = query.eq('site', site);
      const { data, error } = await query;
      if (error) throw error;
      return (data as SiteBacklinkRow[]).map(fromRow);
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
