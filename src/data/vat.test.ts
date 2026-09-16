import { describe, expect, it } from 'vitest';
import { grossUp, vatRateForCountry } from './vat';

describe('НДС', () => {
  it('цену «без НДС» приводит к «с НДС» по ставке счёта', () => {
    const r = grossUp(1000, { vatIncluded: false, vatRate: 22 }, 20);
    expect(r.price).toBe(1220);
    expect(r.adjusted).toBe(true);
    expect(r.rate).toBe(22);
  });

  it('без ставки в счёте берёт ставку страны юрлица', () => {
    expect(grossUp(1000, { vatIncluded: false, vatRate: null }, 20).price).toBe(1200);
    expect(vatRateForCountry('Россия')).toBe(22);
    expect(vatRateForCountry('Беларусь')).toBe(20);
    expect(vatRateForCountry('Марс')).toBeNull();
  });

  it('цену «с НДС» не трогает', () => {
    const r = grossUp(1000, { vatIncluded: true, vatRate: 20 }, 22);
    expect(r.price).toBe(1000);
    expect(r.adjusted).toBe(false);
  });

  it('молчание счёта не считает «без НДС»', () => {
    const r = grossUp(1000, { vatIncluded: null, vatRate: null }, 22);
    expect(r.price).toBe(1000);
    expect(r.adjusted).toBe(false);
    expect(r.unknown).toBe(true);
  });

  it('«без НДС» без известной ставки оставляет цену как есть', () => {
    const r = grossUp(1000, { vatIncluded: false }, null);
    expect(r.price).toBe(1000);
    expect(r.adjusted).toBe(false);
    expect(r.unknown).toBe(true);
  });
});
