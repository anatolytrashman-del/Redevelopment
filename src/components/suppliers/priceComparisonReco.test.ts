import { describe, expect, it } from 'vitest';
import { buildRecommendations, positionOffers, sameProposal, type Cell, type Column } from './priceComparisonModel';
import type { EstimateMaterial } from '../../data/estimates';
import type { SupplierOffer } from '../../data/supplierResearch';

// Новый вид сравнения: точно по запросу и аналоги сравниваются отдельно,
// итог «с аналогами» не подменяет «строго по запросу».

function cell(offerId: string, unitPrice: number, kind: Cell['kind'], patch: Partial<Cell> = {}): Cell {
  return {
    offerId,
    itemId: `${offerId}-i`,
    quoteId: null,
    quoteTitle: '',
    quoteDate: null,
    unitPrice,
    currency: 'BYN',
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
    excludedFromSupply: false,
    isArchived: false,
    ...patch,
  };
}

function column(offerId: string, cells: Record<string, Cell>): Column {
  const map = new Map(Object.entries(cells));
  return {
    offer: { id: offerId, name: offerId } as SupplierOffer,
    cells: map,
    currentCells: map,
    delivery: null,
    deliveryCurrency: 'BYN',
    unmatched: [],
    aside: [],
    asideTotal: 0,
    quotesCount: 1,
    lastQuoteAt: null,
    terms: null,
  };
}

const pos = (id: string, quantity: number) => ({ id, name: id, unit: 'м2', quantity }) as EstimateMaterial;

describe('positionOffers', () => {
  it('лучшая цена считается отдельно в каждой группе, «не покупаем» в неё не идёт', () => {
    const cols = [
      column('a', { p: cell('a', 60, 'exact') }),
      column('b', { p: cell('b', 55, 'exact', { excludedFromSupply: true }) }),
      column('c', { p: cell('c', 40, 'check') }),
      column('d', { p: cell('d', 50, 'alternative') }),
    ];
    const r = positionOffers('p', cols);
    expect(r.bestExact?.offerId).toBe('a');
    expect(r.bestAnalog?.offerId).toBe('d');
    expect(r.exact.map((c) => c.offerId)).toEqual(['a', 'b']);
    expect(r.analogs.map((c) => c.offerId)).toEqual(['c', 'd']);
  });
});

describe('buildRecommendations', () => {
  const positions = [pos('p1', 10), pos('p2', 10), pos('p3', 10)];
  const cols = [
    column('a', { p1: cell('a', 100, 'exact'), p2: cell('a', 50, 'exact') }),
    column('b', { p1: cell('b', 80, 'alternative'), p2: cell('b', 60, 'alternative'), p3: cell('b', 30, 'alternative') }),
  ];
  const { strict, withAnalogs } = buildRecommendations(positions, cols);

  it('строго по запросу — только точные предложения', () => {
    expect(strict.positions).toBe(2);
    expect(strict.parts.reduce((s, p) => s + p.amount, 0)).toBe(1500);
  });

  it('с аналогами — аналог берётся, только где он дешевле или точного нет', () => {
    expect(withAnalogs.proposal.p1.offerId).toBe('b');
    expect(withAnalogs.proposal.p2.offerId).toBe('a');
    expect(withAnalogs.proposal.p3.offerId).toBe('b');
    expect(withAnalogs.replaced).toBe(1);
    expect(withAnalogs.analogOnly).toBe(1);
    expect(withAnalogs.replacedExactParts[0].amount - withAnalogs.replacedAnalogParts[0].amount).toBe(200);
  });

  it('sameProposal узнаёт применённую рекомендацию', () => {
    expect(sameProposal({ ...strict.proposal }, strict.proposal)).toBe(true);
    expect(sameProposal(strict.proposal, withAnalogs.proposal)).toBe(false);
  });
});
