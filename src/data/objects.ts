export const demandSources = ['Kufar', 'Realt'] as const;
export type DemandSource = (typeof demandSources)[number];

export interface DemandLink {
  source: DemandSource;
  url: string;
}

export interface RealtyObject {
  id: string;
  address: string;
  area: number;
  startPrice: number;
  photoUrl: string;
  floorPlanUrls: string[];
  listingUrl: string;
  owner: string;
  ownerContact: string;
  notes: string;
  concept: string;
  demandLinks: DemandLink[];
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/objectsApi.ts
export interface RealtyObjectRow {
  id: string;
  address: string;
  area: number;
  start_price: number;
  photo_url: string | null;
  floor_plan_urls: string[] | null;
  listing_url: string;
  owner: string;
  owner_contact: string;
  notes: string;
  concept: string | null;
  demand_links: DemandLink[] | null;
}

export function pricePerMeter(area: number, startPrice: number): number | null {
  if (!area || area <= 0) return null;
  return startPrice / area;
}

export function objectImages(o: Pick<RealtyObject, 'photoUrl' | 'floorPlanUrls'>): string[] {
  return [o.photoUrl, ...o.floorPlanUrls].filter(Boolean);
}
