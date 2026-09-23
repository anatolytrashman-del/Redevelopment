import type {
  BusinessCenterNearbyPlace,
  BusinessCenterNearbyPlaceRow,
  NearbyPlaceCategory,
} from '../data/businessCenterNearbyPlaces';
import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { loadBcExtra, peekBcExtra } from './buildData';

// 'restaurant' — категория, отменённая владельцем 2026-09-21 («кафе и
// рестораны делай в одну категорию»); строки со старым значением (ещё не
// пересобранные скриптом) сводим к 'cafe' здесь же, на границе с базой —
// остальной код 'restaurant' больше не знает.
const CATEGORY_ALIASES: Partial<Record<string, NearbyPlaceCategory>> = {
  restaurant: 'cafe',
};

function fromRow(row: BusinessCenterNearbyPlaceRow): BusinessCenterNearbyPlace {
  return {
    id: row.id,
    businessCenterSlug: row.business_center_slug,
    sourcePlaceId: row.source_place_id,
    name: row.name,
    category: (CATEGORY_ALIASES[row.category] ?? row.category) as NearbyPlaceCategory,
    subcategory: row.subcategory,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    distanceMeters: row.distance_meters,
    source: row.source,
    sourceUrl: row.source_url,
    collectedAt: row.collected_at,
  };
}

// Синхронно из уже пришедшего файла сборки — для первого рендера карточки.
export function peekBusinessCenterNearbyPlaces(slug: string): BusinessCenterNearbyPlace[] | null {
  const rows = peekBcExtra(slug)?.nearby;
  return rows ? (rows as BusinessCenterNearbyPlaceRow[]).map(fromRow) : null;
}

export async function fetchBusinessCenterNearbyPlaces(slug: string): Promise<BusinessCenterNearbyPlace[]> {
  // Файл .extra из сборки (src/lib/buildData.ts), в том же порядке по
  // расстоянию; в базу — только если его нет.
  const fromBuild = (await loadBcExtra(slug))?.nearby;
  if (fromBuild) return (fromBuild as BusinessCenterNearbyPlaceRow[]).map(fromRow);
  return withRetry(async () => {
    // Без .lte по distance_meters: радиус уже применён ПО КАТЕГОРИИ на сборе
    // (CATEGORY_RADIUS в scripts/nearby-places-common.mjs — метро 2000 м,
    // остановки 800 м, остальное 850 м). Здесь раньше был свой фиксированный
    // потолок 500 м, который резал по живому: 493 из 554 станций метро и 602
    // из 1119 остановок в базе лежат дальше 500 м и до блока попросту не
    // доезжали (найдено 2026-09-21 при разборе жалобы на «Проспект»).
    const { data, error } = await supabase
      .from('business_center_nearby_places')
      .select('*')
      .eq('business_center_slug', slug)
      .order('distance_meters', { ascending: true });
    if (error) throw error;
    return (data as BusinessCenterNearbyPlaceRow[]).map(fromRow);
  });
}
