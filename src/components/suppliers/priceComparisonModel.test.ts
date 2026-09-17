import { describe, expect, it } from 'vitest';
import { bestOfPosition, buildColumns, dominantCurrency, pickLines, positionOffers, savingsSummary, sumMoney } from './priceComparisonModel';
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

// Владелец, 2026-09-17: запросил у поставщиков новые счета только на
// финально отобранные материалы — цены на остальные позиции ведомости из
// более старых широких счетов не должны пропадать из сравнения, они нужны
// в отчёте руководителю стройки как цены альтернатив.
describe('buildColumns: цены сводятся по всем счетам, а не только по последнему', () => {
  const primer = material('p2', 'Грунтовка', 400);

  it('позиция, которой нет в новом узком счёте, берёт цену из старого широкого и помечается архивной', () => {
    const wide = quote([
      item({ id: 'a1', name: 'Краска G485', sourceMaterialId: 'p1', unitPrice: 200, matchKind: 'exact' }),
      item({ id: 'a2', name: 'Грунтовка', sourceMaterialId: 'p2', unitPrice: 50, matchKind: 'exact' }),
    ]);
    const narrow = {
      ...quote([item({ id: 'b1', name: 'Краска G485', sourceMaterialId: 'p1', unitPrice: 220, matchKind: 'exact' })]),
      id: 'q2',
      createdAt: '2026-09-17T10:00:00.000Z',
    };
    const col = buildColumns([offer], new Map([['o1', [wide, narrow]]]), [paint, primer], undefined)[0];
    // Отобранный материал — свежая цена из узкого счёта.
    expect(col.cells.get('p1')?.unitPrice).toBe(220);
    expect(col.cells.get('p1')?.isArchived).toBe(false);
    // Непокупаемая позиция — цена из старого счёта, но не пропала.
    expect(col.cells.get('p2')?.unitPrice).toBe(50);
    expect(col.cells.get('p2')?.isArchived).toBe(true);
    // currentCells — только то, что реально поставят по действующему счёту.
    expect([...col.currentCells.keys()]).toEqual(['p1']);
  });

  it('excludedFromSupply на строке счёта не убирает цену из cells, но убирает её из currentCells', () => {
    const col = columnOf([item({ id: 'i1', name: 'Краска', sourceMaterialId: 'p1', unitPrice: 200, matchKind: 'exact', excludedFromSupply: true })]);
    expect(col.cells.get('p1')?.unitPrice).toBe(200);
    expect(col.cells.get('p1')?.excludedFromSupply).toBe(true);
    expect(col.currentCells.has('p1')).toBe(false);
  });
});

// Отчёт руководителю стройки (владелец, 2026-09-17): «сколько поставщиков
// проработал», «из чего выбирали» и «сколько на этом сэкономили» считаются
// по тем же ячейкам, что и экран, — здесь проверяется сама арифметика.
describe('отчёт руководителю: лучшие предложения и экономия', () => {
  function columnsOf(byOffer: Record<string, PurchaseItem[]>) {
    const offers = Object.keys(byOffer).map((id) => ({ id, name: id, currency: 'RUB' }) as SupplierOffer);
    const quotes = new Map<string, SupplierQuote[]>(
      Object.entries(byOffer).map(([id, items]) => [id, [{ ...quote(items), id: `q-${id}`, offerId: id }]]),
    );
    return buildColumns(offers, quotes, [paint], undefined);
  }

  it('лучший оригинал — самый дешёвый «ровно», лучшая замена — самый дешёвый аналог', () => {
    const columns = columnsOf({
      o1: [item({ id: 'a', name: 'Ровно дорого', sourceMaterialId: 'p1', unitPrice: 200, matchKind: 'exact' })],
      o2: [item({ id: 'b', name: 'Ровно дешевле', sourceMaterialId: 'p1', unitPrice: 150, matchKind: 'exact' })],
      o3: [item({ id: 'c', name: 'Аналог', sourceMaterialId: 'p1', unitPrice: 90, matchKind: 'alternative' })],
    });
    const offers = positionOffers(columns, 'p1');
    // Отсортировано от дешёвого к дорогому — в документе порядок тот же.
    expect(offers.map((o) => o.cell.unitPrice)).toEqual([90, 150, 200]);
    const best = bestOfPosition(offers);
    expect(best.original?.unitPrice).toBe(150);
    expect(best.alternative?.unitPrice).toBe(90);
    expect(best.alternativeIsCheck).toBe(false);
  });

  it('замен нет — в колонку замены идёт «уточнить», но с оговоркой', () => {
    const columns = columnsOf({
      o1: [item({ id: 'a', name: 'Ровно', sourceMaterialId: 'p1', unitPrice: 200, matchKind: 'exact' })],
      o2: [item({ id: 'b', name: 'Спорная', sourceMaterialId: 'p1', unitPrice: 120, matchKind: 'check' })],
    });
    const best = bestOfPosition(positionOffers(columns, 'p1'));
    expect(best.alternative?.unitPrice).toBe(120);
    expect(best.alternativeIsCheck).toBe(true);
  });

  it('экономия считается к самому дорогому и к среднему предложению', () => {
    const columns = columnsOf({
      o1: [item({ id: 'a', name: 'Наш выбор', sourceMaterialId: 'p1', unitPrice: 100, matchKind: 'exact' })],
      o2: [item({ id: 'b', name: 'Дороже', sourceMaterialId: 'p1', unitPrice: 200, matchKind: 'exact' })],
      o3: [item({ id: 'c', name: 'Самый дорогой', sourceMaterialId: 'p1', unitPrice: 300, matchKind: 'exact' })],
    });
    const columnById = new Map(columns.map((c) => [c.offer.id, c]));
    const picked = pickLines([paint], { p1: { offerId: 'o1', itemId: 'a' } }, columnById);
    const savings = savingsSummary(picked, columns, undefined)!;
    // Объём позиции — 2 229 м²: экономия считается на весь объём, а не за единицу.
    expect(savings.picked).toBe(222_900);
    expect(savings.worst).toBe(668_700);
    expect(savings.average).toBe(445_800);
    expect(savings.compared).toBe(1);
  });

  it('позиция с единственной ценой в экономию не идёт — выбирать там было не из чего', () => {
    const columns = columnsOf({ o1: [item({ id: 'a', name: 'Одна цена', sourceMaterialId: 'p1', unitPrice: 100, matchKind: 'exact' })] });
    const columnById = new Map(columns.map((c) => [c.offer.id, c]));
    const picked = pickLines([paint], { p1: { offerId: 'o1', itemId: 'a' } }, columnById);
    expect(savingsSummary(picked, columns, undefined)).toBeNull();
  });
});
