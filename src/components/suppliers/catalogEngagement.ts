import type { PurchaseOrder } from '../../data/purchaseOrders';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { SupplierOffer } from '../../data/supplierResearch';

// Ранг «с кем уже работали» для каталога (владелец, 2026-10-09):
// 0 — были заказы, 1 — было КП, 2 — общались, 3 — остальные.
export type CatalogEngagementTier = 0 | 1 | 2 | 3;

export const CATALOG_ENGAGEMENT_LABEL: Record<CatalogEngagementTier, string | null> = {
  0: 'Заказы',
  1: 'КП',
  2: 'Писали',
  3: null,
};

export interface CatalogEngagementIndex {
  tierOf(offer: SupplierOffer): CatalogEngagementTier;
}

export function buildCatalogEngagementIndex(input: {
  offers: SupplierOffer[];
  orders: PurchaseOrder[];
  quotes: SupplierQuote[];
  emails: SupplierOfferEmail[];
}): CatalogEngagementIndex {
  const offerIdsWithOrder = new Set<string>();
  const supplierIdsWithOrder = new Set<string>();
  for (const o of input.orders) {
    if (o.offerId) offerIdsWithOrder.add(o.offerId);
    if (o.supplierId) supplierIdsWithOrder.add(o.supplierId);
  }

  const offerIdsWithQuote = new Set(input.quotes.map((q) => q.offerId));
  // КП также = цена/позиции уже на карточке (старые записи до supplier_offer_quotes).
  for (const o of input.offers) {
    if (o.items.length > 0 || o.price > 0) offerIdsWithQuote.add(o.id);
  }

  const offerIdsWithMail = new Set(input.emails.map((e) => e.offerId));

  // Агрегат по компании: если у фирмы в одной категории был заказ, а в другой
  // только письмо — в любой плитке она всё равно «с заказами».
  const companyTier = new Map<string, CatalogEngagementTier>();
  const bump = (key: string, tier: CatalogEngagementTier) => {
    const prev = companyTier.get(key);
    if (prev === undefined || tier < prev) companyTier.set(key, tier);
  };

  for (const o of input.offers) {
    const key = o.supplierId ?? o.id;
    if (offerIdsWithOrder.has(o.id) || (o.supplierId && supplierIdsWithOrder.has(o.supplierId))) {
      bump(key, 0);
    } else if (offerIdsWithQuote.has(o.id)) {
      bump(key, 1);
    } else if (offerIdsWithMail.has(o.id)) {
      bump(key, 2);
    } else {
      bump(key, 3);
    }
  }

  return {
    tierOf(offer: SupplierOffer): CatalogEngagementTier {
      return companyTier.get(offer.supplierId ?? offer.id) ?? 3;
    },
  };
}

export function compareByEngagementThenName(
  a: SupplierOffer,
  b: SupplierOffer,
  engagement: CatalogEngagementIndex,
): number {
  return engagement.tierOf(a) - engagement.tierOf(b) || a.name.localeCompare(b.name, 'ru');
}
