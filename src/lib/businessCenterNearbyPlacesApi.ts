import type {
  BusinessCenterNearbyPlace,
  BusinessCenterNearbyPlaceRow,
  NearbyPlaceCategory,
} from '../data/businessCenterNearbyPlaces';
import { supabase } from './supabase';
import { withRetry } from './withRetry';

function fromRow(row: BusinessCenterNearbyPlaceRow): BusinessCenterNearbyPlace {
  return {
    id: row.id,
    businessCenterSlug: row.business_center_slug,
    sourcePlaceId: row.source_place_id,
    name: row.name,
    category: row.category as NearbyPlaceCategory,
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

export function fetchBusinessCenterNearbyPlaces(slug: string): Promise<BusinessCenterNearbyPlace[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('business_center_nearby_places')
      .select('*')
      .eq('business_center_slug', slug)
      .lte('distance_meters', 500)
      .order('distance_meters', { ascending: true });
    if (error) throw error;
    return (data as BusinessCenterNearbyPlaceRow[]).map(fromRow);
  });
}
