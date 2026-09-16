import { describe, expect, it } from 'vitest';
import {
  buildPurchaseOrderDrafts,
  purchaseOrderTotal,
  type OrderDraftCell,
  type OrderDraftPick,
  type OrderDraftSupplier,
} from './purchaseOrders';

function cell(patch: Partial<OrderDraftCell> & { offerId: string; unitPrice: number }): OrderDraftCell {
  return {
    itemId: 'i1',
    currency: 'RUB',
    kind: 'exact',
    note: '',
    productUrl: '',
    ...patch,
  };
}

function pick(id: string, name: string, quantity: number | null, c: OrderDraftCell | null): OrderDraftPick {
  return { position: { id, name, unit: 'м2', quantity }, cell: c };
}

const supplier = (patch: Partial<OrderDraftSupplier> & { offerId: string }): OrderDraftSupplier => ({
  name: 'ООО Поставщик',
  supplierId: 's1',
  currency: 'RUB',
  delivery: null,
  ...patch,
});

describe('buildPurchaseOrderDrafts', () => {
  it('делает по заказу на поставщика и считает сумму по объёму ведомости', () => {
    const drafts = buildPurchaseOrderDrafts(
      [
        pick('p1', 'Керамогранит серый', 100, cell({ offerId: 'a', unitPrice: 1200 })),
        pick('p2', 'Керамогранит чёрный', 50, cell({ offerId: 'a', unitPrice: 1000 })),
        pick('p3', 'Плинтус', 20, cell({ offerId: 'b', unitPrice: 300 })),
      ],
      [supplier({ offerId: 'a', name: 'Альфа' }), supplier({ offerId: 'b', name: 'Бета', supplierId: 's2' })],
    );

    expect(drafts).toHaveLength(2);
    expect(drafts[0].supplierName).toBe('Альфа');
    expect(drafts[0].items.map((i) => i.name)).toEqual(['Керамогранит серый', 'Керамогранит чёрный']);
    expect(drafts[0].total).toBe(100 * 1200 + 50 * 1000);
    expect(drafts[1].supplierId).toBe('s2');
    expect(drafts[1].total).toBe(20 * 300);
  });

  it('добавляет доставку поставщика в сумму заказа', () => {
    const [draft] = buildPurchaseOrderDrafts(
      [pick('p1', 'Краска', 10, cell({ offerId: 'a', unitPrice: 500 }))],
      [supplier({ offerId: 'a', delivery: 7000 })],
    );
    expect(draft.delivery).toBe(7000);
    expect(draft.total).toBe(10 * 500 + 7000);
    expect(purchaseOrderTotal(draft)).toBe(draft.total);
  });

  it('разводит по разным заказам позиции одного поставщика в разных валютах', () => {
    const drafts = buildPurchaseOrderDrafts(
      [
        pick('p1', 'Алюминий', 10, cell({ offerId: 'a', unitPrice: 100, currency: 'USD' })),
        pick('p2', 'Оцинковка', 10, cell({ offerId: 'a', unitPrice: 2000 })),
      ],
      [supplier({ offerId: 'a', delivery: 5000 })],
    );

    expect(drafts).toHaveLength(2);
    const usd = drafts.find((d) => d.currency === 'USD')!;
    const rub = drafts.find((d) => d.currency === 'RUB')!;
    // Доставку поставщик посчитал в валюте карточки — дробить её между
    // заказами нечем, поэтому она уходит в заказ той же валюты.
    expect(usd.delivery).toBeNull();
    expect(usd.total).toBe(1000);
    expect(rub.delivery).toBe(5000);
    expect(rub.total).toBe(10 * 2000 + 5000);
  });

  it('пропускает позиции без отбора, строки доставки и незнакомых поставщиков', () => {
    const drafts = buildPurchaseOrderDrafts(
      [
        pick('p1', 'Без выбора', 10, null),
        pick('p2', 'Доставка за МКАД', 1, cell({ offerId: 'a', unitPrice: 5000, kind: 'delivery' })),
        pick('p3', 'Из удалённой карточки', 10, cell({ offerId: 'zzz', unitPrice: 100 })),
        pick('p4', 'Нормальная позиция', 2, cell({ offerId: 'a', unitPrice: 100 })),
      ],
      [supplier({ offerId: 'a' })],
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].items.map((i) => i.name)).toEqual(['Нормальная позиция']);
  });

  it('переносит в позицию вид соответствия, примечание и ссылку на товар', () => {
    const [draft] = buildPurchaseOrderDrafts(
      [
        pick(
          'p1',
          'Керамогранит',
          5,
          cell({ offerId: 'a', unitPrice: 900, kind: 'alternative', note: 'Dark Grey вместо Grey', productUrl: 'https://shop/x' }),
        ),
      ],
      [supplier({ offerId: 'a' })],
    );
    expect(draft.items[0].matchKind).toBe('alternative');
    expect(draft.items[0].note).toBe('Dark Grey вместо Grey');
    expect(draft.items[0].productUrl).toBe('https://shop/x');
    // sourceMaterialId держит связь с позицией ведомости — по ней шаг 12
    // сверяет счёт с заказом.
    expect(draft.items[0].sourceMaterialId).toBe('p1');
  });

  it('позиция без объёма не ломает сумму заказа', () => {
    const [draft] = buildPurchaseOrderDrafts(
      [
        pick('p1', 'Без объёма', null, cell({ offerId: 'a', unitPrice: 900 })),
        pick('p2', 'С объёмом', 3, cell({ offerId: 'a', unitPrice: 100 })),
      ],
      [supplier({ offerId: 'a' })],
    );
    expect(draft.items).toHaveLength(2);
    expect(draft.total).toBe(300);
  });
});
