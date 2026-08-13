import { supabase } from './supabase';
import { withRetry } from './withRetry';

export interface DemandStat {
  source: string;
  adId: string;
  views: number;
  calls: number;
  favorites: number;
  messages: number;
  checkedAt: string;
}

interface DemandStatRow {
  source: string;
  ad_id: string;
  views: number;
  calls: number;
  favorites: number;
  messages: number;
  checked_at: string;
}

function fromRow(row: DemandStatRow): DemandStat {
  return {
    source: row.source,
    adId: row.ad_id,
    views: row.views,
    calls: row.calls,
    favorites: row.favorites,
    messages: row.messages,
    checkedAt: row.checked_at,
  };
}

export function fetchDemandStats(adIds: string[]): Promise<DemandStat[]> {
  if (adIds.length === 0) return Promise.resolve([]);
  return withRetry(async () => {
    const { data, error } = await supabase.from('demand_stats').select('*').in('ad_id', adIds);
    if (error) throw error;
    return (data as DemandStatRow[]).map(fromRow);
  });
}
