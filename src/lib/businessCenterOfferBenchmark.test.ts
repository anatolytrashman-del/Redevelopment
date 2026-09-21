import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { benchmarkLine } from './businessCenterOfferBenchmark';

// Единственная фраза блока, где число встроено в предложение. Первая
// версия писала показателями («+25% к медиане класса B ($1 600/м²)») и
// заодно выдала на проде «на уровне медиане Московского района» —
// поэтому текст проверяется целиком, а не по частям.

const snapshot = (median: number, n = 40): MarketSnapshot => ({ median, n }) as MarketSnapshot;

const benchmark = {
  classLabel: 'по зданиям класса B',
  classSnapshot: snapshot(1600),
  districtLabel: 'по Московскому району',
  districtSnapshot: snapshot(2500),
};

describe('benchmarkLine', () => {
  it('пишет сравнение обычными словами', () => {
    expect(benchmarkLine(2000, benchmark)).toBe('На 25% дороже, чем в среднем по зданиям класса B');
    expect(benchmarkLine(1200, benchmark)).toBe('На 25% дешевле, чем в среднем по зданиям класса B');
  });

  it('разницу меньше 5% не выдаёт за разницу', () => {
    expect(benchmarkLine(1630, benchmark)).toBe('Столько же, сколько в среднем по зданиям класса B');
  });

  it('берёт район, когда среза по классу нет', () => {
    expect(benchmarkLine(2500, { ...benchmark, classLabel: null, classSnapshot: undefined })).toBe(
      'Столько же, сколько в среднем по Московскому району',
    );
  });

  it('молчит, когда срез не набрал порога надёжности', () => {
    expect(
      benchmarkLine(2000, {
        ...benchmark,
        classSnapshot: snapshot(1600, 1),
        districtSnapshot: snapshot(2500, 1),
      }),
    ).toBeNull();
  });

  it('ничего не пишет без среза рынка', () => {
    expect(benchmarkLine(2000, null)).toBeNull();
  });
});
