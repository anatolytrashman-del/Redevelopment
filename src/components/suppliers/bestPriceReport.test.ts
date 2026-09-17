import { describe, expect, it } from 'vitest';
import { buildBestPriceRows, buildLotRows, reportPositions } from './bestPriceReport';
import type { PurchaseItem } from '../../data/purchases';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { SupplierOffer, SupplierRequest } from '../../data/supplierResearch';
import type { EstimateMaterial } from '../../data/estimates';

// Что проверяем: ровно те решения, из-за которых документ либо помогает
// торговаться, либо врёт — какая цена считается лучшей на оригинал, какая на
// аналог, что делать со строками-услугами в счёте и с ценой за тару.

function material(id: string, name: string, unit: string, quantity: number | null): EstimateMaterial {
  return { id, name, unit, quantity, note: '', comments: [], group: '' } as EstimateMaterial;
}

function item(patch: Partial<PurchaseItem> & { id: string; name: string }): PurchaseItem {
  return {
    sourceMaterialId: null,
    unit: 'м2',
    quantity: 10,
    price: 100,
    note: '',
    ...patch,
  } as PurchaseItem;
}

function quote(id: string, offerId: string, items: PurchaseItem[], patch: Partial<SupplierQuote> = {}): SupplierQuote {
  return {
    id,
    offerId,
    title: `Счёт ${id}`,
    price: 0,
    currency: 'RUB',
    items,
    files: [],
    isAlternative: false,
    alternativeNote: '',
    terms: null,
    sourceEmailId: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    ...patch,
  } as SupplierQuote;
}

function offer(id: string, name: string): SupplierOffer {
  return { id, requestId: 'req', name, currency: 'RUB', items: [], price: 0 } as unknown as SupplierOffer;
}

function byOffer(...quotes: SupplierQuote[]): Map<string, SupplierQuote[]> {
  const map = new Map<string, SupplierQuote[]>();
  quotes.forEach((q) => map.set(q.offerId, [...(map.get(q.offerId) ?? []), q]));
  return map;
}

describe('buildBestPriceRows', () => {
  const tile = material('pos-1', 'Керамогранит серый 60×60', 'м²', 100);

  it('берёт самую дешёвую цену отдельно по оригиналу и по аналогу', () => {
    const offers = [offer('o1', 'Антика'), offer('o2', 'МаксиКерам'), offer('o3', 'Грес')];
    const quotes = byOffer(
      quote('q1', 'o1', [item({ id: 'i1', name: 'Тот самый', sourceMaterialId: 'pos-1', unit: 'м2', price: 1800, unitPrice: 1800, matchKind: 'exact' })]),
      quote('q2', 'o2', [item({ id: 'i2', name: 'Замена', sourceMaterialId: 'pos-1', unit: 'м2', price: 1200, unitPrice: 1200, matchKind: 'alternative' })]),
      quote('q3', 'o3', [item({ id: 'i3', name: 'Тот самый', sourceMaterialId: 'pos-1', unit: 'м2', price: 1950, unitPrice: 1950, matchKind: 'exact' })]),
    );
    const [row] = buildBestPriceRows([{ ...tile, note: '' }], offers, quotes, undefined);
    expect(row.original?.supplierName).toBe('Антика');
    expect(row.original?.total).toBe(180_000);
    // Аналог дешевле оригинала — и всё равно остаётся в своей колонке: смешать
    // их значило бы предложить поставщику цену на другой товар.
    expect(row.alternative?.supplierName).toBe('МаксиКерам');
    expect(row.others).toHaveLength(1);
    expect(row.others[0].supplierName).toBe('Грес');
  });

  it('когда замен нет, в колонку аналога идёт строка «уточнить» с признаком', () => {
    const quotes = byOffer(
      quote('q1', 'o1', [item({ id: 'i1', name: 'Похожий', sourceMaterialId: 'pos-1', unit: 'м2', price: 1500, unitPrice: 1500, matchKind: 'check' })]),
    );
    const [row] = buildBestPriceRows([tile], [offer('o1', 'Антика')], quotes, undefined);
    expect(row.original).toBeNull();
    expect(row.alternative?.amount).toBe(1500);
    expect(row.alternativeIsCheck).toBe(true);
  });

  it('не отдаёт «лучшую цену» строке-услуге: колеровка рядом с краской не цена краски', () => {
    const paint = material('pos-2', 'Краска', 'шт', 42);
    const quotes = byOffer(
      quote('q1', 'o1', [
        item({ id: 'i1', name: 'Краска Tikkurila 9 л', sourceMaterialId: 'pos-2', unit: 'шт', quantity: 42, price: 10_160, unitPrice: 10_160, matchKind: 'exact' }),
        // Название без слова «колеровка» — ловится по форме счёта.
        item({ id: 'i2', name: 'TVT G485', sourceMaterialId: 'pos-2', unit: 'шт', quantity: 42, price: 120, unitPrice: 120, matchKind: 'exact' }),
        item({ id: 'i3', name: 'Краска Dulux 9 л', sourceMaterialId: 'pos-2', unit: 'шт', quantity: 30, price: 9_200, unitPrice: 9_200, matchKind: 'exact' }),
      ]),
    );
    const [row] = buildBestPriceRows([paint], [offer('o1', 'Краски Здесь')], quotes, undefined);
    expect(row.original?.amount).toBe(9_200);
    expect(row.others.map((o) => o.amount)).not.toContain(120);
  });

  it('дешёвая позиция рядом с дорогой услугой не считается: цены соседних позиций не трогаем', () => {
    const skirting = material('pos-3', 'Плинтус', 'шт', 10);
    const quotes = byOffer(
      quote('q1', 'o1', [
        item({ id: 'i1', name: 'Плинтус 2 м', sourceMaterialId: 'pos-3', unit: 'шт', quantity: 1770, price: 284, unitPrice: 142, matchKind: 'exact' }),
        item({ id: 'i2', name: 'Плинтус 2,44 м', sourceMaterialId: 'pos-3', unit: 'шт', quantity: 900, price: 320, unitPrice: 160, matchKind: 'alternative' }),
        item({ id: 'i3', name: 'Керамогранит', sourceMaterialId: null, unit: 'м2', quantity: 100, price: 1900 }),
      ]),
    );
    const [row] = buildBestPriceRows([skirting], [offer('o1', 'DEARTIO')], quotes, undefined);
    expect(row.original?.amount).toBe(142);
    expect(row.alternative?.amount).toBe(160);
  });

  it('цена за тару поставщика помечается и не превращается в сумму на объём', () => {
    const paint = material('pos-4', 'Краска белая', 'м2', 200);
    const quotes = byOffer(
      quote('q1', 'o1', [item({ id: 'i1', name: 'Краска, ведро 15 кг', sourceMaterialId: 'pos-4', unit: 'шт', quantity: 4, price: 2083, matchKind: 'exact' })]),
    );
    const [row] = buildBestPriceRows([paint], [offer('o1', 'Odissey')], quotes, undefined);
    expect(row.packagingOnly).toBe(true);
    expect(row.original?.basis).toBe('quote-line');
    expect(row.original?.total).toBeNull();
  });

  it('обновлённый счёт вытесняет прежний, а счёт без цен ничего не вытесняет', () => {
    const quotes = byOffer(
      quote('q1', 'o1', [item({ id: 'i1', name: 'Тот самый', sourceMaterialId: 'pos-1', unit: 'м2', price: 1911, unitPrice: 1911, matchKind: 'exact' })], {
        createdAt: '2026-09-12T10:00:00.000Z',
      }),
      quote('q2', 'o1', [item({ id: 'i2', name: 'Тот самый', sourceMaterialId: 'pos-1', unit: 'м2', price: 1864, unitPrice: 1864, matchKind: 'exact' })], {
        createdAt: '2026-09-14T10:00:00.000Z',
      }),
      quote('q3', 'o1', [item({ id: 'i3', name: 'Наша ведомость', sourceMaterialId: 'pos-1', unit: 'м2', price: null, matchKind: 'exact' })], {
        createdAt: '2026-09-15T10:00:00.000Z',
      }),
    );
    const [row] = buildBestPriceRows([tile], [offer('o1', 'Подноги')], quotes, undefined);
    expect(row.original?.amount).toBe(1864);
    expect(row.others).toHaveLength(0);
  });
});

describe('reportPositions', () => {
  it('добавляет позиции, к которым привязаны строки счетов, но которых нет в разделе сметы', () => {
    const quotes = byOffer(
      quote('q1', 'o1', [
        item({ id: 'i1', name: 'Краска Dufa чёрная 9 л', sourceMaterialId: 'orphan-1', unit: 'шт', price: 3333, matchKind: 'exact' }),
        item({ id: 'i2', name: 'Финнколор чёрная 9 л', sourceMaterialId: 'orphan-1', unit: 'шт', price: 2461, matchKind: 'alternative' }),
      ]),
    );
    const positions = reportPositions([material('pos-1', 'Краска по смете', 'м2', 400)], [offer('o1', 'Вирашоп')], quotes);
    expect(positions).toHaveLength(2);
    // Название берётся из строки «ровно по ведомости», а не из первой попавшейся.
    expect(positions[1].name).toBe('Краска Dufa чёрная 9 л');
    expect(positions[1].quantity).toBeNull();
  });
});

describe('buildLotRows', () => {
  const request = { id: 'req', title: 'Потолки', sectionTitle: 'Грильято' } as SupplierRequest;
  const positions = [material('pos-1', 'Потолок Грильято', 'м²', 720)];

  it('считает комплект суммой строк, доставку отдельно, и делит на объём', () => {
    const quotes = byOffer(
      quote('q1', 'o1', [
        item({ id: 'i1', name: 'Профиль', unit: 'шт', quantity: 100, price: 30 }),
        item({ id: 'i2', name: 'Организация доставки товара', unit: 'усл', quantity: 1, price: 12_000 }),
      ]),
    );
    const [row] = buildLotRows(request, positions, [offer('o1', 'Авангард')], quotes, undefined);
    expect(row.original?.total).toBe(3000);
    expect(row.original?.amount).toBeCloseTo(3000 / 720, 5);
    expect(row.original?.itemName).toContain('доставка');
  });

  it('берёт счета последнего дня поставщика: два варианта комплекта остаются, прошлый прайс — нет', () => {
    const quotes = byOffer(
      quote('old', 'o1', [item({ id: 'i1', name: 'Профиль', unit: 'шт', quantity: 100, price: 20 })], { createdAt: '2026-09-11T10:00:00.000Z' }),
      quote('zn', 'o1', [item({ id: 'i2', name: 'Профиль оцинковка', unit: 'шт', quantity: 100, price: 30 })], { createdAt: '2026-09-14T09:00:00.000Z' }),
      quote('al', 'o1', [item({ id: 'i3', name: 'Профиль алюминий', unit: 'шт', quantity: 100, price: 40 })], { createdAt: '2026-09-14T18:00:00.000Z' }),
    );
    const [row] = buildLotRows(request, positions, [offer('o1', 'Ирбис')], quotes, undefined);
    expect(row.original?.total).toBe(3000);
    expect(row.others).toHaveLength(1);
    expect(row.others[0].total).toBe(4000);
  });

  it('счёт не по этой поставке убирается из сравнения и не вытесняет настоящий', () => {
    // Владелец, 2026-09-17: ГРИЛЬЯТО-Мастер прислал счёт на Грильято 75×75
    // белый — другой товар, залитый позже настоящих. Раз счета берутся за
    // последний день, он один и остался бы за поставщика. Все его строки
    // помечены «не позиция ведомости», комплекта в нём нет.
    const quotes = byOffer(
      quote('real', 'o1', [item({ id: 'i1', name: 'Рейка 100х100 чёрная', unit: 'шт', quantity: 100, price: 30 })], { createdAt: '2026-09-14T09:00:00.000Z' }),
      quote('alien', 'o1', [item({ id: 'i2', name: 'Рейка 75х75 белая', unit: 'шт', quantity: 100, price: 5, matchKind: 'none' })], {
        createdAt: '2026-09-17T09:00:00.000Z',
      }),
    );
    const [row] = buildLotRows(request, positions, [offer('o1', 'ГРИЛЬЯТО-Мастер')], quotes, undefined);
    expect(row.original?.total).toBe(3000);
    expect(row.others).toHaveLength(0);
  });

  it('комплект, помеченный альтернативой, идёт в колонку аналога', () => {
    const quotes = byOffer(
      quote('q1', 'o1', [item({ id: 'i1', name: 'Профиль h40', unit: 'шт', quantity: 100, price: 40 })]),
      quote('q2', 'o2', [item({ id: 'i2', name: 'Профиль h30', unit: 'шт', quantity: 100, price: 30 })], {
        isAlternative: true,
        alternativeNote: 'сталь h30 вместо алюминия h40',
      }),
    );
    const [row] = buildLotRows(request, positions, [offer('o1', 'Ирбис'), offer('o2', 'ГРИЛЬЯТО-Мастер')], quotes, undefined);
    expect(row.original?.supplierName).toBe('Ирбис');
    expect(row.alternative?.supplierName).toBe('ГРИЛЬЯТО-Мастер');
    expect(row.alternative?.note).toContain('h30');
  });
});
