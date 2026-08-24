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

// PostgREST по умолчанию отдаёт максимум 1000 строк за один select — в
// таблице их 3000+ (bir.by, см. scripts/sync-bir-primary-market.mjs),
// поэтому без пагинации возвращались бы только первые ~1000 (на практике —
// одни "Бизнес-апартаменты", они вставлены первыми). Тянем страницами по
// 1000, пока страница не окажется короче лимита.
const PAGE_SIZE = 1000;

export function fetchPrimaryMarketOffers(): Promise<PrimaryMarketOffer[]> {
  return withRetry(async () => {
    const rows: PrimaryMarketOfferRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('primary_market_offers')
        .select('*')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data as PrimaryMarketOfferRow[]));
      if (data.length < PAGE_SIZE) break;
    }
    return rows.map(fromRow);
  });
}
