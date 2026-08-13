export const demandSources = ['Kufar', 'Realt'] as const;
export type DemandSource = (typeof demandSources)[number];

export const contactChannels = ['Телефон', 'Telegram', 'WhatsApp', 'Email'] as const;
export type ContactChannel = (typeof contactChannels)[number];

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
  contactName: string;
  contactPosition: string;
  contactChannel: ContactChannel | '';
  notes: string;
  concept: string;
  demandLinks: DemandLink[];
  inspectionMediaUrl: string;
  buildingPlanId: string;
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
  contact_name: string | null;
  contact_position: string | null;
  contact_channel: string | null;
  notes: string;
  concept: string | null;
  demand_links: DemandLink[] | null;
  inspection_media_url: string | null;
  building_plan_id: string | null;
}

export function pricePerMeter(area: number, startPrice: number): number | null {
  if (!area || area <= 0) return null;
  return startPrice / area;
}

export function objectImages(o: Pick<RealtyObject, 'photoUrl' | 'floorPlanUrls'>): string[] {
  return [o.photoUrl, ...o.floorPlanUrls].filter(Boolean);
}

// ID объявления — последний числовой сегмент пути в ссылке на Kufar/Realt.
// Используется, чтобы сопоставить ссылку из "Проверки спроса" со строкой
// статистики в demand_stats (см. scripts/sync-kufar-stats.mjs).
export function extractAdId(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d{5,}$/.test(segments[i])) return segments[i];
    }
  } catch {
    // не похоже на валидный URL
  }
  return null;
}
