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

describe('guessUnitPrice, шаг 7', () => {
  it('считает цену за литр из тары, записанной данными счёта', () => {
    // Приёмка шага 7: «банка 9 л, 4 500 ₽ без НДС» → цена за литр с НДС,
    // без расхода и без ручного ввода.
    const g = guessUnitPrice(
      { name: 'Краска Euro 7 база А', unit: 'шт', quantity: 12, price: 4500, packQty: 9, packUnit: 'л' },
      { unit: 'л' },
      { vatIncluded: false, countryRate: 22 },
    );
    expect(g?.unitPrice).toBe(610);
  });

  it('данные счёта важнее объёма из названия', () => {
    const g = guessUnitPrice(
      { name: 'Плёнка 60 м в рулоне', unit: 'рул', quantity: 1, price: 1200, packQty: 200, packUnit: 'м2' },
      { unit: 'м²' },
    );
    expect(g?.unitPrice).toBe(6);
  });

  it('пересчитывает единицы одной размерности', () => {
    const g = guessUnitPrice({ name: 'Смесь', unit: 'кг', quantity: 500, price: 40 }, { unit: 'т' });
    expect(g?.unitPrice).toBe(40000);
  });

  it('расход считает в его собственных единицах', () => {
    // Тара в миллилитрах, расход в литрах — раньше такая пара давала null.
    const g = guessUnitPrice(
      { name: 'Грунт', unit: 'шт', quantity: 4, price: 900, packQty: 2500, packUnit: 'мл' },
      { unit: 'м²', consumption: 0.25, consumptionUnit: 'л' },
    );
    expect(g?.unitPrice).toBe(90);
  });

  it('не накручивает НДС, когда счёт о нём молчит', () => {
    const g = guessUnitPrice({ name: 'x', unit: 'м2', quantity: 10, price: 1200 }, { unit: 'м²' }, { countryRate: 22 });
    expect(g?.unitPrice).toBe(1200);
  });
});
