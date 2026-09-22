import { describe, expect, it } from 'vitest';
import type { BusinessCenterOffer } from '../data/businessCenterOffers';
import type { DedupedOffer } from './businessCenterOfferDuplicates';
import { buildDealStats, buildPriceBuckets, formatMoney } from './businessCenterOfferStats';

// Цифры этого файла попадают и в блок «Что сейчас сдают и продают», и в
// FAQ под ним, и при любой ошибке выглядят одинаково правдоподобно —
// поэтому проверяются сами правила: по каким помещениям считается цена и
// когда скидка за объём не скидка.

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

describe('формат', () => {
  it('округляет деньги по порядку суммы', () => {
    // toLocaleString разделяет разряды неразрывным пробелом — сравниваем
    // по обычному, иначе тест падает на невидимой разнице.
    const plain = (n: number) => formatMoney(n).replace(/\u00a0/g, ' ');
    expect(plain(3399)).toBe('$3 399');
    expect(plain(57614)).toBe('$57 600');
    expect(plain(1_240_000)).toBe('$1,2 млн');
  });
});

// Живой срез «Силуэта» на 2026-09-22 — здание, с которого владелец начал
// разговор про «не вау»: 26 лотов продажи, цена метра от $758 до $6 820
// при почти одинаковой площади.
const SILUET: DedupedOffer[] = (
  [
    [5.5, 1110.88], [5.7, 1042.93], [5.7, 3939.97], [5.7, 3491.23], [5.9, 4898.31],
    [6, 816.67], [6, 5250], [6.1, 757.98], [7, 6819.91], [7.7, 3896.1],
    [7.8, 5128.21], [7.8, 1016.19], [8.2, 4866.97], [9.6, 4644.31], [17.3, 867.05],
    [17.7, 903.95], [17.8, 4042.41], [19.3, 1300], [35.5, 1300], [40.7, 1449],
    [45.8, 1150], [47.2, 1150], [74.9, 1000], [75, 1000], [99.6, 845.55], [99.7, 1000],
  ] as [number, number][]
).map(([size, pricePerSqm], i) => offer({ adId: `sil-${i}`, size, pricePerSqm }));

// toLocaleString разделяет разряды неразрывным пробелом — сравниваем по
// обычному, иначе тест падает на невидимой разнице.
const labels = (b: { label: string }) => b.label.replace(/\u00a0/g, ' ');

describe('buildPriceBuckets', () => {
  it('раскладывает лоты по круглым порогам, не теряя и не задваивая их', () => {
    const buckets = buildPriceBuckets(buildDealStats(SILUET, 'sale')!)!;
    expect(buckets.map((b) => labels(b))).toEqual(['До $20 000', 'От $20 000 до $50 000', 'Дороже $50 000']);
    expect(buckets.map((b) => b.lots.length)).toEqual([8, 10, 8]);
    expect(buckets.reduce((acc, b) => acc + b.lots.length, 0)).toBe(SILUET.length);
    expect(new Set(buckets.flatMap((b) => b.lots.map((o) => o.id))).size).toBe(SILUET.length);
  });

  it('у аренды подписывает полку платежом в месяц', () => {
    const rent = [66, 43, 238, 83, 168, 620, 1270, 1003].map((total, i) =>
      offer({ adId: `r-${i}`, dealType: 'rent', size: 10, pricePerSqm: total / 10 }),
    );
    const buckets = buildPriceBuckets(buildDealStats(rent, 'rent')!)!;
    expect(buckets.map((b) => labels(b))).toEqual([
      'До $100 в месяц',
      'От $100 до $500 в месяц',
      'Дороже $500 в месяц',
    ]);
    expect(buckets.map((b) => b.lots.length)).toEqual([3, 2, 3]);
  });

  it('не дробит на полки то, что и так помещается на экран', () => {
    // Шесть лотов — это обычный список: полка ради двух строк только
    // добавляет клик.
    expect(buildPriceBuckets(buildDealStats(SILUET.slice(0, 6), 'sale')!)).toBeNull();
  });

  it('обходится двумя полками, когда круглый порог внутри данных один', () => {
    // Все лоты между $1 200 и $3 200: делить такую кучу на три части
    // можно только выдуманной границей вроде «до $1 700».
    const tight = [1200, 1500, 1800, 2200, 2500, 2800, 3200].map((total, i) =>
      offer({ adId: `t-${i}`, size: 10, pricePerSqm: total / 10 }),
    );
    const buckets = buildPriceBuckets(buildDealStats(tight, 'sale')!)!;
    expect(buckets.map((b) => labels(b))).toEqual(['До $2 000', 'Дороже $2 000']);
    expect(buckets.map((b) => b.lots.length)).toEqual([3, 4]);
  });

  it('предпочитает две ровные полки кривым трём', () => {
    // Royal Plaza: двадцать пять предложений аренды, двадцать из них
    // дешевле $5 000. Третий порог здесь даёт деление 19/1/5 — полка на
    // один лот из двадцати пяти не нужна никому.
    const royal = [
      2864, 2787, 2714, 2867, 2896, 2937, 2823, 3123, 2943, 3547, 3194, 3005, 3528,
      3444, 4386, 4399, 4271, 4747, 4523, 6911, 14352, 12510, 14354, 12852, 12755,
    ].map((total, i) => offer({ adId: `rp-${i}`, dealType: 'rent', size: 180, pricePerSqm: total / 180 }));
    const buckets = buildPriceBuckets(buildDealStats(royal, 'rent')!)!;
    expect(buckets.map((b) => labels(b))).toEqual(['До $5 000 в месяц', 'Дороже $5 000 в месяц']);
    expect(buckets.map((b) => b.lots.length)).toEqual([19, 6]);
  });
});
