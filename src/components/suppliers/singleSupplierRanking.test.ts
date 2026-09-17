import { describe, expect, it } from 'vitest';
import { buildRanking, rankingWinner } from './singleSupplierRanking';
import type { Cell, Column } from './priceComparisonModel';
import type { EstimateMaterial } from '../../data/estimates';
import type { SupplierOffer } from '../../data/supplierResearch';
import type { PurchaseItemMatchKind } from '../../data/purchases';

// Что проверяем: ровно те решения, из-за которых панель либо отвечает на
// «где заказать всё», либо советует не то — что считается эталонной ценой,
// в каком порядке идут поставщики и что делает непокрытая позиция.

function material(id: string, name: string, quantity: number): EstimateMaterial {
  return { id, name, unit: 'м2', quantity, note: '', comments: [], group: '' } as EstimateMaterial;
}

function cell(unitPrice: number, kind: PurchaseItemMatchKind = 'exact'): Cell {
  return {
    offerId: '',
    itemId: '',
    quoteId: null,
    quoteTitle: '',
    quoteDate: null,
    unitPrice,
    currency: 'RUB',
    kind,
    note: '',
    productUrl: '',
    matchConfidence: null,
    recognitionConfidence: null,
    vat: 'unknown',
    vatRate: null,
    usdUnit: null,
    quotedQuantity: null,
    quotedUnit: '',
  };
}

function column(id: string, name: string, cells: Record<string, Cell>, delivery: number | null = null): Column {
  return {
    offer: { id, name, currency: 'RUB' } as SupplierOffer,
    cells: new Map(Object.entries(cells)),
    delivery,
    unmatched: [],
    aside: [],
    asideTotal: 0,
    quotesCount: 1,
    lastQuoteAt: null,
    terms: null,
  };
}

const paint = material('p1', 'Tikkurila Euro Power 7', 100);
const primer = material('p2', 'Грунт', 10);

describe('buildRanking', () => {
  it('считает эталоном лучший «ровно», а не самую дешёвую цену вообще', () => {
    const exactShop = column('a', 'Ровно и дорого', { p1: cell(200, 'exact') });
    const analogShop = column('b', 'Аналог и дёшево', { p1: cell(50, 'alternative') });
    const ranking = buildRanking([exactShop, analogShop], [paint], undefined);
    expect(ranking.noExactPositions).toEqual([]);
    const byName = new Map(ranking.scores.map((s) => [s.name, s]));
    // Эталон — 200 ₽ «ровно», поэтому дорогой не переплачивает…
    expect(byName.get('Ровно и дорого')!.overpay).toBe(0);
    expect(byName.get('Ровно и дорого')!.bestExact).toBe(1);
    // …а дешёвый аналог показан экономией, но с «ровно 0».
    expect(byName.get('Аналог и дёшево')!.overpay).toBe(-15_000);
    expect(byName.get('Аналог и дёшево')!.exact).toBe(0);
    // И победителем становится тот, кто дал «ровно»: дешёвая замена — ответ
    // на другой вопрос.
    expect(rankingWinner(ranking)!.name).toBe('Ровно и дорого');
  });

  it('если «ровно» не дал никто, эталон берётся из замен', () => {
    const a = column('a', 'A', { p1: cell(90, 'alternative') });
    const b = column('b', 'B', { p1: cell(120, 'check') });
    const ranking = buildRanking([a, b], [paint], undefined);
    expect(ranking.noExactPositions.map((p) => p.id)).toEqual(['p1']);
    expect(rankingWinner(ranking)!.name).toBe('A');
    expect(rankingWinner(ranking)!.overpay).toBe(0);
    expect(rankingWinner(ranking)!.bestExact).toBe(0);
  });

  it('полное покрытие важнее дешевизны, а непокрытая позиция в переплату не идёт', () => {
    const full = column('a', 'Всё', { p1: cell(200, 'exact'), p2: cell(300, 'exact') });
    const partial = column('b', 'Только краска', { p1: cell(100, 'exact') });
    const ranking = buildRanking([full, partial], [paint, primer], undefined);
    expect(ranking.scores.map((s) => s.name)).toEqual(['Всё', 'Только краска']);
    const partialScore = ranking.scores[1];
    expect(partialScore.missing.map((p) => p.id)).toEqual(['p2']);
    // Грунт, которого он не предложил, не удешевляет и не удорожает его.
    expect(partialScore.overpay).toBe(0);
    expect(partialScore.total).toBe(10_000);
    // А тот, кто закрыл обе, переплачивает только на краске.
    expect(ranking.scores[0].overpay).toBe(10_000);
  });

  it('при равном покрытии впереди тот, у кого больше «ровно»', () => {
    const cheapAnalogs = column('a', 'Аналоги', { p1: cell(50, 'alternative'), p2: cell(50, 'alternative') });
    const exacts = column('b', 'Ровно', { p1: cell(200, 'exact'), p2: cell(300, 'exact') });
    const ranking = buildRanking([cheapAnalogs, exacts], [paint, primer], undefined);
    expect(ranking.scores.map((s) => s.name)).toEqual(['Ровно', 'Аналоги']);
  });

  it('доставка показывается отдельно и в сумму позиций не подмешивается', () => {
    const a = column('a', 'A', { p1: cell(100, 'exact') }, 9_300);
    const ranking = buildRanking([a, column('b', 'B', { p1: cell(150, 'exact') })], [paint], undefined);
    const score = ranking.scores.find((s) => s.name === 'A')!;
    expect(score.total).toBe(10_000);
    expect(score.delivery).toBe(9_300);
  });

  it('один поставщик — это не выбор, победителя не называем', () => {
    const ranking = buildRanking([column('a', 'A', { p1: cell(100, 'exact') })], [paint], undefined);
    expect(rankingWinner(ranking)).toBeNull();
  });
});
