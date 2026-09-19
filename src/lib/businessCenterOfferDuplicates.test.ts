import { describe, expect, it } from 'vitest';
import type { BusinessCenterOffer } from '../data/businessCenterOffers';
import { dedupeOffers } from './businessCenterOfferDuplicates';

// Число лотов — это то, что читатель видит первой строкой блока «Сейчас
// предлагается» («Аренда: 5 лотов»). Ошибка здесь не падает, а молча рисует
// зданию вдвое больше предложения, чем в нём есть, — поэтому тестом.

function offer(over: Partial<BusinessCenterOffer> & { adId: string; source: string }): BusinessCenterOffer {
  return {
    id: `${over.source}-${over.adId}`,
    businessCenterSlug: 'port',
    dealType: 'rent',
    propertyType: 'Офисы',
    size: 259.4,
    pricePerSqm: 13,
    floor: 1,
    address: 'Независимости пр, 177, Минск',
    adLink: `https://example.test/${over.adId}`,
    updatedAt: '2026-09-19T00:00:00Z',
    ...over,
  };
}

describe('dedupeOffers', () => {
  it('схлопывает один лот, выложенный на двух площадках', () => {
    const result = dedupeOffers([
      offer({ adId: '1', source: 'Realt', pricePerSqm: 13 }),
      offer({ adId: '2', source: 'Kufar', pricePerSqm: 13.21 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].alsoOn).toEqual([result[0].source === 'Kufar' ? 'Realt' : 'Kufar']);
  });

  it('оставляет как есть два объявления внутри одного источника', () => {
    // Четыре одинаковых кабинета по одной ставке у одного собственника —
    // реальный срез по «Центрополю». Это разные помещения, не дубли.
    const result = dedupeOffers([
      offer({ adId: '1', source: 'Kufar', size: 200, pricePerSqm: 11.47 }),
      offer({ adId: '2', source: 'Kufar', size: 200, pricePerSqm: 11.47 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((o) => o.alsoOn.length === 0)).toBe(true);
  });

  it('не путает аренду с продажей при одинаковой площади', () => {
    const result = dedupeOffers([
      offer({ adId: '1', source: 'Kufar', dealType: 'rent', pricePerSqm: 13 }),
      offer({ adId: '2', source: 'Realt', dealType: 'sale', pricePerSqm: 13 }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('считает разными лоты с одинаковой площадью, но разной ценой', () => {
    const result = dedupeOffers([
      offer({ adId: '1', source: 'Kufar', pricePerSqm: 13 }),
      offer({ adId: '2', source: 'Realt', pricePerSqm: 20 }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('считает разными лоты с разной площадью при одной цене', () => {
    const result = dedupeOffers([
      offer({ adId: '1', source: 'Kufar', size: 100 }),
      offer({ adId: '2', source: 'Realt', size: 120 }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('оставляет более полную запись и не зависит от порядка строк', () => {
    const rich = offer({ adId: '1', source: 'Realt', floor: 3, propertyType: 'Офисы' });
    const poor = offer({ adId: '2', source: 'Kufar', floor: null, propertyType: 'Без категории', address: null });
    const forward = dedupeOffers([rich, poor]);
    const backward = dedupeOffers([poor, rich]);
    expect(forward[0].id).toBe(rich.id);
    expect(backward[0].id).toBe(rich.id);
    expect(forward[0].floor).toBe(3);
  });

  it('три площадки с одним лотом дают один лот и две пометки', () => {
    const result = dedupeOffers([
      offer({ adId: '1', source: 'Realt' }),
      offer({ adId: '2', source: 'Kufar' }),
      offer({ adId: '3', source: 'Domovita' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].alsoOn).toHaveLength(2);
  });

  it('пустой вход — пустой выход', () => {
    expect(dedupeOffers(null)).toEqual([]);
    expect(dedupeOffers([])).toEqual([]);
  });
});
