import { describe, expect, it } from 'vitest';
import type { RetailFloorEntry } from '../data/businessCenters';
import type { TenantOrganizationView } from '../data/businessCenterTenants';
import {
  NO_FLOOR,
  buildMatrix,
  collectFloors,
  countByFloor,
  defaultFloor,
  floorGuideText,
  floorHeading,
  floorPillLabel,
  groupByCategory,
  hasUnplacedOrgs,
  matchesQuery,
  searchOrganizations,
  toGuideOrgs,
} from './tradeCenterGuide';

function org(name: string, floor: string | null, industry: string | null = '1035'): TenantOrganizationView {
  return { name, rubric: null, industry, placement: null, floor, coords: null, rating: null, reviewCount: null, url: null };
}

const FLOORS_GUIDE: RetailFloorEntry[] = [
  { floor: '1', text: 'продуктовый супермаркет и аптека', date: null, source: null, sourceUrl: null },
  { floor: '2', text: 'одежда и обувь', date: null, source: null, sourceUrl: null },
];

describe('collectFloors / defaultFloor', () => {
  it('объединяет этажи floorsGuide и организаций, сверху вниз', () => {
    const orgs = toGuideOrgs([org('Mango', '2'), org('Sushi Wok', '-1'), org('Без этажа', null)]);
    const floors = collectFloors(FLOORS_GUIDE, orgs);
    expect(floors).toEqual(['2', '1', '-1']);
  });

  it('этаж по умолчанию — с максимумом организаций', () => {
    const orgs = toGuideOrgs([org('A', '1'), org('B', '1'), org('C', '2')]);
    const floors = collectFloors([], orgs);
    const counts = countByFloor(orgs);
    expect(defaultFloor(floors, counts)).toBe('1');
  });

  it('без организаций — первый этаж стопки', () => {
    const floors = collectFloors(FLOORS_GUIDE, []);
    expect(defaultFloor(floors, new Map())).toBe('2');
  });
});

describe('floorHeading / floorPillLabel', () => {
  it('подземный уровень называется отдельно', () => {
    expect(floorHeading('-1')).toBe('Подземный уровень −1');
    expect(floorHeading('1')).toBe('1 этаж');
    expect(floorHeading(NO_FLOOR)).toBe('Этаж не указан');
    expect(floorPillLabel('-1')).toBe('−1');
    expect(floorPillLabel(NO_FLOOR)).toBe('?');
  });
});

describe('floorGuideText', () => {
  it('берёт текст этажа и капитализирует', () => {
    expect(floorGuideText(FLOORS_GUIDE, '1')).toBe('Продуктовый супермаркет и аптека');
  });
  it('нет записи — null', () => {
    expect(floorGuideText(FLOORS_GUIDE, '3')).toBeNull();
  });
});

describe('groupByCategory', () => {
  it('группирует по направлению, сортирует по числу и алфавиту', () => {
    const orgs = toGuideOrgs([
      org('Zara', '1', '1035'),
      org('Mango', '1', '1035'),
      org('Sberbank', '1', '969'),
    ]);
    const groups = groupByCategory(orgs);
    expect(groups[0].count).toBe(2);
    expect(groups[0].orgs.map((o) => o.name)).toEqual(['Mango', 'Zara']);
  });
});

describe('matchesQuery / searchOrganizations', () => {
  it('без учёта регистра, ё=е, подстрока', () => {
    expect(matchesQuery('Ёлки-палки', 'елки')).toBe(true);
    expect(matchesQuery('Mango', 'man')).toBe(true);
    expect(matchesQuery('Zara', 'man')).toBe(false);
  });

  it('пустой запрос не даёт совпадений', () => {
    const orgs = toGuideOrgs([org('Mango', '1')]);
    expect(searchOrganizations(orgs, '   ')).toEqual([]);
  });

  it('ограничивает выдачу лимитом', () => {
    const orgs = toGuideOrgs(Array.from({ length: 12 }, (_, i) => org(`Магазин ${i}`, '1')));
    expect(searchOrganizations(orgs, 'магазин', 8)).toHaveLength(8);
  });
});

describe('hasUnplacedOrgs', () => {
  it('true, если хоть у одной нет этажа', () => {
    expect(hasUnplacedOrgs(toGuideOrgs([org('A', '1'), org('B', null)]))).toBe(true);
    expect(hasUnplacedOrgs(toGuideOrgs([org('A', '1')]))).toBe(false);
  });
});

describe('buildMatrix', () => {
  it('считает организации по направлению и этажу, этажи снизу вверх', () => {
    const orgs = toGuideOrgs([
      org('Mango', '2', '1035'),
      org('Zara', '1', '1035'),
      org('Sberbank', '1', '969'),
      org('Без этажа', null, '1035'),
    ]);
    const floors = collectFloors([], orgs);
    const matrix = buildMatrix(orgs, floors);
    expect(matrix.floors).toEqual(['1', '2']);
    const clothes = matrix.rows.find((r) => r.direction !== 'Другое' && r.counts['2'] === 1);
    expect(clothes?.counts['1']).toBe(1);
    expect(clothes?.total).toBe(2);
  });

  it('сворачивает хвост направлений в «Другое»', () => {
    // 12 РАЗНЫХ направлений (см. TENANT_DIRECTION_BY_INDUSTRY) — иначе
    // одинаковый industry схлопнется в одну группу ещё до матрицы.
    const industries = ['19532', '969', '7', '2', '5', '8', '6', '6547', '42903', '12', '9', '15'];
    const orgs = toGuideOrgs(industries.map((industry, i) => org(`Компания ${i}`, '1', industry)));
    const matrix = buildMatrix(orgs, ['1']);
    expect(matrix.rows).toHaveLength(11);
    expect(matrix.rows.at(-1)?.direction).toBe('Другое');
    expect(matrix.otherCount).toBe(2);
  });
});
