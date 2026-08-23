import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { MarketOfferStat, MarketOfferStatRow } from '../data/marketOffers';

function fromRow(row: MarketOfferStatRow): MarketOfferStat {
  return {
    id: row.id,
    month: row.month,
    source: row.source,
    dealType: row.deal_type as MarketOfferStat['dealType'],
    propertyType: row.property_type,
    areaBucket: row.area_bucket,
    finishStatus: row.finish_status,
    offersCount: row.offers_count,
    avgPricePerSqm: row.avg_price_per_sqm,
    medianPricePerSqm: row.median_price_per_sqm,
  };
}

// Отдаёт только последний собранный месяц (не всю историю) — на странице
// нужен текущий срез рынка, не таймлайн.
export function fetchLatestMarketOfferStats(): Promise<MarketOfferStat[]> {
  return withRetry(async () => {
    const { data: latest, error: latestError } = await supabase
      .from('market_offers_stats')
      .select('month')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (!latest) return [];

    const { data, error } = await supabase.from('market_offers_stats').select('*').eq('month', latest.month);
    if (error) throw error;
    return (data as MarketOfferStatRow[]).map(fromRow);
  });
}
