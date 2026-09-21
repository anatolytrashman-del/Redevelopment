// 'restaurant' больше не отдельная категория (владелец, 2026-09-21: «кафе и
// рестораны делай в одну категорию») — старые строки с этим значением
// нормализуются в 'cafe' на границе с базой, см. fromRow в
// businessCenterNearbyPlacesApi.ts. 'coffee' выделен из общего 'cafe' тем же
// решением («давай соберем кофейни отдельно») — рубрика Яндекса «Кофейня»
// узнаётся отдельно от общего «Кафе», см. RUBRIC_RULES в
// scripts/nearby-places-common.mjs.
export type NearbyPlaceCategory =
  | 'metro'
  | 'transport_stop'
  | 'coffee'
  | 'cafe'
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
