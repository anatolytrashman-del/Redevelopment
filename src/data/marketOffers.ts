// Месячный агрегат по объявлениям коммерческой недвижимости (Kufar, позже
// Realt) — см. scripts/sync-kufar-market-offers.mjs и SEO_PLAN.md. Строка —
// не объявление, а уже готовая группа (тип сделки × тип помещения × площадь
// × отделка) с числом предложений и ценой за м².

export interface MarketOfferStat {
  id: number;
  month: string;
  source: string;
  dealType: 'sale' | 'rent';
  propertyType: string;
  areaBucket: string;
  finishStatus: string;
  offersCount: number;
  avgPricePerSqm: number;
  medianPricePerSqm: number;
}

export interface MarketOfferStatRow {
  id: number;
  month: string;
  source: string;
  deal_type: string;
  property_type: string;
  area_bucket: string;
  finish_status: string;
  offers_count: number;
  avg_price_per_sqm: number;
  median_price_per_sqm: number;
}

// Порядок площадей в таблице — должен совпадать с areaBucket() в скрипте синка.
export const AREA_BUCKET_ORDER = ['<40 м²', '40–80 м²', '80–150 м²', '150+ м²'];
