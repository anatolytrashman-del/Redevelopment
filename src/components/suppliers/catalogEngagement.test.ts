import { describe, expect, it } from 'vitest';
import { buildCatalogEngagementIndex } from './catalogEngagement';
import type { SupplierOffer } from '../../data/supplierResearch';
import type { PurchaseOrder } from '../../data/purchaseOrders';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';

function offer(id: string, supplierId: string | null = id): SupplierOffer {
  return {
    id,
    requestId: 'r1',
    name: id,
    supplierId,
    items: [],
    price: 0,
  } as unknown as SupplierOffer;
}

describe('buildCatalogEngagementIndex', () => {
  it('ставит заказы выше КП, КП выше переписки', () => {
    const offers = [offer('a', 'sa'), offer('b', 'sb'), offer('c', 'sc'), offer('d', 'sd')];
    const orders = [{ offerId: 'a', supplierId: 'sa' }] as PurchaseOrder[];
    const quotes = [{ offerId: 'b' }] as SupplierQuote[];
    const emails = [{ offerId: 'c' }] as SupplierOfferEmail[];
    const idx = buildCatalogEngagementIndex({ offers, orders, quotes, emails });
    expect(idx.tierOf(offers[0])).toBe(0);
    expect(idx.tierOf(offers[1])).toBe(1);
    expect(idx.tierOf(offers[2])).toBe(2);
    expect(idx.tierOf(offers[3])).toBe(3);
  });

  it('агрегирует по компании: заказ в одной категории поднимает все карточки', () => {
    const offers = [offer('a1', 'sa'), offer('a2', 'sa')];
    const orders = [{ offerId: 'a1', supplierId: 'sa' }] as PurchaseOrder[];
    const idx = buildCatalogEngagementIndex({ offers, orders, quotes: [], emails: [] });
    expect(idx.tierOf(offers[1])).toBe(0);
  });
});
