export const zoneTypes = ['room', 'common', 'bathroom', 'technical'] as const;
export type ZoneType = (typeof zoneTypes)[number];

export const zoneTypeLabels: Record<ZoneType, string> = {
  room: 'Кабинет',
  common: 'МОП (коридор, лестница)',
  bathroom: 'Санузел',
  technical: 'Техническое помещение',
};

export const zoneStatuses = ['Свободно', 'Забронировано', 'Продано'] as const;
export type ZoneStatus = (typeof zoneStatuses)[number];

export const zoneStatusBadgeClass: Record<ZoneStatus, string> = {
  Свободно: 'bg-success-bg text-success',
  Забронировано: 'bg-warning/15 text-warning',
  Продано: 'bg-danger/15 text-danger',
};

export const zoneFeatures = [
  'Свой санузел',
  'Есть мокрая точка',
  'Можно сделать мокрую точку',
  'Отдельный вход',
] as const;
export type ZoneFeature = (typeof zoneFeatures)[number];

export interface ZonePoint {
  x: number; // проценты от ширины картинки, 0–100
  y: number; // проценты от высоты картинки, 0–100
}

// Статус/клиент/площадь/особенности имеют смысл только для zoneType === 'room' —
// у общих зон (МОП, санузел, техническое) это просто подписанный контур.
export interface BuildingPlanZone {
  id: string;
  buildingPlanId: string;
  zoneType: ZoneType;
  label: string;
  area: number | null;
  status: ZoneStatus;
  leadId: string;
  features: string[];
  points: ZonePoint[];
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/buildingPlansApi.ts
export interface BuildingPlanZoneRow {
  id: string;
  building_plan_id: string;
  zone_type: string;
  label: string;
  area: number | null;
  status: string;
  lead_id: string | null;
  features: string[] | null;
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
