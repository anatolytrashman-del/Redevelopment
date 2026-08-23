import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { MarketOffer, MarketOfferRow, FinishStatus } from '../data/marketOffers';

function fromRow(row: MarketOfferRow): MarketOffer {
  return {
    id: row.id,
    source: row.source,
    adId: row.ad_id,
    dealType: row.deal_type as MarketOffer['dealType'],
    propertyType: row.property_type,
    size: row.size,
    pricePerSqm: row.price_per_sqm,
    finishStatus: row.finish_status,
    finishStatusVerified: row.finish_status_verified,
    address: row.address,
    adLink: row.ad_link,
    updatedAt: row.updated_at,
  };
}

export function fetchMarketOffers(): Promise<MarketOffer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('market_offers').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return (data as MarketOfferRow[]).map(fromRow);
  });
}

// Ручная простановка статуса отделки владельцем — помечает строку
// verified=true, чтобы следующий месячный синк её не перезаписал (см.
// scripts/sync-kufar-market-offers.mjs).
export function setMarketOfferFinishStatus(id: number, finishStatus: FinishStatus): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('market_offers')
      .update({ finish_status: finishStatus, finish_status_verified: true })
      .eq('id', id);
    if (error) throw error;
  });
}

export function deleteMarketOffer(id: number): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('market_offers').delete().eq('id', id);
    if (error) throw error;
  });
}
