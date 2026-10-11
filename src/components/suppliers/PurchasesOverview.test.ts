import { describe, expect, it } from 'vitest';
import {
  isNewPurchaseQuote,
  upcomingDeliveriesWithinDays,
} from './PurchasesOverview';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { PurchaseDelivery } from '../../data/purchaseDeliveries';

function quote(partial: Partial<SupplierQuote>): SupplierQuote {
  return {
    id: 'q1',
    offerId: 'o1',
    title: 'Счёт',
    price: 1000,
    currency: 'RUB',
    items: [],
    files: [],
    isAlternative: false,
    alternativeNote: '',
    sourceEmailId: null,
    terms: null,
    isTest: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

function delivery(partial: Partial<PurchaseDelivery>): PurchaseDelivery {
  return {
    id: 'd1',
    orderId: 'ord1',
    receiverId: null,
    receiverName: '',
    receiverPhone: '',
    status: 'planned',
    plannedDate: null,
    deliveredAt: null,
    poaNumber: '',
    poaDate: null,
    poaFile: null,
    items: [],
    files: [],
    comment: '',
    createdBy: '',
    isTest: false,
    createdAt: '2026-10-09T00:00:00Z',
    ...partial,
  };
}

describe('isNewPurchaseQuote', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('считает тестовое КП новым независимо от даты', () => {
    expect(isNewPurchaseQuote(quote({ isTest: true, createdAt: '2025-01-01T00:00:00Z' }), now)).toBe(true);
  });

  it('считает свежее живое КП новым', () => {
    expect(isNewPurchaseQuote(quote({ createdAt: '2026-10-08T10:00:00Z' }), now)).toBe(true);
  });

  it('не считает старое живое КП новым', () => {
    expect(isNewPurchaseQuote(quote({ createdAt: '2026-09-01T00:00:00Z' }), now)).toBe(false);
  });
});

describe('upcomingDeliveriesWithinDays', () => {
  const now = new Date('2026-10-09T15:00:00');

  it('берёт поставки сегодня–послезавтра и пропускает отменённые', () => {
    const list = upcomingDeliveriesWithinDays(
      [
        delivery({ id: 'today', plannedDate: '2026-10-09' }),
        delivery({ id: 'tomorrow', plannedDate: '2026-10-10' }),
        delivery({ id: 'day2', plannedDate: '2026-10-11' }),
        delivery({ id: 'later', plannedDate: '2026-10-12' }),
        delivery({ id: 'cancelled', plannedDate: '2026-10-10', status: 'cancelled' }),
        delivery({ id: 'nodate', plannedDate: null }),
      ],
      2,
      now,
    );
    expect(list.map((d) => d.id)).toEqual(['today', 'tomorrow', 'day2']);
  });
});
