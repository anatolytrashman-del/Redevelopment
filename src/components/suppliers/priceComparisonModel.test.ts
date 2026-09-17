import { describe, expect, it } from 'vitest';
import { buildColumns, dominantCurrency, sumMoney } from './priceComparisonModel';
import type { EstimateMaterial } from '../../data/estimates';
import type { PurchaseItem } from '../../data/purchases';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { SupplierOffer } from '../../data/supplierResearch';

// Что проверяем: исход КАЖДОЙ строки счёта. Счёт считается разобранным, когда
// у всех строк есть место — позиция, доставка или явное «не позиция
// ведомости»; «не привязана» остаётся только там, где решения правда нет.

function material(id: string, name: string, quantity: number): EstimateMaterial {
  return { id, name, unit: 'м2', quantity, note: '', comments: [], group: '' } as EstimateMaterial;
}

function item(patch: Partial<PurchaseItem> & { id: string; name: string }): PurchaseItem {
  return { sourceMaterialId: null, unit: 'шт', quantity: 1, price: 100, note: '', ...patch } as PurchaseItem;
}

function quote(items: PurchaseItem[]): SupplierQuote {
  return {
    id: 'q1',
    offerId: 'o1',
    title: 'Счёт',
    price: 0,
    currency: 'RUB',
    items,
    files: [],
    isAlternative: false,
    alternativeNote: '',
    terms: null,
    sourceEmailId: null,
    createdAt: '2026-09-16T10:00:00.000Z',
  } as SupplierQuote;
}

const paint = material('p1', 'Tikkurila Euro Power 7', 2229);
const offer = { id: 'o1', name: 'Краски Здесь', currency: 'RUB' } as SupplierOffer;

function columnOf(items: PurchaseItem[]) {
  return buildColumns([offer], new Map([['o1', [quote(items)]]]), [paint], undefined)[0];
}

// Владелец, 2026-09-17: «почему-то плинтус посчитался в долларах, хотя
// поставка рублевая» — карточка поставщика была заведена в USD (поле по
// умолчанию), а счёт и доставка пришли в рублях.
describe('доставка и итог считаются в валюте счёта, а не карточки поставщика', () => {
  it('доставка из рублёвого счёта показывается в рублях, даже если карточка в USD', () => {
    const rubOffer = { id: 'o1', name: 'ЭКСТ-ДЕКОР', currency: 'USD' } as SupplierOffer;
    const rubQuote = quote([
      item({ id: 'a1', name: 'Плинтус', sourceMaterialId: 'p1', unitPrice: 175.38, matchKind: 'exact', quantity: 1_770, price: 350_760 }),
      item({ id: 'a2', name: 'Доставка', matchKind: 'delivery', quantity: 1, price: 1_080 }),
    ]);
    rubQuote.currency = 'RUB';
    const col = buildColumns([rubOffer], new Map([['o1', [rubQuote]]]), [paint], undefined)[0];
    expect(col.delivery).toBe(1_080);
    expect(col.deliveryCurrency).toBe('RUB');
  });

  it('dominantCurrency выбирает валюту большинства сумм, а не доллар по умолчанию', () => {
    expect(
      dominantCurrency([
        { amount: 1, currency: 'RUB' },
        { amount: 1, currency: 'RUB' },
        { amount: 1, currency: 'USD' },
      ]),
    ).toBe('RUB');
  });

  it('sumMoney складывает в валюте большинства без курса, если он не нужен', () => {
    expect(
      sumMoney(
        [
          { amount: 100, currency: 'RUB' },
          { amount: 200, currency: 'RUB' },
        ],
        undefined,
      ),
    ).toBe('300 ₽');
  });
});

describe('buildColumns: исход строки счёта', () => {
  it('колеровка, помеченная «не позиция ведомости», уходит в разобранное, а не в «не привязаны»', () => {
    const col = columnOf([
      item({ id: 'i1', name: 'Euro Power 7 (9л)', sourceMaterialId: 'p1', unitPrice: 228.44, matchKind: 'exact', quantity: 42, price: 10_160 }),
      item({ id: 'i2', name: 'TVT G485', matchKind: 'none', matchNote: 'колеровка — учтена в цене за м²', quantity: 42, price: 120 }),
    ]);
    expect(col.unmatched).toEqual([]);
    expect(col.aside.map((a) => a.item.id)).toEqual(['i2']);
    // Сумма считается по строке счёта, а не по цене за штуку: в отчёте
    // владельцу это деньги, а не ставка.
    expect(col.asideTotal).toBe(5_040);
    // На цену позиции такая строка не влияет — она уже внутри неё.
    expect(col.cells.get('p1')?.unitPrice).toBe(228.44);
  });

  it('строка без решения по-прежнему «не привязана»', () => {
    const col = columnOf([item({ id: 'i1', name: 'Грунтовка', price: 867, quantity: 137 })]);
    expect(col.unmatched.map((u) => u.item.id)).toEqual(['i1']);
    expect(col.aside).toEqual([]);
  });

  it('«не позиция ведомости» сильнее похожести на доставку: подъём в цене товара не становится доставкой', () => {
    const col = columnOf([
      item({ id: 'i1', name: 'Краска', sourceMaterialId: 'p1', unitPrice: 200, matchKind: 'exact' }),
      item({ id: 'i2', name: 'Колеровка и доставка колера', matchKind: 'none', quantity: 2, price: 500 }),
    ]);
    expect(col.delivery).toBeNull();
    expect(col.aside).toHaveLength(1);
  });

  it('счёт целиком из разобранных строк не вытесняет настоящий счёт', () => {
    const first = quote([
      item({ id: 'a1', name: 'Краска', sourceMaterialId: 'p1', unitPrice: 200, matchKind: 'exact' }),
      item({ id: 'a2', name: 'Доставка', matchKind: 'delivery', quantity: 1, price: 9_300 }),
    ]);
    const second = { ...quote([item({ id: 'b1', name: 'Колеровка', matchKind: 'none', quantity: 3, price: 100 })]), id: 'q2', createdAt: '2026-09-17T10:00:00.000Z' };
    const col = buildColumns([offer], new Map([['o1', [first, second]]]), [paint], undefined)[0];
    expect(col.cells.get('p1')?.unitPrice).toBe(200);
    // Доставка и разобранные строки остаются от счёта с ценами: иначе
    // «9 300 ₽ транспорт» пропадал бы из-за письма с одной колеровкой.
    expect(col.delivery).toBe(9_300);
    expect(col.aside).toEqual([]);
  });
});
