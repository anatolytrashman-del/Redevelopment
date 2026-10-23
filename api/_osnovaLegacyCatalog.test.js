import { describe, expect, it } from 'vitest';
import { mergeSuppliers, sanitizeSearch } from './_osnovaLegacyCatalog.js';

describe('_osnovaLegacyCatalog mergeSuppliers', () => {
  it('merges legacy details into catalog refs, keeps client notes/prices', () => {
    const client = [
      { ref: 'catalog:11111111-1111-1111-1111-111111111111', id: null, name: null, inn: null, source: 'catalog', moderation_status: null, notes: [{ id: 'n1', body: 'foo' }], prices: [{ item: 'x', price: 1 }] },
      { ref: 'added:222', name: 'Added One', source: 'added', notes: [], prices: [] },
    ];
    const leg = [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Leg Name', inn: '123', city: 'Minsk' },
    ];
    const { suppliers, total } = mergeSuppliers(client, leg, {});
    expect(total).toBe(2);
    const cat = suppliers.find((s) => s.ref === 'catalog:11111111-1111-1111-1111-111111111111');
    expect(cat.name).toBe('Leg Name');
    expect(cat.notes[0].body).toBe('foo');
    expect(cat.prices.length).toBe(1);
    const add = suppliers.find((s) => s.ref === 'added:222');
    expect(add.name).toBe('Added One');
  });

  it('when search, filters added case-insens, drops pure catalog nulls', () => {
    const client = [
      { ref: 'catalog:aaa', name: null, source: 'catalog', notes: [], prices: [] },
      { ref: 'added:bbb', name: 'FooBar', source: 'added', notes: [], prices: [] },
      { ref: 'added:ccc', name: 'Other', source: 'added', notes: [], prices: [] },
    ];
    const { suppliers } = mergeSuppliers(client, [], { search: 'foo' });
    expect(suppliers.find((s) => s.ref === 'catalog:aaa')).toBeUndefined();
    expect(suppliers.some((s) => s.name === 'FooBar')).toBe(true);
    expect(suppliers.some((s) => s.name === 'Other')).toBe(false);
  });

  it('sorts by name ru, nulls last, paginates', () => {
    const client = [
      { ref: 'c1', name: 'Яблоко', source: 'catalog', notes: [], prices: [] },
      { ref: 'c2', name: null, source: 'catalog', notes: [], prices: [] },
      { ref: 'c3', name: 'Арбуз', source: 'catalog', notes: [], prices: [] },
    ];
    const { suppliers } = mergeSuppliers(client, [], { limit: 2, offset: 0 });
    expect(suppliers[0].name).toBe('Арбуз');
    expect(suppliers[1].name).toBe('Яблоко');
  });
});

describe('search sanitization', () => {
  it('removes forbidden chars ,() *%\\ quotes, trims, max 100', () => {
    expect(sanitizeSearch('  a,b(c) d*ef%g\\h\'"i  ')).toBe('a b c  d ef g h  i');
    const long = 'x'.repeat(120);
    expect(sanitizeSearch(long).length).toBe(100);
  });
});
