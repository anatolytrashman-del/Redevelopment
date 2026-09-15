import { describe, expect, it } from 'vitest';
import { guessUnitPrice, parsePackVolume } from './unitPriceGuess';

describe('parsePackVolume', () => {
  it('reads litres from paint names', () => {
    expect(parsePackVolume('Euro 7 Power (A) (9л) 11,6кг краска мат')).toEqual({ amount: 9, unit: 'л' });
    expect(parsePackVolume('Тик-ла Euro Power - 7 краска в/д мат.база А 9л')).toEqual({ amount: 9, unit: 'л' });
    expect(parsePackVolume('Dali Краска Резиновая (12кг)')).toEqual({ amount: 12, unit: 'кг' });
    expect(parsePackVolume('Bindo 7 BW (2,5 л)')).toEqual({ amount: 2.5, unit: 'л' });
  });
  it('returns null without a volume', () => {
    expect(parsePackVolume('Плинтус напольный C7157')).toBeNull();
  });
});

describe('guessUnitPrice', () => {
  it('uses the line price when units match', () => {
    expect(guessUnitPrice({ name: 'x', unit: 'м2', quantity: 10, price: 1200 }, { unit: 'м²' })?.unitPrice).toBe(1200);
  });
  it('recalculates from pack volume and consumption', () => {
    const g = guessUnitPrice({ name: 'Euro Power 7 9л', unit: 'шт', quantity: 35, price: 5394 }, { unit: 'м²', consumption: 0.25, consumptionUnit: 'л' });
    expect(g?.unitPrice).toBe(149.83);
  });
  it('gives up without consumption or with a foreign pack unit', () => {
    expect(guessUnitPrice({ name: 'Euro Power 7 9л', unit: 'шт', quantity: 35, price: 5394 }, { unit: 'м²' })).toBeNull();
    expect(guessUnitPrice({ name: 'Dali 12кг', unit: 'шт', quantity: 1, price: 100 }, { unit: 'м²', consumption: 0.3, consumptionUnit: 'л' })).toBeNull();
  });
});
