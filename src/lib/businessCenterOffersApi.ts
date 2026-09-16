import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { BusinessCenterOffer, BusinessCenterOfferRow } from '../data/businessCenterOffers';

function fromRow(row: BusinessCenterOfferRow): BusinessCenterOffer {
  return {
    id: row.id,
    businessCenterSlug: row.business_center_slug,
    source: row.source,
    adId: row.ad_id,
    dealType: row.deal_type as BusinessCenterOffer['dealType'],
    propertyType: row.property_type,
    size: row.size,
    pricePerSqm: row.price_per_sqm,
    floor: row.floor,
    address: row.address,
    adLink: row.ad_link,
    updatedAt: row.updated_at,
  };
}

export function fetchBusinessCenterOffers(slug: string): Promise<BusinessCenterOffer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('business_center_offers')
      .select('*')
      .eq('business_center_slug', slug)
      .order('price_per_sqm', { ascending: true });
    if (error) throw error;
    return (data as BusinessCenterOfferRow[]).map(fromRow);
  });
}

// Все объявления по всему городу разом — для страниц аналитики
// (/minsk/analytics/ofisy/*), где нужны срезы, которых нет в
// market_snapshots (площадь, этаж, метро, конкретное здание).
export function fetchAllBusinessCenterOffers(): Promise<BusinessCenterOffer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('business_center_offers').select('*');
    if (error) throw error;
    return (data as BusinessCenterOfferRow[]).map(fromRow);
  });
}

// Только слаг и площадь каждого активного лота — для фильтра «нужно N м²»
// и блока «Сейчас сдаётся» в каталоге (К13). Отдельно от
// fetchAllBusinessCenterOffers: там тянутся все поля всех 618 строк, а
// каталогу из них нужны два, и грузится он на каждый заход на страницу.
// PostgREST отдаёт максимум 1000 строк — листаем .range(), иначе при росте
// числа объявлений хвост пропадёт молча (см. CLAUDE.md).
export function fetchBusinessCenterLotSizes(): Promise<{ businessCenterSlug: string; size: number }[]> {
  return withRetry(async () => {
    const rows: { business_center_slug: string; size: number }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('business_center_offers')
        .select('business_center_slug,size')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data as { business_center_slug: string; size: number }[]));
      if (data.length < PAGE) break;
    }
    return rows.map((r) => ({ businessCenterSlug: r.business_center_slug, size: r.size }));
  });
}
