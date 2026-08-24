// Первичный рынок Минск Мира (bir.by) — см. scripts/sync-bir-primary-market.mjs
// и SEO_PLAN.md. Обычные квартиры (vid=Квартира) сознательно не собираются —
// владелец: "нам вообще квартиры не нужны, только апарты и остальная
// коммерция". Строка — одно объявление, не готовый агрегат (тот же принцип,
// что у market_offers для Kufar/Realt) — блок на гиде района считает сводку
// прямо из этих строк.

export interface PrimaryMarketOffer {
  id: number;
  source: string;
  externalId: string;
  category: string;
  complex: string | null;
  house: string | null;
  unitNumber: string | null;
  floor: number | null;
  areaM2: number;
  // Только у коммерческих (см. terraceAreaM2 в scripts/sync-bir-primary-market.mjs)
  // — у квартир/апартаментов/кладовых bir.by эту площадь не показывает.
  terraceAreaM2: number | null;
  yearHandover: number | null;
  // 'Сдано' | 'Строится' — только у "Бизнес-апартаменты", для сравнения
  // сданных домов с ценой на вторичке (владелец).
  stage: string | null;
  priceTotalByn: number;
  priceTotalEur: number;
  adLink: string | null;
  scrapedAt: string;
}

export interface PrimaryMarketOfferRow {
  id: number;
  source: string;
  external_id: string;
  category: string;
  complex: string | null;
  house: string | null;
  unit_number: string | null;
  floor: number | null;
  area_m2: number;
  terrace_area_m2: number | null;
  year_handover: number | null;
  stage: string | null;
  price_total_byn: number;
  price_total_eur: number;
  ad_link: string | null;
  scraped_at: string;
}

// Чистая площадь — общая минус терраса (тот же принцип, что netSize у
// market_offers для Kufar/Realt, см. src/data/marketOffers.ts): терраса
// стоит заметно дешевле закрытого помещения, официальная "Цена за м²" у
// bir.by считается по общей площади (с террасой) — искажает картину для
// офисов/торговых с террасой.
export function primaryNetAreaM2(offer: Pick<PrimaryMarketOffer, 'areaM2' | 'terraceAreaM2'>): number {
  if (offer.terraceAreaM2 == null) return offer.areaM2;
  const net = offer.areaM2 - offer.terraceAreaM2;
  return net > 0 ? net : offer.areaM2;
}

export function primaryNetPricePerM2Eur(offer: Pick<PrimaryMarketOffer, 'areaM2' | 'terraceAreaM2' | 'priceTotalEur'>): number {
  const net = primaryNetAreaM2(offer);
  return Math.round((offer.priceTotalEur / net) * 100) / 100;
}
