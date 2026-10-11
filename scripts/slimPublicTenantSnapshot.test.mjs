import { describe, expect, it } from 'vitest';
import {
  slimPublicExtraFile,
  slimPublicTenantOrganization,
  slimPublicTenantSnapshot,
} from './slimPublicTenantSnapshot.mjs';

describe('slimPublicTenantOrganization', () => {
  it('выкидывает buildingUrl/buildingAddress и null-поля', () => {
    expect(
      slimPublicTenantOrganization({
        name: 'Climber',
        sourceId: '1',
        sourceUrl: 'https://yandex.by/maps/org/1/',
        category: 'Магазин одежды',
        rating: 4.7,
        reviewCount: null,
        rawText: 'Climber Магазин одежды Рейтинг 4,7 3 этаж',
        floor: '3',
        buildingUrl: 'https://yandex.by/maps/org/zamok/inside/',
        buildingAddress: 'г. Минск, просп. Победителей, 65',
      }),
    ).toEqual({
      name: 'Climber',
      sourceId: '1',
      sourceUrl: 'https://yandex.by/maps/org/1/',
      category: 'Магазин одежды',
      rating: 4.7,
      floor: '3',
    });
  });

  it('оставляет rawText, если этажа нет', () => {
    expect(
      slimPublicTenantOrganization({
        name: 'Банкомат',
        sourceId: null,
        sourceUrl: null,
        category: 'Банкомат',
        rating: null,
        reviewCount: null,
        rawText: 'Банкомат этаж 1',
        floor: null,
      }),
    ).toEqual({
      name: 'Банкомат',
      category: 'Банкомат',
      rawText: 'Банкомат этаж 1',
    });
  });

  it('оставляет rawText при этаже, если там офис/секция', () => {
    expect(
      slimPublicTenantOrganization({
        name: 'С-порт',
        sourceId: '2',
        sourceUrl: 'https://example.test',
        category: 'Спортивный комплекс',
        rating: 4.9,
        reviewCount: 224,
        rawText: 'С-порт секция 3, помещение 22, этаж цокольный',
        floor: 'цокольный',
      }),
    ).toMatchObject({
      floor: 'цокольный',
      rawText: 'С-порт секция 3, помещение 22, этаж цокольный',
    });
  });
});

describe('slimPublicTenantSnapshot / slimPublicExtraFile', () => {
  it('проходит по organizations и не трогает остальное', () => {
    const extra = slimPublicExtraFile({
      generatedAt: '2026-10-11T00:00:00Z',
      offers: [],
      nearby: [{ id: 1 }],
      tenants: {
        business_center_slug: 'zamok',
        organization_count: 2,
        organizations: [
          {
            name: 'A',
            floor: '1',
            rawText: 'A этаж 1',
            buildingUrl: 'https://x',
            buildingAddress: 'addr',
            sourceId: '1',
            sourceUrl: 'https://y',
            category: 'Магазин',
            rating: 5,
            reviewCount: 1,
          },
        ],
      },
    });
    expect(extra.nearby).toEqual([{ id: 1 }]);
    expect(extra.tenants.organizations[0]).toEqual({
      name: 'A',
      floor: '1',
      sourceId: '1',
      sourceUrl: 'https://y',
      category: 'Магазин',
      rating: 5,
      reviewCount: 1,
    });
    expect(slimPublicTenantSnapshot(null)).toBeNull();
  });
});
