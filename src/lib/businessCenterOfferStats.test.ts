import { describe, expect, it } from 'vitest';
import type { BusinessCenterOffer } from '../data/businessCenterOffers';
import type { DedupedOffer } from './businessCenterOfferDuplicates';
import { buildDealStats, buildYieldStats, formatLotsCount, formatMoney, formatYears } from './businessCenterOfferStats';

// Цифры этого файла попадают и в блок «Что сейчас сдают и продают», и в FAQ
// под ним, и обе они выглядят одинаково правдоподобно при любой ошибке —
// поэтому проверяется не форма, а сами правила: когда окупаемость считать
// нельзя и когда скидка за объём не скидка.

function offer(over: Partial<BusinessCenterOffer> & { adId: string }): DedupedOffer {
  return {
    id: `id-${over.adId}`,
    businessCenterSlug: 'saako',
    source: 'Kufar',
    dealType: 'sale',
    propertyType: 'Офисы',
    size: 100,
    pricePerSqm: 2000,
    floor: null,
    address: null,
    adLink: `https://example.test/${over.adId}`,
    updatedAt: '2026-09-19T00:00:00Z',
    alsoOn: [],
    ...over,
  };
}

// Живой срез «Саако» на 2026-09-19 после схлопывания дублей: пять лотов
// продажи и четыре аренды. На нём же владелец увидел нечитаемый диапазон
// «$1 364–$2 065», с которого начался разбор.
const SAAKO: DedupedOffer[] = [
  offer({ adId: 's1', size: 27.9, pricePerSqm: 2065, floor: 7 }),
  offer({ adId: 's2', size: 113.4, pricePerSqm: 2000, floor: 4 }),
  offer({ adId: 's3', size: 113.5, pricePerSqm: 2065, floor: 7 }),
  offer({ adId: 's4', size: 147.8, pricePerSqm: 2000, floor: 4 }),
  offer({ adId: 's5', size: 345, pricePerSqm: 1364, floor: 5 }),
  offer({ adId: 'r1', dealType: 'rent', size: 228, pricePerSqm: 14.91 }),
  offer({ adId: 'r2', dealType: 'rent', size: 563, pricePerSqm: 15 }),
  offer({ adId: 'r3', dealType: 'rent', size: 923.9, pricePerSqm: 15 }),
  offer({ adId: 'r4', dealType: 'rent', size: 3682.9, pricePerSqm: 15, floor: 3 }),
];

describe('buildDealStats', () => {
  it('сортирует лоты по площади и считает бюджет лота целиком', () => {
    const stats = buildDealStats(SAAKO, 'sale')!;
    expect(stats.count).toBe(5);
    expect(stats.lots.map((o) => o.size)).toEqual([27.9, 113.4, 113.5, 147.8, 345]);
    expect(stats.median).toBe(2000);
    expect(Math.round(stats.totalMin)).toBe(57614);
    expect(Math.round(stats.totalMax)).toBe(470580);
  });

  it('видит скидку за объём там, где цена метра падает с размером лота', () => {
    const discount = buildDealStats(SAAKO, 'sale')!.sizeDiscount!;
    expect(discount.smallSize).toBe(27.9);
    expect(discount.largeSize).toBe(345);
    expect(Math.round(discount.dropPct)).toBe(34);
  });

  it('не выдаёт за скидку случайную разницу двух лотов', () => {
    // Три лота — мало для вывода о связи, даже если цены различаются.
    const stats = buildDealStats(
      [
        offer({ adId: 'a', size: 30, pricePerSqm: 2000 }),
        offer({ adId: 'b', size: 60, pricePerSqm: 1500 }),
        offer({ adId: 'c', size: 90, pricePerSqm: 1200 }),
      ],
      'sale',
    )!;
    expect(stats.sizeDiscount).toBeNull();
  });

  it('считает цену по самому представленному типу, а не по всем лотам', () => {
    // Живой «Зелёный Луг»: четыре офиса, кладовая и точка сферы услуг в
    // одной выборке дают медиану, которая не описывает ни один из них.
    const stats = buildDealStats(
      [
        offer({ adId: 'o1', size: 15.2, pricePerSqm: 1282 }),
        offer({ adId: 'o2', size: 16.9, pricePerSqm: 2012 }),
        offer({ adId: 'o3', size: 38.2, pricePerSqm: 1193 }),
        offer({ adId: 'o4', size: 57.5, pricePerSqm: 1050 }),
        offer({ adId: 'k', size: 37.9, pricePerSqm: 654, propertyType: 'Кладовые' }),
        offer({ adId: 'u', size: 37.7, pricePerSqm: 690, propertyType: 'Сфера услуг' }),
      ],
      'sale',
    )!;
    expect(stats.count).toBe(6);
    expect(stats.priceType).toBe('Офисы');
    expect(stats.priceLots).toHaveLength(4);
    expect(stats.median).toBe(1237.5);
    expect(stats.minPrice).toBe(1050);
    // Бюджет — по всем лотам: купить можно и кладовую.
    expect(Math.round(stats.totalMin)).toBe(19486);
  });

  it('пропускает лоты без площади или ставки', () => {
    // Ноль здесь — «не указано», а не «бесплатно»: у рабочих мест и части
    // объявлений площадь не заполняется вовсе.
    const stats = buildDealStats(
      [offer({ adId: 'a' }), offer({ adId: 'b', size: 0 }), offer({ adId: 'c', pricePerSqm: 0 })],
      'sale',
    )!;
    expect(stats.count).toBe(1);
  });
});

describe('buildYieldStats', () => {
  it('считает окупаемость по одному типу помещения', () => {
    const y = buildYieldStats(SAAKO)!;
    expect(y.propertyType).toBe('Офисы');
    expect(y.salePricePerSqm).toBe(2000);
    expect(y.rentPricePerSqm).toBe(15);
    expect(Math.round(y.grossYieldPct * 10) / 10).toBe(9);
    expect(Math.round(y.paybackYears * 10) / 10).toBe(11.1);
  });

  it('молчит, когда площади продажи и аренды не пересекаются', () => {
    // Живой «Порт-2»: кабинет 18,5 м² в аренду против этажа 831 м² на
    // продажу давал 23% годовых — это сравнение розницы с оптом.
    const y = buildYieldStats([
      offer({ adId: 's', size: 831, pricePerSqm: 884, floor: 4 }),
      offer({ adId: 'r', dealType: 'rent', size: 18.5, pricePerSqm: 17.24, floor: 4 }),
    ]);
    expect(y).toBeNull();
  });

  it('молчит, когда доходность выходит за границы правдоподобия', () => {
    const y = buildYieldStats([
      offer({ adId: 's', size: 100, pricePerSqm: 5000 }),
      offer({ adId: 'r', dealType: 'rent', size: 100, pricePerSqm: 8 }),
    ]);
    expect(y).toBeNull();
  });

  it('не смешивает офисы с торговыми помещениями', () => {
    const y = buildYieldStats([
      offer({ adId: 's', size: 100, pricePerSqm: 2000, propertyType: 'Офисы' }),
      offer({ adId: 'r', dealType: 'rent', size: 100, pricePerSqm: 30, propertyType: 'Торговые помещения' }),
    ]);
    expect(y).toBeNull();
  });
});

describe('формат', () => {
  it('склоняет годы и лоты', () => {
    expect(formatYears(11.1)).toBe('11 лет');
    expect(formatYears(1)).toBe('1 год');
    expect(formatYears(2.4)).toBe('2 года');
    expect(formatLotsCount(1)).toBe('1 лот');
    expect(formatLotsCount(4)).toBe('4 лота');
    expect(formatLotsCount(11)).toBe('11 лотов');
  });

  it('округляет деньги по порядку суммы', () => {
    // toLocaleString разделяет разряды неразрывным пробелом — сравниваем
    // по обычному, иначе тест падает на невидимой разнице.
    const plain = (n: number) => formatMoney(n).replace(/\u00a0/g, ' ');
    expect(plain(3399)).toBe('$3 399');
    expect(plain(57614)).toBe('$57 600');
    expect(plain(1_240_000)).toBe('$1,2 млн');
  });
});
