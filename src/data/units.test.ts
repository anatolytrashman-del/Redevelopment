import { describe, expect, it } from 'vitest';
import { UNITS, canConvertUnits, canonicalUnit, convertQuantity, convertUnitPrice, isPackUnit, squashUnit, unitLabel } from './units';

describe('справочник единиц', () => {
  it('не содержит двух записей с одним написанием', () => {
    const seen = new Map<string, string>();
    for (const def of UNITS) {
      for (const spelling of [def.code, def.label, ...def.synonyms]) {
        const key = squashUnit(spelling);
        const owner = seen.get(key);
        expect(owner ?? def.code, `написание «${spelling}» занято единицей ${owner}`).toBe(def.code);
        seen.set(key, def.code);
      }
    }
  });

  it('сводит написания счёта и сметы к одному коду', () => {
    expect(canonicalUnit('м²')).toBe('м2');
    expect(canonicalUnit('кв. м')).toBe('м2');
    expect(canonicalUnit('КВ.М')).toBe('м2');
    expect(canonicalUnit('шт.')).toBe('шт');
    expect(canonicalUnit('упак.')).toBe('уп');
    expect(canonicalUnit('м.п.')).toBe('пог.м');
    expect(canonicalUnit('тонн')).toBe('т');
  });

  it('незнакомую единицу не выдумывает', () => {
    expect(canonicalUnit('усл.ед')).toBeNull();
    expect(canonicalUnit('')).toBeNull();
    expect(unitLabel('усл.ед')).toBe('усл.ед');
  });

  it('пересчитывает количество внутри размерности', () => {
    expect(convertQuantity(200, 'г', 'кг')).toBeCloseTo(0.2);
    expect(convertQuantity(1.5, 'т', 'кг')).toBeCloseTo(1500);
    expect(convertQuantity(2, 'м3', 'л')).toBeCloseTo(2000);
    expect(convertQuantity(3, 'пог.м', 'м')).toBeCloseTo(3);
  });

  it('не пересчитывает между размерностями и через тару', () => {
    expect(convertQuantity(9, 'л', 'м2')).toBeNull();
    expect(convertQuantity(1, 'уп', 'шт')).toBeNull();
    expect(canConvertUnits('л', 'кг')).toBe(false);
    expect(isPackUnit('рулон')).toBe(true);
    expect(isPackUnit('м²')).toBe(false);
  });

  it('цену за единицу пересчитывает в обратную сторону', () => {
    // 100 ₽ за килограмм — это 100 000 ₽ за тонну, а не 0,1.
    expect(convertUnitPrice(100, 'кг', 'т')).toBeCloseTo(100000);
    expect(convertUnitPrice(500, 'л', 'м3')).toBeCloseTo(500000);
  });
});
