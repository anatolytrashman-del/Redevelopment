export type NearbyPlaceCategory =
  | 'metro'
  | 'transport_stop'
  | 'cafe'
  | 'restaurant'
  | 'grocery'
  | 'shop'
  | 'pharmacy'
  | 'bank'
  | 'atm'
  | 'fitness'
  | 'other';

export interface BusinessCenterNearbyPlace {
  id: string;
  businessCenterSlug: string;
  sourcePlaceId: string;
  name: string;
  category: NearbyPlaceCategory;
  subcategory: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distanceMeters: number;
  source: string;
  sourceUrl: string | null;
  collectedAt: string;
}

export interface BusinessCenterNearbyPlaceRow {
  id: string;
  business_center_slug: string;
  source_place_id: string;
  name: string;
  category: string;
  subcategory: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distance_meters: number;
  source: string;
  source_url: string | null;
  collected_at: string;
}
