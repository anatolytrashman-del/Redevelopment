// Объявления о продаже/аренде помещений внутри конкретного бизнес-центра
// (владелец, 2026-09-05: "хочу спарсить объявления... эту инфу мы будем
// выводить в полной карточке") — см. scripts/sync-business-center-offers.mjs
// за тем, как и откуда они собираются. В отличие от MarketOffer
// (data/marketOffers.ts, сводная аналитика по всему рынку Минск Мира с
// ручной верификацией каждой строки) здесь нет review-флоу — просто
// актуальный список объявлений, синк полностью заменяет данные на свежие.
export interface BusinessCenterOffer {
  id: string;
  businessCenterSlug: string;
  source: string;
  adId: string;
  dealType: 'sale' | 'rent';
  propertyType: string | null;
  size: number;
  pricePerSqm: number;
  floor: number | null;
  address: string | null;
  adLink: string;
  updatedAt: string;
}

export interface BusinessCenterOfferRow {
  id: string;
  business_center_slug: string;
  source: string;
  ad_id: string;
  deal_type: string;
  property_type: string | null;
  size: number;
  price_per_sqm: number;
  floor: number | null;
  address: string | null;
  ad_link: string;
  updated_at: string;
}
