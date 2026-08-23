// Сырые объявления коммерческой недвижимости (Kufar, позже Realt) — см.
// scripts/sync-kufar-market-offers.mjs и SEO_PLAN.md. Строка — одно
// объявление, не готовый агрегат: таблица на гиде района и страница
// верификации (/admin/market-offers) считают сводки прямо из этих строк,
// чтобы правки владельца сразу отражались везде.

export interface MarketOffer {
  id: number;
  source: string;
  adId: string;
  dealType: 'sale' | 'rent';
  propertyType: string;
  size: number;
  pricePerSqm: number;
  finishStatus: string;
  // Отдельно от finishStatus: обработал ли владелец эту строку вручную —
  // не только статус отделки, а вообще ("проверил цену/тип/площадь и всё
  // верно" тоже ставит reviewed=true, даже если отделку не трогали).
  // Одновременно это же поле защищает строку от перезаписи при следующем
  // месячном синке (см. scripts/sync-kufar-market-offers.mjs).
  reviewed: boolean;
  address: string | null;
  adLink: string | null;
  updatedAt: string;
}

export interface MarketOfferRow {
  id: number;
  source: string;
  ad_id: string;
  deal_type: string;
  property_type: string;
  size: number;
  price_per_sqm: number;
  finish_status: string;
  reviewed: boolean;
  address: string | null;
  ad_link: string | null;
  updated_at: string;
}

// Порядок площадей в таблице.
export const AREA_BUCKET_ORDER = ['<40 м²', '40–80 м²', '80–150 м²', '150+ м²'];

export function areaBucket(size: number): string {
  if (size < 40) return '<40 м²';
  if (size < 80) return '40–80 м²';
  if (size < 150) return '80–150 м²';
  return '150+ м²';
}

export const FINISH_STATUSES = ['с отделкой', 'без отделки', 'не указано'] as const;
export type FinishStatus = (typeof FINISH_STATUSES)[number];

// Типы помещений, которые реально приходят с Kufar — офисы первыми (это
// сегмент Red One), используется и порядком строк таблицы на гиде района,
// и списком вариантов в форме редактирования на /admin/market-offers.
export const MARKET_PROPERTY_TYPES = [
  'Офисы',
  'Магазины, торговые помещения',
  'Сфера услуг',
  'Склады',
  'Промышленные помещения',
  'Прочая коммерческая',
];
