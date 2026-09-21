import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { benchmarkLines } from './businessCenterOfferBenchmark';

// Строка сравнения с рынком — единственное место блока, где число
// встраивается в предложение, и падеж в ней разный: «к медиане класса B»,
// но «на уровне медианы класса B». Первая версия склеивала обе через одну
// подпись и выдала на проде «на уровне медиане Московского района».

const snapshot = (median: number, n = 40): MarketSnapshot => ({ median, n }) as MarketSnapshot;

const benchmark = {
  classLabel: 'класса B',
  classSnapshot: snapshot(1600),
  districtLabel: 'Московского района',
  districtSnapshot: snapshot(2000),
};

describe('benchmarkLines', () => {
  it('склоняет «медиана» под знак сравнения', () => {
    // toLocaleString ставит в разрядах неразрывный пробел — сравниваем по
    // обычному, иначе тест падает на невидимой разнице.
    const plain = (lines: string[]) => lines.map((line) => line.replace(/\u00a0/g, ' '));
    expect(plain(benchmarkLines(2000, 'sale', benchmark))).toEqual([
      '+25% к медиане класса B ($1 600/м²)',
      'на уровне медианы Московского района ($2 000/м²)',
    ]);
  });

  it('молчит про срез, который не набрал порога надёжности', () => {
    expect(benchmarkLines(2000, 'sale', { ...benchmark, districtSnapshot: snapshot(2000, 1) })).toHaveLength(1);
  });

  it('ничего не пишет без среза рынка', () => {
    expect(benchmarkLines(2000, 'sale', null)).toEqual([]);
  });
});
