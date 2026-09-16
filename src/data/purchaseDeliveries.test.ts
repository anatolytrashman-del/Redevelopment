import { describe, expect, it } from 'vitest';
import { deliveryProgress, receivedByItem, type PurchaseDelivery } from './purchaseDeliveries';
import type { PurchaseItem } from './purchases';

function item(id: string, quantity: number | null): PurchaseItem {
  return { id, sourceMaterialId: null, name: id, unit: 'шт', quantity, price: 100, note: '' };
}

function delivery(partial: Partial<PurchaseDelivery>): PurchaseDelivery {
  return {
    id: 'd1',
    orderId: 'o1',
    receiverId: null,
    receiverName: '',
    receiverPhone: '',
    status: 'delivered',
    plannedDate: null,
    deliveredAt: null,
    poaNumber: '',
    poaDate: null,
    poaFile: null,
    items: [],
    files: [],
    comment: '',
    createdBy: '',
    createdAt: '2026-09-16T00:00:00Z',
    ...partial,
  };
}

describe('receivedByItem', () => {
  it('складывает количества по нескольким поставкам', () => {
    const received = receivedByItem([
      delivery({ id: 'd1', items: [{ itemId: 'a', quantity: 100 }] }),
      delivery({ id: 'd2', items: [{ itemId: 'a', quantity: 52 }, { itemId: 'b', quantity: 3 }] }),
    ]);
    expect(received.get('a')).toBe(152);
    expect(received.get('b')).toBe(3);
  });

  it('не засчитывает запланированное и отменённое — товара ещё (или уже) нет', () => {
    const received = receivedByItem([
      delivery({ id: 'd1', status: 'planned', items: [{ itemId: 'a', quantity: 100 }] }),
      delivery({ id: 'd2', status: 'shipped', items: [{ itemId: 'a', quantity: 10 }] }),
      delivery({ id: 'd3', status: 'cancelled', items: [{ itemId: 'a', quantity: 5 }] }),
    ]);
    expect(received.get('a')).toBeUndefined();
  });

  it('засчитывает претензию: товар привезли, просто с браком', () => {
    const received = receivedByItem([delivery({ status: 'claim', items: [{ itemId: 'a', quantity: 7 }] })]);
    expect(received.get('a')).toBe(7);
  });
});

describe('deliveryProgress', () => {
  const items = [item('a', 10), item('b', 5)];

  it('частичная поставка: закрыта одна позиция из двух', () => {
    const progress = deliveryProgress(items, [delivery({ items: [{ itemId: 'a', quantity: 10 }] })]);
    expect(progress).toMatchObject({ total: 2, done: 1, partial: true, over: false });
  });

  it('заказ закрыт целиком', () => {
    const progress = deliveryProgress(items, [
      delivery({ id: 'd1', items: [{ itemId: 'a', quantity: 10 }] }),
      delivery({ id: 'd2', items: [{ itemId: 'b', quantity: 5 }] }),
    ]);
    expect(progress).toMatchObject({ total: 2, done: 2, partial: false });
  });

  it('позиции без количества (строка доставки) в знаменатель не идут', () => {
    const progress = deliveryProgress([item('a', 10), item('delivery', null)], [
      delivery({ items: [{ itemId: 'a', quantity: 10 }] }),
    ]);
    expect(progress.total).toBe(1);
    expect(progress.done).toBe(1);
  });

  it('дробные количества из счетов закрываются с допуском', () => {
    const progress = deliveryProgress([item('a', 993.6)], [delivery({ items: [{ itemId: 'a', quantity: 993.599 }] })]);
    expect(progress.done).toBe(1);
  });

  it('привезли больше заказанного — помечаем, а не прячем', () => {
    const progress = deliveryProgress([item('a', 10)], [delivery({ items: [{ itemId: 'a', quantity: 12 }] })]);
    expect(progress.over).toBe(true);
  });
});
