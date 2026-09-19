import { describe, expect, it } from 'vitest';
import { buildTenantsFromSnapshot } from './businessCenterTenants';
import type { TenantSourceOrganization } from '../data/businessCenterTenants';

// Реальные карточки из среза «Порта» (просп. Независимости, 177) — с тем же
// мусором в рубрике и местом в rawText, что приезжает из источника.
const PORT: TenantSourceOrganization[] = [
  {
    name: 'Альфа-Вет',
    sourceId: '1685358461',
    sourceUrl: 'https://yandex.by/maps/org/alfa_vet/1685358461/gallery/',
    category: 'Ветеринарная клиника, ветеринарная лаборатория',
    rating: 5,
    reviewCount: 1155,
    rawText: 'Фото Альфа-Вет Рейтинг 5,0 1155 оценок Открыто до среды Ветеринарная клиника, ветеринарная лаборатория этаж цокольный',
  },
  {
    name: 'С-порт',
    sourceId: '1334736839',
    sourceUrl: 'https://yandex.by/maps/org/s_port/1334736839/gallery/',
    category: 'Спортивный комплекс секция 3, помещение 22,',
    rating: 4.9,
    reviewCount: 224,
    rawText: 'Фото С-порт Рейтинг 4,9 224 оценки Спортивный комплекс секция 3, помещение 22, этаж цокольный',
  },
  {
    name: 'Стеклофурнитура',
    sourceId: '1343436811',
    sourceUrl: null,
    category: 'Крепёжные изделия подъезд 3',
    rating: 4.4,
    reviewCount: 48,
    rawText: 'Крепёжные изделия подъезд 3 этаж 2',
  },
  {
    name: 'Банкомат Приорбанк',
    sourceId: '999',
    sourceUrl: null,
    category: 'Банкомат',
    rating: null,
    reviewCount: null,
    rawText: 'Банкомат этаж 1',
  },
  {
    name: 'Без оценок',
    sourceId: '1000',
    sourceUrl: null,
    category: 'Офис организации',
    rating: null,
    reviewCount: null,
    rawText: 'Офис организации этаж 4',
  },
];

describe('buildTenantsFromSnapshot', () => {
  const { tenants, amenities } = buildTenantsFromSnapshot(PORT);

  it('выносит оборудование из списка арендаторов', () => {
    expect(tenants.map((t) => t.name)).not.toContain('Банкомат Приорбанк');
    expect(amenities).toEqual([{ category: 'Банкомат', count: 1 }]);
  });

  it('подписывает оборудование по тому, что совпало, а не по рубрике «Офис организации»', () => {
    const { amenities: labels } = buildTenantsFromSnapshot([
      { name: 'Туалет', sourceId: '1', sourceUrl: null, category: 'Офис организации', rating: null, reviewCount: null, rawText: null },
      { name: 'M&m Express', sourceId: '2', sourceUrl: null, category: 'Постамат', rating: null, reviewCount: null, rawText: null },
    ]);
    expect(labels).toEqual([
      { category: 'Постамат', count: 1 },
      { category: 'Туалет', count: 1 },
    ]);
  });

  it('карточку самого здания в арендаторы не записывает', () => {
    const { tenants: list } = buildTenantsFromSnapshot(
      [{ name: 'Порт', sourceId: '3', sourceUrl: null, category: 'Бизнес-центр подъезд 1', rating: 4.5, reviewCount: 661, rawText: 'Бизнес-центр подъезд 1' }],
      'Бизнес-центр «Порт»',
    );
    expect(list).toEqual([]);
  });

  it('сортирует по числу оценок, а организации без оценок — в конец', () => {
    expect(tenants.map((t) => t.name)).toEqual(['Альфа-Вет', 'С-порт', 'Стеклофурнитура', 'Без оценок']);
  });

  it('чистит рубрику и достаёт место в здании', () => {
    expect(tenants[1].rubric).toBe('Спортивный комплекс');
    expect(tenants[1].placement).toBe('цокольный этаж, офис 22, подъезд 3');
    expect(tenants[2].rubric).toBe('Крепёжные изделия');
    expect(tenants[2].floor).toBe('2');
  });

  it('отрасль берёт по первой рубрике, «Офис организации» оставляет без отрасли', () => {
    expect(tenants[0].industry).toBe('746');
    expect(tenants[3].industry).toBeNull();
  });

  it('пустой срез — пустой список, без выдуманных нулей', () => {
    expect(buildTenantsFromSnapshot([])).toEqual({ tenants: [], amenities: [] });
  });
});

describe('вторые названия здания', () => {
  // В яндексовском срезе БЦ «V» лежат две организации с именем «Столица» и
  // пустой рубрикой — это карточки самого здания под его вторым именем
  // (alt_names), а не арендаторы. До 2026-09-20 они показывались в списке.
  const orgs = [
    { name: 'Столица', sourceId: null, sourceUrl: null, category: null, rating: null, reviewCount: null, rawText: null },
    { name: 'Столица', sourceId: null, sourceUrl: null, category: null, rating: null, reviewCount: null, rawText: null },
    { name: 'Atevi Systems', sourceId: null, sourceUrl: null, category: 'IT-компания', rating: null, reviewCount: null, rawText: null },
  ];

  it('выкидывает карточку здания под вторым именем', () => {
    const built = buildTenantsFromSnapshot(orgs, 'Бизнес-центр «V»', ['Столица']);
    expect(built.tenants.map((t) => t.name)).toEqual(['Atevi Systems']);
  });

  it('без вторых имён та же карточка остаётся арендатором — правило не срабатывает вслепую', () => {
    const built = buildTenantsFromSnapshot(orgs, 'Бизнес-центр «V»');
    expect(built.tenants.map((t) => t.name).sort()).toEqual(['Atevi Systems', 'Столица', 'Столица']);
  });

  it('одноимённая со зданием компания С рубрикой остаётся арендатором', () => {
    const built = buildTenantsFromSnapshot(
      [{ name: 'Столица', sourceId: null, sourceUrl: null, category: 'Кафе', rating: null, reviewCount: null, rawText: null }],
      'Бизнес-центр «V»',
      ['Столица'],
    );
    expect(built.tenants.map((t) => t.name)).toEqual(['Столица']);
  });
});

