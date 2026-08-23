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
    reviewed: row.reviewed,
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

// Быстрая простановка статуса отделки прямо из таблицы — считается
// обработкой строки (reviewed=true), чтобы следующий месячный синк её не
// перезаписал (см. scripts/sync-kufar-market-offers.mjs).
export function setMarketOfferFinishStatus(id: number, finishStatus: FinishStatus): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('market_offers').update({ finish_status: finishStatus, reviewed: true }).eq('id', id);
    if (error) throw error;
  });
}

// Независимый тумблер "Не обработано"/"Проверено" — владелец может
// отметить строку разобранной, даже не меняя в ней ничего (например,
// свериться по ссылке и убедиться, что "не указано" — это и есть правда).
export function setMarketOfferReviewed(id: number, reviewed: boolean): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('market_offers').update({ reviewed }).eq('id', id);
    if (error) throw error;
  });
}

export interface MarketOfferEditPatch {
  dealType: 'sale' | 'rent';
  propertyType: string;
  size: number;
  pricePerSqm: number;
  finishStatus: string;
  address: string;
}

// Полное редактирование строки (цена/тип/площадь/сделка/отделка/адрес) —
// тоже считается обработкой.
export function updateMarketOffer(id: number, patch: MarketOfferEditPatch): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('market_offers')
      .update({
        deal_type: patch.dealType,
        property_type: patch.propertyType,
        size: patch.size,
        price_per_sqm: patch.pricePerSqm,
        finish_status: patch.finishStatus,
        address: patch.address || null,
        reviewed: true,
      })
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

// Группы дублей, которые ассистент уже посмотрел вручную и подтвердил —
// это реально два разных помещения, не повтор. Ключ — тот же dedupKey
// (data/marketOffers.ts), что группирует карточки на /admin/market-offers;
// раз отклонённая группа больше не считается дублем и не подсвечивается.
export function fetchDismissedDedupKeys(): Promise<Set<string>> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('market_offer_dedup_dismissals').select('key');
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.key as string));
  });
}

export function dismissDuplicateGroup(key: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('market_offer_dedup_dismissals').upsert({ key }, { onConflict: 'key' });
    if (error) throw error;
  });
}
