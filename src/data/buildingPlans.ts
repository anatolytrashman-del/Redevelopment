export const zoneTypes = ['room', 'common', 'bathroom', 'technical'] as const;
export type ZoneType = (typeof zoneTypes)[number];

export const zoneTypeLabels: Record<ZoneType, string> = {
  room: 'Кабинет',
  common: 'МОП (коридор, лестница)',
  bathroom: 'Санузел',
  technical: 'Техническое помещение',
};

export interface ZonePoint {
  x: number; // проценты от ширины картинки, 0–100
  y: number; // проценты от высоты картинки, 0–100
}

export interface BuildingPlanZone {
  id: string;
  buildingPlanId: string;
  zoneType: ZoneType;
  label: string;
  objectId: string; // только для zoneType === 'room'
  points: ZonePoint[];
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/buildingPlansApi.ts
export interface BuildingPlanZoneRow {
  id: string;
  building_plan_id: string;
  zone_type: string;
  label: string;
  object_id: string | null;
  points: ZonePoint[];
}

export interface BuildingPlan {
  id: string;
  name: string;
  imageUrl: string;
}

export interface BuildingPlanRow {
  id: string;
  name: string;
  image_url: string;
}
