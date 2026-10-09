import { describe, expect, it } from 'vitest';
import {
  brandsInSuppliers,
  buildCarriedItemIndex,
  matchCarriedPosition,
  supplierHasBrand,
} from './catalogCarriedItems';
import { normalizeSearch } from './productSearch';
import type { SupplierOffer } from '../../data/supplierResearch';
import type { SupplierQuote } from '../../data/supplierQuotes';

function offer(partial: Partial<SupplierOffer> & { id: string }): SupplierOffer {
  return {
    requestId: 'r',
    name: partial.id,
    items: [],
    price: 0,
    supplierId: partial.supplierId ?? partial.id,
    ...partial,
  } as unknown as SupplierOffer;
}

describe('matchCarriedPosition', () => {
  it('находит позицию из КП другой карточки той же компании', () => {
    const a = offer({ id: 'a1', supplierId: 'sa', items: [] });
    const b = offer({
      id: 'a2',
      supplierId: 'sa',
      items: [{ id: 'i1', sourceMaterialId: null, name: 'Керамогранит Alma 60x60', unit: 'м²', quantity: 10, price: 1, note: '' }],
    });
    const quotes: SupplierQuote[] = [];
    const idx = buildCarriedItemIndex([a, b], quotes);
    const hit = matchCarriedPosition(a, [a, b], idx, normalizeSearch('alma'));
    expect(hit.matched).toBe(true);
    expect(hit.itemName).toMatch(/Alma/);
  });
});

describe('brandsInSuppliers', () => {
  it('считает бренды по компаниям без дублей внутри одной', () => {
    const suppliers = [offer({ id: 'a', supplierId: 's1' }), offer({ id: 'b', supplierId: 's2' })];
    const hints = new Map([
      ['s1', { ownBrands: ['Ceresit', 'Ceresit'], resoldBrands: ['Tikkurila'] }],
      ['s2', { ownBrands: ['Ceresit'], resoldBrands: [] }],
    ]);
    const list = brandsInSuppliers(suppliers, hints);
    expect(list.find((x) => x.brand === 'Ceresit')?.count).toBe(2);
    expect(list.find((x) => x.brand === 'Tikkurila')?.count).toBe(1);
    expect(supplierHasBrand(suppliers[0], 'Ceresit', hints)).toBe(true);
  });
});
