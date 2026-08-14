export const demandSources = ['Kufar', 'Realt', 'Avito'] as const;
export type DemandSource = (typeof demandSources)[number];

export const contactChannels = ['Телефон', 'Telegram', 'WhatsApp', 'Email'] as const;
export type ContactChannel = (typeof contactChannels)[number];

export interface DemandLink {
  source: DemandSource;
  url: string;
}

// Технический паспорт здания — необязательный блок, заполняется отдельно
// от основной формы объекта (см. BuildingSpecsModal). Числовые поля — null,
// если значение неизвестно; хранится единым JSONB-полем, поэтому ключи здесь
// совпадают с тем, что лежит в building_specs один-в-один (без snake_case).
export interface BuildingSpecs {
  buildingName: string;
  buildingPurpose: string;
  yearBuilt: number | null;
  yearRenovated: number | null;
  floorsCount: number | null;
  totalArea: number | null;
  normativeArea: number | null;
  roomsCount: number | null;
  officesCount: number | null;
  bathroomsCount: number | null;
  otherRooms: string;
  foundation: string;
  walls: string;
  ceilings: string;
  structure: string;
  roof: string;
  flooring: string;
  windows: string;
  phone: string;
  electricity: string;
  water: string;
  sewerage: string;
  heating: string;
  landArea: number | null;
  landPurpose: string;
}

export const emptyBuildingSpecs: BuildingSpecs = {
  buildingName: '',
  buildingPurpose: '',
  yearBuilt: null,
  yearRenovated: null,
  floorsCount: null,
  totalArea: null,
  normativeArea: null,
  roomsCount: null,
  officesCount: null,
  bathroomsCount: null,
  otherRooms: '',
  foundation: '',
  walls: '',
  ceilings: '',
  structure: '',
  roof: '',
  flooring: '',
  windows: '',
  phone: '',
  electricity: '',
  water: '',
  sewerage: '',
  heating: '',
  landArea: null,
  landPurpose: '',
};

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
  buildingPlanIds: string[];
  buildingSpecs: BuildingSpecs | null;
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
  building_plan_ids: string[] | null;
  building_specs: BuildingSpecs | null;
}

export function pricePerMeter(area: number, startPrice: number): number | null {
  if (!area || area <= 0) return null;
  return startPrice / area;
}

export function objectImages(o: Pick<RealtyObject, 'photoUrl' | 'floorPlanUrls'>): string[] {
  return [o.photoUrl, ...o.floorPlanUrls].filter(Boolean);
}

// ID объявления — используется, чтобы сопоставить ссылку из "Проверки спроса"
// со строкой статистики в demand_stats (см. scripts/sync-*-stats.mjs).
// У Kufar/Realt id — отдельный числовой сегмент пути. У Avito id приклеен
// к слагу через подчёркивание в последнем сегменте (.../kvartira_2701234567),
// поэтому вторым шагом ищем числовой хвост последнего сегмента.
export function extractAdId(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d{5,}$/.test(segments[i])) return segments[i];
    }
    const trailing = segments[segments.length - 1]?.match(/(\d{6,})$/);
    if (trailing) return trailing[1];
  } catch {
    // не похоже на валидный URL
  }
  return null;
}
