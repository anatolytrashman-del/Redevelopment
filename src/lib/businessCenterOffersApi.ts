import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { loadBcAnalytics, loadBcExtra, loadBcMarket } from './buildData';
import type {
  BusinessCenterOffer,
  BusinessCenterOfferRow,
  BusinessCenterOfferSlice,
} from '../data/businessCenterOffers';

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

export async function fetchBusinessCenterOffers(slug: string): Promise<BusinessCenterOffer[]> {
  // Файл .extra здания лежит в сборке в том же порядке (цена, затем id), что
  // и выборка ниже; пустой массив в нём — «объявлений нет», а не «не знаю».
  const fromBuild = (await loadBcExtra(slug))?.offers;
  if (fromBuild) return (fromBuild as BusinessCenterOfferRow[]).map(fromRow);
  return withRetry(async () => {
    const rows: BusinessCenterOfferRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('business_center_offers')
        .select('*')
        .eq('business_center_slug', slug)
        .order('price_per_sqm', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data as BusinessCenterOfferRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(fromRow);
  });
}

// Все объявления по всему городу разом — для страниц аналитики
// (/minsk/analytics/ofisy/*, /minsk/bcminsk/analytics), где нужны срезы,
// которых нет в market_snapshots (площадь, этаж, метро, конкретное здание).
// PostgREST отдаёт максимум 1000 строк (см. CLAUDE.md) — листаем .range()
// до конца. Без этого хвост терялся МОЛЧА: на 2026-09-22 в таблице 1544
// строки, то есть страница аналитики офисов считала медианы по первым 1000
// и не имела ни единого признака, что чего-то не хватает.
export function fetchAllBusinessCenterOffers(): Promise<BusinessCenterOffer[]> {
  return withRetry(async () => {
    const rows: BusinessCenterOfferRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('business_center_offers')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data as BusinessCenterOfferRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(fromRow);
  });
}

// Те же объявления по всему городу, но без полей, которых нет на странице
// аналитики каталога (/minsk/bcminsk/analytics): ссылка, адрес, этаж и дата
// втрое утяжеляют ответ и ни в один срез не входят.
const SLICE_COLUMNS = 'business_center_slug,source,ad_id,deal_type,property_type,size,price_per_sqm';

type OfferSliceRow = Pick<
  BusinessCenterOfferRow,
  'business_center_slug' | 'source' | 'ad_id' | 'deal_type' | 'property_type' | 'size' | 'price_per_sqm'
>;

export async function fetchBusinessCenterOfferSlices(): Promise<BusinessCenterOfferSlice[]> {
  const fromBuild = (await loadBcAnalytics())?.offerSlices;
  if (fromBuild) return (fromBuild as OfferSliceRow[]).map(sliceFromRow);
  return withRetry(async () => {
    const rows: OfferSliceRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('business_center_offers')
        .select(SLICE_COLUMNS)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data as OfferSliceRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(sliceFromRow);
  });
}

// Один маппер на оба источника — файл сборки и ответ базы.
function sliceFromRow(row: OfferSliceRow): BusinessCenterOfferSlice {
  return {
    businessCenterSlug: row.business_center_slug,
    source: row.source,
    adId: row.ad_id,
    dealType: row.deal_type as BusinessCenterOffer['dealType'],
    propertyType: row.property_type,
    size: row.size,
    pricePerSqm: row.price_per_sqm,
  };
}

// Только слаг и площадь каждого активного лота — для фильтра «нужно N м²»
// и блока «Сейчас сдаётся» в каталоге (К13). Отдельно от
// fetchAllBusinessCenterOffers: там тянутся все поля всех 618 строк, а
// каталогу из них нужны два, и грузится он на каждый заход на страницу.
// PostgREST отдаёт максимум 1000 строк — листаем .range(), иначе при росте
// числа объявлений хвост пропадёт молча (см. CLAUDE.md).
export async function fetchBusinessCenterLotSizes(): Promise<{ businessCenterSlug: string; size: number }[]> {
  // Из файла сборки (src/lib/buildData.ts); в базу — только если его нет.
  const fromBuild = (await loadBcMarket())?.lotSizes;
  if (fromBuild) return fromBuild.map((r) => ({ businessCenterSlug: r.business_center_slug, size: r.size }));
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
