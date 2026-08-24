import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { PrimaryMarketOffer, PrimaryMarketOfferRow } from '../data/primaryMarketOffers';

function fromRow(row: PrimaryMarketOfferRow): PrimaryMarketOffer {
  return {
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    category: row.category,
    complex: row.complex,
    house: row.house,
    unitNumber: row.unit_number,
    floor: row.floor,
    areaM2: row.area_m2,
    terraceAreaM2: row.terrace_area_m2,
    yearHandover: row.year_handover,
    stage: row.stage,
    priceTotalByn: row.price_total_byn,
    priceTotalEur: row.price_total_eur,
    adLink: row.ad_link,
    scrapedAt: row.scraped_at,
  };
}

export function fetchPrimaryMarketOffers(): Promise<PrimaryMarketOffer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('primary_market_offers').select('*');
    if (error) throw error;
    return (data as PrimaryMarketOfferRow[]).map(fromRow);
  });
}
